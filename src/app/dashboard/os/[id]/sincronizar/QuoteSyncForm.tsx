"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL } from "@/lib/money";
import { computeSyncLines, type SyncLine } from "@/lib/workOrders/quoteSync";
import type { QuoteSyncAdjustments, QuoteSyncPreview } from "@/lib/workOrders/quoteSyncService";
import { applyQuoteSyncAction } from "../../quoteSyncActions";

type Available = Extract<QuoteSyncPreview, { available: true }>;

const TYPE_LABEL: Record<string, string> = { SERVICO: "Serviço", PECA: "Peça", MAO_DE_OBRA: "Mão de obra" };

function adjustmentText(a: QuoteSyncAdjustments): string {
  const part = (label: string, type: string | null, value: number | null) =>
    type && value ? `${label} ${type === "PERCENTUAL" ? `${(value / 100).toFixed(2).replace(".", ",")}%` : formatBRL(value)}` : null;
  return [part("Desconto", a.discountType, a.discountValue), part("Acréscimo", a.surchargeType, a.surchargeValue)].filter(Boolean).join(" · ") || "nenhum";
}

function lineKey(line: SyncLine): string {
  return line.kind === "PAIR" ? `p:${line.osItem.id}` : line.kind === "REMOVE" ? `r:${line.osItem.id}` : `a:${line.quoteItem.id}`;
}

/** Marcação inicial de cada linha: mudanças e itens novos marcados (menos os que parecem adicional já existente); retiradas não. */
function defaultChecked(line: SyncLine): boolean {
  if (line.kind === "PAIR") return !line.same;
  if (line.kind === "REMOVE") return false;
  return !line.duplicateOf;
}

/** Comparação da OS com a versão nova do orçamento: você confere linha a linha e escolhe o que aplicar. */
export function QuoteSyncForm({ workOrderId, preview }: { workOrderId: string; preview: Available }) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {};
    for (const o of preview.osItems) initial[o.id] = preview.autoPairs[o.id] ?? null;
    return initial;
  });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [syncAdjustments, setSyncAdjustments] = useState(preview.adjustmentsDiffer);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const lines = useMemo(() => computeSyncLines(preview.osItems, preview.quoteItems, pairs, preview.additionals), [preview, pairs]);
  const isOn = (line: SyncLine) => checked[lineKey(line)] ?? defaultChecked(line);

  function changePair(osItemId: string, quoteItemId: string | null) {
    setPairs((prev) => {
      const next = { ...prev, [osItemId]: quoteItemId };
      // Um item do orçamento só pareia com uma linha da OS.
      if (quoteItemId) for (const k of Object.keys(next)) if (k !== osItemId && next[k] === quoteItemId) next[k] = null;
      return next;
    });
    setChecked((prev) => {
      const next = { ...prev };
      delete next[`p:${osItemId}`];
      delete next[`r:${osItemId}`];
      return next;
    });
  }

  const updates = lines.filter((l) => l.kind === "PAIR" && (l.same || isOn(l))) as Extract<SyncLine, { kind: "PAIR" }>[];
  const removals = lines.filter((l) => l.kind === "REMOVE" && isOn(l)) as Extract<SyncLine, { kind: "REMOVE" }>[];
  const additions = lines.filter((l) => l.kind === "ADD" && isOn(l)) as Extract<SyncLine, { kind: "ADD" }>[];
  const changed = updates.filter((l) => !l.same).length;
  const nothing = changed === 0 && removals.length === 0 && additions.length === 0 && !(preview.adjustmentsDiffer && syncAdjustments);

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await applyQuoteSyncAction(workOrderId, {
        updates: updates.map((l) => ({ osItemId: l.osItem.id, quoteItemId: l.quoteItem.id })),
        removals: removals.map((l) => l.osItem.id),
        additions: additions.map((l) => l.quoteItem.id),
        syncAdjustments: preview.adjustmentsDiffer && syncAdjustments,
      });
      if (!result.success || !result.result) {
        setError(result.error ?? "Não foi possível sincronizar.");
        return;
      }
      const r = result.result;
      setDone(
        `Pronto: ${r.updated} item(ns) com valor atualizado, ${r.descriptionsOnly} só com a descrição corrigida, ${r.removed} cancelado(s), ${r.added} novo(s).` +
          (r.skipped.length ? ` Não mudaram: ${r.skipped.join(" ")}` : ""),
      );
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm font-semibold text-success">OS atualizada com a versão {preview.toVersionNumber} do orçamento.</p>
        <p className="text-sm">{done}</p>
        <Link href={`/dashboard/os/${workOrderId}/detalhes`} className="text-sm font-medium text-accent">
          Voltar para a OS →
        </Link>
      </div>
    );
  }

  const quoteOptions = preview.quoteItems;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        A OS {preview.workOrderNumber} veio da versão {preview.fromVersionNumber} do orçamento. A versão {preview.toVersionNumber} já foi aprovada. Confira cada linha: o
        que está marcado será aplicado. Itens já executados nunca mudam de valor, e os adicionais da OS não são tocados.
      </p>

      <ul className="flex flex-col gap-3">
        {lines.map((line) => {
          const key = lineKey(line);
          const on = isOn(line);
          const toggle = (value: boolean) => setChecked((prev) => ({ ...prev, [key]: value }));

          if (line.kind === "ADD") {
            return (
              <li key={key} className="rounded-xl border border-border bg-background p-3 text-sm">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span>
                    <span className="block text-[11px] font-semibold uppercase text-success">Item novo na versão {preview.toVersionNumber}</span>
                    <span className="block font-medium">
                      {line.quoteItem.description} — {formatBRL(line.quoteItem.totalCents)}
                    </span>
                    <span className="block text-xs text-muted">
                      {TYPE_LABEL[line.quoteItem.type] ?? line.quoteItem.type} · {line.quoteItem.quantity} × {formatBRL(line.quoteItem.unitPriceCents)} · entra como planejado
                    </span>
                    {line.duplicateOf ? (
                      <span className="mt-1 block rounded-lg bg-accent/15 p-2 text-xs font-medium">
                        Atenção: parece o adicional &quot;{line.duplicateOf.description}&quot; ({formatBRL(line.duplicateOf.totalCents)}) que já está na OS. Se for o mesmo
                        serviço, deixe desmarcado para não cobrar duas vezes.
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          }

          const osItem = line.osItem;
          const selected = pairs[osItem.id] ?? "";
          return (
            <li key={key} className="rounded-xl border border-border bg-background p-3 text-sm">
              <div className="mb-2 flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase text-muted">
                  Na OS · {TYPE_LABEL[osItem.type] ?? osItem.type} · {osItem.status === "EXECUTADO" ? "executado" : "planejado"}
                </span>
                <span className="font-medium">
                  {osItem.description} — {formatBRL(osItem.totalCents)}
                </span>
                <span className="text-xs text-muted">
                  {osItem.quantity} × {formatBRL(osItem.unitPriceCents)}
                </span>
              </div>

              <label className="mb-2 flex flex-col gap-1 text-[11px] text-muted">
                Corresponde, na versão {preview.toVersionNumber}, a:
                <select
                  value={selected}
                  onChange={(e) => changePair(osItem.id, e.target.value || null)}
                  className="h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
                >
                  <option value="">— nenhum (saiu do orçamento)</option>
                  {quoteOptions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.description} — {formatBRL(q.totalCents)}
                    </option>
                  ))}
                </select>
              </label>

              {line.kind === "REMOVE" ? (
                line.canApply ? (
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-5 w-5" />
                    <span className="text-xs">
                      <strong>Cancelar este item na OS</strong> (ele não está na versão {preview.toVersionNumber}). Confira o par acima antes de marcar.
                    </span>
                  </label>
                ) : (
                  <p className="rounded-lg bg-accent/10 p-2 text-xs">{line.blockedNote}</p>
                )
              ) : line.same ? (
                <p className="text-xs text-muted">Sem mudanças neste item.</p>
              ) : (
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-5 w-5" />
                  <span className="flex flex-col gap-0.5 text-xs">
                    <strong>Aplicar na OS:</strong>
                    {line.changes.description ? (
                      <span>
                        Descrição: &quot;{line.changes.description.from}&quot; → &quot;{line.changes.description.to}&quot;
                      </span>
                    ) : null}
                    {line.changes.unitPrice ? (
                      <span>
                        Valor por unidade: {formatBRL(line.changes.unitPrice.from)} → {formatBRL(line.changes.unitPrice.to)}
                      </span>
                    ) : null}
                    {line.changes.quantity ? (
                      <span>
                        Quantidade: {line.changes.quantity.from} → {line.changes.quantity.to}
                      </span>
                    ) : null}
                    {line.blockedNote ? <span className="mt-1 rounded-lg bg-accent/10 p-2">{line.blockedNote}</span> : null}
                  </span>
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {preview.adjustmentsDiffer ? (
        <label className="flex items-start gap-3 rounded-xl border border-border bg-background p-3 text-sm">
          <input type="checkbox" checked={syncAdjustments} onChange={(e) => setSyncAdjustments(e.target.checked)} className="mt-1 h-5 w-5" />
          <span className="text-xs">
            <strong>Desconto e acréscimo da versão {preview.toVersionNumber}</strong>
            <span className="block text-muted">Hoje na OS: {adjustmentText(preview.currentAdjustments)}</span>
            <span className="block text-muted">Na versão nova: {adjustmentText(preview.newAdjustments)}</span>
          </span>
        </label>
      ) : null}

      <div className="rounded-xl bg-surface p-3 text-xs">
        Vai acontecer: {changed} item(ns) atualizado(s), {removals.length} cancelado(s), {additions.length} novo(s)
        {preview.adjustmentsDiffer && syncAdjustments ? ", e o desconto/acréscimo da versão nova" : ""}.
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={isPending || nothing}
          className="h-12 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Atualizando…" : "Atualizar a OS"}
        </button>
        <Link href={`/dashboard/os/${workOrderId}/detalhes`} className="flex h-12 items-center rounded-xl border border-border px-5 text-sm font-medium">
          Voltar
        </Link>
      </div>
    </div>
  );
}
