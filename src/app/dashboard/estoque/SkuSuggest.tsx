"use client";

import { useState, useTransition } from "react";
import { PartCodesPanel } from "./ficha/PartCodesPanel";
import { lookupVehicleForPartsAction } from "./ficha/actions";

const smallInput =
  "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/** "Sugerir código" no cadastro da peça: a IA propõe, a pessoa escolhe "Usar como SKU" e só então salva. */
export function SkuSuggest({ partName, hasSku, onUse }: { partName: string; hasSku: boolean; onUse: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [vehicle, setVehicle] = useState({ marca: "", modelo: "", ano: "", versao: "" });
  const [plate, setPlate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (partName.trim().length < 2) return null;

  if (!open) {
    if (hasSku) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-11 w-fit rounded-xl border border-accent/50 px-4 text-sm font-semibold text-accent"
      >
        Sugerir código com IA
      </button>
    );
  }

  function lookup() {
    setMessage(null);
    startTransition(async () => {
      const result = await lookupVehicleForPartsAction(plate);
      if (!result.success || !result.vehicle) {
        setMessage(result.error ?? "Não achei esse veículo.");
        return;
      }
      setVehicle(result.vehicle);
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Sugerir código para &quot;{partName}&quot;</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">
          Fechar
        </button>
      </div>
      <p className="text-xs text-muted">Escolha o veículo (pela placa já cadastrada ou digitando) para a IA pesquisar o código certo.</p>
      <div className="flex gap-2">
        <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="Placa (opcional)" className={`${smallInput} flex-1 font-mono uppercase`} />
        <button type="button" onClick={lookup} disabled={isPending || !plate.trim()} className="h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50">
          Buscar
        </button>
      </div>
      {message ? <p className="text-xs text-danger">{message}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <input value={vehicle.marca} onChange={(e) => setVehicle((v) => ({ ...v, marca: e.target.value }))} placeholder="Marca" className={smallInput} />
        <input value={vehicle.modelo} onChange={(e) => setVehicle((v) => ({ ...v, modelo: e.target.value }))} placeholder="Modelo" className={smallInput} />
        <input value={vehicle.ano} onChange={(e) => setVehicle((v) => ({ ...v, ano: e.target.value }))} placeholder="Ano" inputMode="numeric" className={smallInput} />
        <input value={vehicle.versao} onChange={(e) => setVehicle((v) => ({ ...v, versao: e.target.value }))} placeholder="Versão / motor" className={smallInput} />
      </div>
      <PartCodesPanel
        vehicle={vehicle}
        part={partName}
        onUseCode={(code) => {
          onUse(code);
          setMessage(null);
        }}
      />
      <p className="text-xs text-muted">&quot;Usar como SKU&quot; só preenche o campo acima. A peça só é salva quando você clicar em Salvar.</p>
    </div>
  );
}
