"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkOrderChecklistItemStatusAction } from "../checklistActions";

export interface ChecklistItemForTable {
  id: string;
  description: string;
  required: boolean;
  status: "OK" | "ATENCAO" | "NA" | null;
  observacao: string | null;
}

/** Tabela de itens no estilo da planilha em papel (CHK-001/CHK-006).
 * `variant="tri"` mostra as 3 colunas OK/Atenção/N/A (CHK-001);
 * `variant="simple"` mostra só OK, igual ao CHK-006 em papel. */
export function ChecklistItemsTable({
  workOrderId,
  workOrderChecklistId,
  items,
  variant,
  locked,
}: {
  workOrderId: string;
  workOrderChecklistId: string;
  items: ChecklistItemForTable[];
  variant: "tri" | "simple";
  locked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  function setStatus(itemId: string, status: "OK" | "ATENCAO" | "NA", observacao: string | undefined) {
    const item = items.find((i) => i.id === itemId);
    const next = item?.status === status ? null : status;
    startTransition(async () => {
      await setWorkOrderChecklistItemStatusAction(workOrderId, workOrderChecklistId, itemId, next, observacao);
      router.refresh();
    });
  }

  function blurObservacao(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item?.status) return;
    const draft = drafts[itemId];
    if (draft === undefined || draft === (item.observacao ?? "")) return;
    startTransition(async () => {
      await setWorkOrderChecklistItemStatusAction(workOrderId, workOrderChecklistId, itemId, item.status, draft);
      router.refresh();
    });
  }

  const canEdit = !locked && !isPending;

  return (
    <table className="w-full border-collapse overflow-hidden rounded-xl border border-border text-sm">
      <thead>
        <tr className="bg-foreground text-white">
          <th className="px-3 py-2 text-left text-xs font-bold">ITEM</th>
          {variant === "tri" ? (
            <>
              <th className="w-14 px-2 py-2 text-center text-xs font-bold">OK</th>
              <th className="w-16 px-2 py-2 text-center text-xs font-bold">ATENÇÃO</th>
              <th className="w-14 px-2 py-2 text-center text-xs font-bold">N/A</th>
            </>
          ) : (
            <th className="w-14 px-2 py-2 text-center text-xs font-bold">OK</th>
          )}
          <th className="px-3 py-2 text-left text-xs font-bold">OBSERVAÇÃO</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={item.id} className={idx % 2 === 0 ? "bg-surface" : "bg-background"}>
            <td className="border-t border-border px-3 py-2 align-top">
              {item.description}
              {item.required ? <span className="ml-1 text-[10px] text-danger">obrigatório</span> : null}
            </td>
            {variant === "tri" ? (
              <>
                <Cell
                  checked={item.status === "OK"}
                  disabled={!canEdit}
                  onClick={() => setStatus(item.id, "OK", drafts[item.id] ?? item.observacao ?? undefined)}
                  color="success"
                />
                <Cell
                  checked={item.status === "ATENCAO"}
                  disabled={!canEdit}
                  onClick={() => setStatus(item.id, "ATENCAO", drafts[item.id] ?? item.observacao ?? undefined)}
                  color="accent"
                />
                <Cell
                  checked={item.status === "NA"}
                  disabled={!canEdit}
                  onClick={() => setStatus(item.id, "NA", drafts[item.id] ?? item.observacao ?? undefined)}
                  color="muted"
                />
              </>
            ) : (
              <Cell
                checked={item.status === "OK"}
                disabled={!canEdit}
                onClick={() => setStatus(item.id, "OK", drafts[item.id] ?? item.observacao ?? undefined)}
                color="success"
              />
            )}
            <td className="border-t border-border px-2 py-1.5 align-top">
              <input
                value={drafts[item.id] ?? item.observacao ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                onBlur={() => blurObservacao(item.id)}
                disabled={!canEdit}
                placeholder="—"
                className="h-8 w-full min-w-[140px] rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-accent disabled:opacity-60"
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({
  checked,
  disabled,
  onClick,
  color,
}: {
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
  color: "success" | "accent" | "muted";
}) {
  const colorClass =
    color === "success" ? "border-success bg-success/20" : color === "accent" ? "border-accent bg-accent/20" : "border-muted bg-muted/20";
  return (
    <td className="border-t border-border px-2 py-2 text-center align-top">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={checked}
        className={`h-6 w-6 rounded border-2 disabled:opacity-50 ${checked ? colorClass : "border-border bg-background"}`}
      >
        {checked ? "✓" : ""}
      </button>
    </td>
  );
}
