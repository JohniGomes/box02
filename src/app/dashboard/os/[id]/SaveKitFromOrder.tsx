"use client";

import { useState } from "react";
import { saveServiceKitAction } from "../../configuracoes/servicos/actions";

export interface KitServiceOption {
  serviceId: string;
  description: string;
}

export interface KitLineOption {
  id: string;
  type: "PECA" | "MAO_DE_OBRA";
  description: string;
  quantity: string;
  /** Só a mão de obra guarda valor no kit. */
  unitPriceReais?: string;
  partId: string | null;
}

/** "Salvar como kit" na OS: guarda as peças e a mão de obra desta OS como o kit usual de um serviço. */
export function SaveKitFromOrder({ services, lines }: { services: KitServiceOption[]; lines: KitLineOption[] }) {
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.serviceId ?? "");
  const [included, setIncluded] = useState<Record<string, boolean>>(() => Object.fromEntries(lines.map((l) => [l.id, true])));
  const [fixed, setFixed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (services.length === 0 || lines.length === 0) return null;

  async function save() {
    setMessage(null);
    setBusy(true);
    const result = await saveServiceKitAction(
      serviceId,
      lines
        .filter((l) => included[l.id])
        .map((l) => ({
          type: l.type,
          description: l.description,
          quantity: l.quantity,
          unitPriceReais: l.type === "MAO_DE_OBRA" ? l.unitPriceReais : undefined,
          partId: l.partId ?? undefined,
          fixedPart: l.type === "PECA" ? Boolean(fixed[l.id]) && Boolean(l.partId) : undefined,
        })),
    );
    setBusy(false);
    if (!result.success) {
      setMessage(result.error ?? "Não foi possível salvar o kit.");
      return;
    }
    setOpen(false);
    setMessage(`Kit salvo com ${result.count} linha(s). Da próxima vez é só aplicar no orçamento.`);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border bg-background p-3 text-xs">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-fit font-medium text-accent">
        {open ? "Fechar" : "Salvar como kit"}
      </button>
      {open ? (
        <>
          <p className="text-muted">
            Guarda as peças e a mão de obra desta OS como o kit usual de um serviço. Marque as peças <strong>genéricas</strong> (óleo,
            filtro, fluido) para ficarem fixas; as outras viram &quot;vaga a escolher do estoque&quot;. Só o valor da mão de obra é guardado.
          </p>
          {services.length > 1 ? (
            <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="h-10 rounded-lg border border-border bg-surface px-3 text-sm">
              {services.map((s) => (
                <option key={s.serviceId} value={s.serviceId}>
                  Kit do serviço: {s.description}
                </option>
              ))}
            </select>
          ) : (
            <p className="font-medium">Kit do serviço: {services[0].description}</p>
          )}
          {lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(included[l.id])}
                  onChange={(e) => setIncluded((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span>
                  {l.type === "PECA" ? "Peça" : "Mão de obra"}: {l.description} ({l.quantity})
                </span>
              </label>
              {l.type === "PECA" && included[l.id] ? (
                <label className="flex items-center gap-1 text-muted">
                  <input
                    type="checkbox"
                    disabled={!l.partId}
                    checked={Boolean(fixed[l.id]) && Boolean(l.partId)}
                    onChange={(e) => setFixed((prev) => ({ ...prev, [l.id]: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {l.partId ? "fixa (genérica)" : "sem peça do estoque: vira vaga"}
                </label>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={save}
            disabled={busy || !lines.some((l) => included[l.id])}
            className="h-9 w-fit rounded-lg bg-accent px-4 font-semibold text-accent-foreground disabled:opacity-50"
          >
            Guardar kit (substitui o kit atual)
          </button>
        </>
      ) : null}
      {message ? <p className="text-muted">{message}</p> : null}
    </div>
  );
}
