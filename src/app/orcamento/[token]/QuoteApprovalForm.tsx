"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";
import { submitQuoteDecisionAction } from "./actions";

type ItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";
type BlockDecision = "APROVADO" | "RECUSADO";

interface ItemForApproval {
  id: string;
  type: "SERVICO" | "PECA" | "MAO_DE_OBRA";
  description: string;
  notes?: string | null;
  customerSupplied?: boolean;
  totalCents: number;
  category: ItemCategory;
  /** Itens com a mesma chave formam um bloco (serviço + peças + mão de obra). */
  groupKey?: string | null;
}

interface Block {
  id: string;
  title: string;
  category: Exclude<ItemCategory, "INFORMATIVO">;
  items: ItemForApproval[];
  totalCents: number;
}

const ITEM_TYPE_LABEL: Record<string, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

/** Agrupa os itens decidíveis em blocos: o serviço com suas peças e mão de obra. */
function buildBlocks(items: ItemForApproval[]): Block[] {
  const blocks: Block[] = [];
  const byGroup = new Map<string, Block>();
  for (const item of items) {
    if (item.category === "INFORMATIVO") continue;
    const cat = item.category as Block["category"];
    if (item.groupKey) {
      let block = byGroup.get(item.groupKey);
      if (!block) {
        block = { id: `g:${item.groupKey}`, title: item.description, category: cat, items: [], totalCents: 0 };
        byGroup.set(item.groupKey, block);
        blocks.push(block);
      }
      block.items.push(item);
      block.totalCents += item.totalCents;
      // O título é o serviço do bloco; a categoria mais importante vence.
      if (item.type === "SERVICO") block.title = item.description;
      if (cat === "NECESSARIO") block.category = "NECESSARIO";
    } else {
      blocks.push({ id: `i:${item.id}`, title: item.description, category: cat, items: [item], totalCents: item.totalCents });
    }
  }
  return blocks;
}

export function QuoteApprovalForm({
  token,
  items,
  defaultApproverName,
}: {
  token: string;
  items: ItemForApproval[];
  defaultApproverName?: string;
}) {
  const informativos = items.filter((i) => i.category === "INFORMATIVO");
  const blocks = buildBlocks(items);
  const necessarios = blocks.filter((b) => b.category === "NECESSARIO");
  const recomendados = blocks.filter((b) => b.category === "RECOMENDADO");

  // Tudo já vem aprovado: o cliente só desmarca o que não quer.
  const [decisions, setDecisions] = useState<Record<string, BlockDecision>>(
    Object.fromEntries(blocks.map((b) => [b.id, "APROVADO" as BlockDecision])),
  );
  const [approverName, setApproverName] = useState(defaultApproverName ?? "");
  const [approverDocument, setApproverDocument] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasAnyRejection = blocks.some((b) => decisions[b.id] === "RECUSADO");
  const approvedTotal = blocks.filter((b) => decisions[b.id] === "APROVADO").reduce((sum, b) => sum + b.totalCents, 0);
  const totalAutorizavel = blocks.reduce((sum, b) => sum + b.totalCents, 0);
  const informativeTotal = informativos.reduce((sum, i) => sum + i.totalCents, 0);

  function setAll(decision: BlockDecision) {
    setDecisions(Object.fromEntries(blocks.map((b) => [b.id, decision])));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    // A decisão do bloco vale para cada item dele; o registro continua item por item.
    const result = await submitQuoteDecisionAction(token, {
      itemDecisions: blocks.flatMap((b) => b.items.map((i) => ({ itemId: i.id, decision: decisions[b.id] }))),
      approverName,
      approverDocument: approverDocument || undefined,
      reason: hasAnyRejection ? reason || undefined : undefined,
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível registrar sua decisão.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
        <p className="text-base font-semibold text-success">Decisão registrada com sucesso.</p>
        <p className="mt-1 text-sm text-muted">A oficina poderá consultar sua decisão.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {blocks.length > 0 ? (
        <div className="rounded-xl bg-background p-3 text-sm">
          <p>
            Tudo já vem <strong>aprovado</strong>. Se não quiser algum serviço, é só desmarcar. Depois confirme lá embaixo.
          </p>
          <div className="mt-2 flex gap-4 text-xs">
            <button type="button" onClick={() => setAll("APROVADO")} className="font-semibold text-success underline">
              Aprovar tudo
            </button>
            <button type="button" onClick={() => setAll("RECUSADO")} className="font-semibold text-danger underline">
              Recusar tudo
            </button>
          </div>
        </div>
      ) : null}

      {necessarios.length > 0 ? (
        <BlockSection
          title="Necessário"
          description="Corrige o problema identificado."
          accentClass="border-danger/40 bg-danger/5"
          badgeClass="bg-danger/15 text-danger"
          blocks={necessarios}
          decisions={decisions}
          setDecisions={setDecisions}
        />
      ) : null}

      {recomendados.length > 0 ? (
        <BlockSection
          title="Recomendado"
          description="Desgaste ou atenção — não impede o necessário, mas vale considerar."
          accentClass="border-accent/40 bg-accent/5"
          badgeClass="bg-accent/15 text-foreground"
          blocks={recomendados}
          decisions={decisions}
          setDecisions={setDecisions}
        />
      ) : null}

      {informativos.length > 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold">Informativo</h3>
          <p className="mt-0.5 text-xs text-muted">
            Só para você saber — não precisa aprovar nem recusar, e nunca é cobrado agora.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {informativos.map((item) => (
              <li key={item.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
                  {item.totalCents > 0 ? (
                    <span className="text-xs text-muted">valor estimado: {formatBRL(item.totalCents)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm">
                  {item.description}
                  {item.customerSupplied ? <span className="ml-1 text-xs text-muted">(peça do cliente — sem cobrança)</span> : null}
                </p>
                {item.notes ? <p className="mt-1 whitespace-pre-line text-xs text-muted">{item.notes}</p> : null}
              </li>
            ))}
          </ul>
          {informativeTotal > 0 ? (
            <p className="mt-3 text-xs text-muted">
              Valor estimado informativo: {formatBRL(informativeTotal)} — não entra no total cobrável.
            </p>
          ) : null}
        </div>
      ) : null}

      {blocks.length > 0 ? (
        <div className="rounded-xl bg-background p-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Total autorizável (necessário + recomendado)</span>
            <span>{formatBRL(totalAutorizavel)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>Total que você está aprovando</span>
            <span>{formatBRL(approvedTotal)}</span>
          </div>
        </div>
      ) : null}

      {blocks.length === 0 ? (
        <p className="text-center text-sm text-muted">
          Este orçamento tem só itens informativos — nenhuma decisão é necessária.
        </p>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverName">
              Seu nome
            </label>
            <input
              id="approverName"
              value={approverName}
              onChange={(e) => setApproverName(e.target.value)}
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="Nome completo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="approverDocument">
              CPF/CNPJ (opcional)
            </label>
            <input
              id="approverDocument"
              value={approverDocument}
              onChange={(e) => setApproverDocument(e.target.value)}
              inputMode="numeric"
              className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
            />
          </div>
          {hasAnyRejection ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="reason">
                Motivo da recusa (opcional)
              </label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {blocks.length > 0 ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!approverName.trim() || submitting}
          className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? "Enviando…" : approvedTotal === totalAutorizavel ? "Confirmar e aprovar tudo" : "Confirmar decisão"}
        </button>
      ) : null}
    </div>
  );
}

function BlockSection({
  title,
  description,
  accentClass,
  badgeClass,
  blocks,
  decisions,
  setDecisions,
}: {
  title: string;
  description: string;
  accentClass: string;
  badgeClass: string;
  blocks: Block[];
  decisions: Record<string, BlockDecision>;
  setDecisions: React.Dispatch<React.SetStateAction<Record<string, BlockDecision>>>;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${accentClass}`}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {blocks.map((block) => {
          const approved = decisions[block.id] === "APROVADO";
          return (
            <li key={block.id} className={`rounded-xl border bg-surface p-3 ${approved ? "border-success/50" : "border-border opacity-80"}`}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(e) =>
                    setDecisions((prev) => ({ ...prev, [block.id]: e.target.checked ? "APROVADO" : "RECUSADO" }))
                  }
                  className="mt-1 h-6 w-6 shrink-0 accent-[var(--color-success,#16a34a)]"
                />
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
                      {block.items.length > 1 ? "Serviço completo" : ITEM_TYPE_LABEL[block.items[0].type]}
                    </span>
                    <span className="text-sm font-semibold">{formatBRL(block.totalCents)}</span>
                  </span>
                  <span className="mt-1 block text-sm font-medium">{block.title}</span>
                  <span className={`mt-0.5 block text-xs font-semibold ${approved ? "text-success" : "text-danger"}`}>
                    {approved ? "Aprovado" : "Não aprovado"}
                  </span>
                </span>
              </label>
              {block.items.length > 1 || block.items[0].notes || block.items[0].customerSupplied ? (
                <ul className="mt-2 flex flex-col gap-1 border-t border-border pt-2 pl-9">
                  {block.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 text-xs text-muted">
                      <span>
                        {ITEM_TYPE_LABEL[item.type]}: {item.description}
                        {item.customerSupplied ? " (peça do cliente — sem cobrança)" : ""}
                        {item.notes ? <span className="block whitespace-pre-line">{item.notes}</span> : null}
                      </span>
                      <span className="shrink-0">{formatBRL(item.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
