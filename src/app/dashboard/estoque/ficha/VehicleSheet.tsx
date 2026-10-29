"use client";

import { useState, useTransition } from "react";
import { buildVehicleSheetText, vinModelYear } from "@/lib/vehicles/sheet";
import { saveVehicleSheetAction } from "./actions";
import { PartCodesPanel } from "./PartCodesPanel";

const inputClass =
  "h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

const AUTO_EXPERTS_URL = "https://www.autoexperts.parts/pt/br";

interface SheetValues {
  brand: string;
  model: string;
  version: string;
  yearManufacture: string;
  yearModel: string;
  plate: string;
  chassis: string;
}

/** Ficha editável do veículo: copiar para o fornecedor, enviar no WhatsApp e consultar o catálogo. */
export function VehicleSheet({ vehicleId, initial }: { vehicleId: string | null; initial: SheetValues }) {
  const [v, setV] = useState<SheetValues>(initial);
  const [part, setPart] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const text = buildVehicleSheetText({ ...v, part });
  const yearFromVin = vinModelYear(v.chassis);

  function set<K extends keyof SheetValues>(key: K, value: SheetValues[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
  }

  async function copy() {
    setMessage(null);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Não consegui copiar. Selecione o texto abaixo e copie à mão.");
    }
  }

  function save() {
    if (!vehicleId) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveVehicleSheetAction(vehicleId, {
        brand: v.brand || undefined,
        model: v.model || undefined,
        version: v.version || undefined,
        yearManufacture: v.yearManufacture || undefined,
        yearModel: v.yearModel || undefined,
        chassis: v.chassis || undefined,
      });
      setMessage(result.success ? "Salvo no cadastro do veículo." : (result.error ?? "Não foi possível salvar."));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Marca">
          <input value={v.brand} onChange={(e) => set("brand", e.target.value)} className={inputClass} placeholder="Ex.: Volkswagen" />
        </Field>
        <Field label="Modelo">
          <input value={v.model} onChange={(e) => set("model", e.target.value)} className={inputClass} placeholder="Ex.: Gol" />
        </Field>
        <Field label="Versão / motor">
          <input value={v.version} onChange={(e) => set("version", e.target.value)} className={inputClass} placeholder="Ex.: 1.0 flex" />
        </Field>
        <Field label="Placa">
          <input value={v.plate} onChange={(e) => set("plate", e.target.value)} className={`${inputClass} uppercase`} placeholder="ABC1D23" />
        </Field>
        <Field label="Ano de fabricação">
          <input value={v.yearManufacture} onChange={(e) => set("yearManufacture", e.target.value)} inputMode="numeric" className={inputClass} placeholder="2015" />
        </Field>
        <Field label="Ano do modelo">
          <input value={v.yearModel} onChange={(e) => set("yearModel", e.target.value)} inputMode="numeric" className={inputClass} placeholder="2016" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Chassi (a balconista costuma pedir)">
            <input value={v.chassis} onChange={(e) => set("chassis", e.target.value)} className={`${inputClass} uppercase`} placeholder="17 caracteres" />
          </Field>
          {yearFromVin && String(yearFromVin) !== v.yearModel ? (
            <p className="mt-1 text-xs text-muted">
              Pelo chassi, o ano do modelo seria <strong>{yearFromVin}</strong> (é só uma sugestão).{" "}
              <button type="button" onClick={() => set("yearModel", String(yearFromVin))} className="font-semibold text-accent underline">
                Usar
              </button>
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <Field label="Peça que você quer comprar (opcional)">
            <input value={part} onChange={(e) => setPart(e.target.value)} className={inputClass} placeholder="Ex.: pastilha de freio dianteira" />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Texto para o fornecedor</p>
        <pre className="whitespace-pre-wrap break-words text-sm">{text}</pre>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={copy} className="h-12 flex-1 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
          {copied ? "Copiado!" : "Copiar para o fornecedor"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold"
        >
          Enviar no WhatsApp
        </a>
        <a
          href={AUTO_EXPERTS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold"
        >
          Buscar no Auto Experts ↗
        </a>
      </div>

      {vehicleId ? (
        <button
          onClick={save}
          disabled={isPending}
          className="h-11 rounded-xl border border-border text-sm font-medium disabled:opacity-50"
        >
          {isPending ? "Salvando…" : "Salvar estes dados no cadastro do veículo"}
        </button>
      ) : null}
      {message ? <p className="text-xs text-muted">{message}</p> : null}
      <PartCodesPanel vehicle={{ marca: v.brand, modelo: v.model, ano: v.yearModel || v.yearManufacture, versao: v.version }} part={part} />
      <p className="text-xs text-muted">
        O Auto Experts é um catálogo gratuito de algumas marcas (Frasle e outras). Ele abre em outra aba: escolha montadora,
        veículo, ano e versão para achar o código. Sempre confirme o código com o fornecedor antes de comprar.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
