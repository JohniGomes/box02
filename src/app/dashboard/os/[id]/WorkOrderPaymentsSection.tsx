"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBRL, reaisToCents } from "@/lib/money";
import { useRememberedChoice } from "@/lib/useRemembered";
import { refundWorkOrderPaymentAction, registerWorkOrderPaymentsAction, setPaymentCardFeeAction } from "../paymentActions";
import { effectivePercent, feeFromNet, netFromGross, parseFeePercent } from "@/lib/cardFee";
import { formatDateBR } from "@/lib/dateBr";

const METHOD_LABEL: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  EM_ABERTO: "Em aberto",
  PARCIALMENTE_PAGO: "Parcialmente pago",
  QUITADO: "Quitado",
};

const STATUS_CLASS: Record<string, string> = {
  EM_ABERTO: "bg-danger/15 text-danger",
  PARCIALMENTE_PAGO: "bg-accent/15 text-accent",
  QUITADO: "bg-success/15 text-success",
};

export interface WorkOrderPaymentView {
  id: string;
  /** Valor DO SERVIÇO recebido (abate o saldo da OS). */
  amountCents: number;
  method: string;
  notes: string | null;
  receivedAt: string;
  /** Cartão: taxa da maquininha repassada ao cliente (o cliente passou amountCents + cardFeeCents). */
  cardFeeCents: number | null;
  installments: number | null;
}

/** Linha do formulário de recebimento. `amount` é sempre o valor do serviço (líquido). */
interface PayRow {
  key: string;
  method: string;
  amount: string;
  /** Cartão: taxa % que a maquininha cobra (sobre o valor passado no cartão). */
  rate: string;
  /** Cartão: valor total passado no cartão (opcional). */
  gross: string;
  installments: string;
}

function newPayRow(key: string, method: string, amount: string): PayRow {
  return { key, method, amount, rate: "", gross: "", installments: "" };
}

const toReais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Taxa repassada (centavos) desta linha: pelo valor passado no cartão, ou pela % sobre o valor do serviço. */
function cardFeeOfRow(row: PayRow): number {
  if (row.method !== "CARTAO") return 0;
  const net = reaisToCents(row.amount || "0");
  const gross = reaisToCents(row.gross || "0");
  const rate = parseFeePercent(row.rate);
  if (gross > 0) return Math.max(0, gross - net);
  if (rate && rate > 0 && net > 0) return feeFromNet(net, rate);
  return 0;
}

/** Ao mexer na taxa ou no valor passado no cartão: se vierem os dois, o valor do serviço sai deles (bruto × (1 − taxa)). */
function applyCardFeePatch(row: PayRow, patch: Partial<Pick<PayRow, "rate" | "gross" | "installments">>): PayRow {
  const next = { ...row, ...patch };
  const rate = parseFeePercent(next.rate);
  const gross = reaisToCents(next.gross || "0");
  if (("rate" in patch || "gross" in patch) && rate && rate > 0 && gross > 0) {
    next.amount = toReais(netFromGross(gross, rate));
  }
  return next;
}

/** Campos da taxa da maquininha para um recebimento no cartão (opcionais). */
function CardFeeFields({ row, onChange }: { row: PayRow; onChange: (patch: Partial<Pick<PayRow, "rate" | "gross" | "installments">>) => void }) {
  const net = reaisToCents(row.amount || "0");
  const fee = cardFeeOfRow(row);
  const small = "h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-accent";
  return (
    <details className="rounded-xl border border-border bg-surface px-3 py-2" open={Boolean(row.rate || row.gross || row.installments)}>
      <summary className="cursor-pointer text-xs font-medium">Taxa da maquininha repassada ao cliente (opcional)</summary>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Taxa (%)
          <input value={row.rate} onChange={(e) => onChange({ rate: e.target.value })} inputMode="decimal" placeholder="6,69" className={small} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Passou no cartão (R$)
          <input value={row.gross} onChange={(e) => onChange({ gross: e.target.value })} inputMode="decimal" placeholder="1.250,68" className={small} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Parcelas
          <input value={row.installments} onChange={(e) => onChange({ installments: e.target.value })} inputMode="numeric" placeholder="4" className={small} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {fee > 0
          ? `Taxa ${formatBRL(fee)} · o cliente passa ${formatBRL(net + fee)} no cartão · ${formatBRL(net)} é o valor do serviço (abate o saldo da OS).`
          : "Preencha a taxa % (ela incide sobre o valor passado no cartão) ou o valor passado no cartão. O campo de valor acima é sempre o valor do serviço."}
      </p>
    </details>
  );
}

/** Ciclo M */
export interface WorkOrderPaymentRefundView {
  id: string;
  paymentId: string;
  refundCents: number;
  reason: string;
  createdAt: string;
}

export interface WorkOrderPaymentsSummaryView {
  dueCents: number;
  paidCents: number;
  remainingCents: number;
  /** Descontos já dados no recebimento (já abatidos do saldo). */
  discountCents: number;
  status: "EM_ABERTO" | "PARCIALMENTE_PAGO" | "QUITADO";
  payments: WorkOrderPaymentView[];
  /** Ciclo M */
  refunds: WorkOrderPaymentRefundView[];
}

/**
 * Ciclo I — seção de recebimentos, só visível quando a OS está ENTREGUE
 * (DEC-I9). Custo, markup e qualquer dado de precificação interna nunca
 * aparecem aqui — esta seção só lê o valor já congelado no fechamento
 * (WorkOrderClosure) e os lançamentos já feitos.
 */
export function WorkOrderPaymentsSection({
  workOrderId,
  summary,
  entryDate,
  sectionId = "recebimentos",
}: {
  workOrderId: string;
  summary: WorkOrderPaymentsSummaryView;
  /** Âncora da seção (várias podem aparecer na mesma página, na aba Recebimentos). */
  sectionId?: string;
  /** Data de entrada da OS (AAAA-MM-DD, horário de Brasília), para avisar de recebimento anterior. */
  entryDate?: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  // Uma ou mais formas de pagamento no mesmo lançamento (ex.: Pix + cartão).
  const [rows, setRows] = useState<PayRow[]>([newPayRow("p1", "DINHEIRO", "")]);
  const [lastMethod, setLastMethod] = useRememberedChoice("box02.lastPayMethod", "DINHEIRO", [
    "DINHEIRO",
    "PIX",
    "CARTAO",
    "OUTRO",
  ]);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("");
  // Data do recebimento: padrão hoje (horário de Brasília); pode ser um dia
  // anterior para lançar um pagamento que já aconteceu.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [receivedOn, setReceivedOn] = useState(today);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const enteredCents = rows.reduce((sum, r) => sum + reaisToCents(r.amount || "0"), 0);
  const discountCents = reaisToCents(discount || "0");
  const leftCents = summary.remainingCents - enteredCents - discountCents;

  function handleRegister() {
    setError(null);
    startTransition(async () => {
      const result = await registerWorkOrderPaymentsAction(workOrderId, {
        payments: rows
          .filter((r) => reaisToCents(r.amount || "0") > 0)
          .map((r) => {
            const fee = cardFeeOfRow(r);
            return {
              amountReais: r.amount,
              method: r.method,
              // Taxa repassada ao cliente: valor à parte; o valor acima continua sendo o do serviço.
              cardFeeReais: fee > 0 ? (fee / 100).toFixed(2).replace(".", ",") : undefined,
              installments: r.method === "CARTAO" && r.installments.trim() ? r.installments.trim() : undefined,
            };
          }),
        discountReais: discountCents > 0 ? discount : undefined,
        notes: notes || undefined,
        // Só envia quando é um dia anterior; hoje continua sendo "agora".
        receivedOn: receivedOn && receivedOn !== today ? receivedOn : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao registrar recebimento.");
        return;
      }
      setLastMethod(rows[0]?.method ?? lastMethod);
      setRows([newPayRow("p1", "DINHEIRO", "")]);
      setNotes("");
      setDiscount("");
      setReceivedOn(today);
      setShowForm(false);
      router.refresh();
    });
  }

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <section id={sectionId} className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-accent">Recebimentos</h2>
        {summary.paidCents > 0 ? (
          <Link href={`/dashboard/os/${workOrderId}/recibo`} className="text-xs font-medium text-accent">
            Ver recibo →
          </Link>
        ) : null}
        <Link href="/dashboard/recebimentos" className="text-xs font-medium text-muted underline">
          Caixa
        </Link>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[summary.status]}`}>
          {STATUS_LABEL[summary.status]}
        </span>
      </div>

      <dl className={`mb-3 grid gap-2 text-center text-sm ${summary.discountCents > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
        <div>
          <dt className="text-[10px] text-muted">Devido</dt>
          <dd className="font-semibold">{formatBRL(summary.dueCents)}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-muted">Recebido</dt>
          <dd className="font-semibold text-success">{formatBRL(summary.paidCents)}</dd>
        </div>
        {summary.discountCents > 0 ? (
          <div>
            <dt className="text-[10px] text-muted">Desconto</dt>
            <dd className="font-semibold">{formatBRL(summary.discountCents)}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] text-muted">Saldo</dt>
          <dd className="font-semibold">{formatBRL(summary.remainingCents)}</dd>
        </div>
      </dl>

      {summary.payments.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {summary.payments.map((p) => {
            const refundedCents = summary.refunds
              .filter((r) => r.paymentId === p.id)
              .reduce((sum, r) => sum + r.refundCents, 0);
            return (
              <PaymentRow
                key={p.id}
                workOrderId={workOrderId}
                payment={p}
                refundedCents={refundedCents}
              />
            );
          })}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted">Nenhum recebimento registrado ainda.</p>
      )}

      {summary.refunds.length > 0 ? (
        <div className="mb-3 flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Estornos</p>
          {summary.refunds.map((r) => (
            <div key={r.id} className="rounded-xl border border-danger/20 bg-danger/5 p-2.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-danger">-{formatBRL(r.refundCents)}</span>
                <span className="text-xs text-muted">{formatDateBR(r.createdAt)}</span>
              </div>
              <p className="text-xs text-muted">{r.reason}</p>
            </div>
          ))}
        </div>
      ) : null}

      {summary.status !== "QUITADO" ? (
        !showForm ? (
          <button
            onClick={() => {
              // Já abre com o saldo da OS e a última forma de pagamento usada.
              setRows([
                newPayRow(
                  "p1",
                  lastMethod,
                  summary.remainingCents > 0 ? (summary.remainingCents / 100).toFixed(2).replace(".", ",") : "",
                ),
              ]);
              setShowForm(true);
            }}
            className="h-11 w-full rounded-xl border border-border text-sm font-semibold"
          >
            Registrar recebimento
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
            {rows.map((row) => (
              <div key={row.key} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <select
                  value={row.method}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, method: e.target.value } : r)))
                  }
                  className={`${inputClass} w-36`}
                >
                  {Object.entries(METHOD_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <input
                  value={row.amount}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))
                  }
                  inputMode="decimal"
                  placeholder="0,00"
                  className={`${inputClass} min-w-0 flex-1`}
                />
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="px-2 text-xs font-medium text-danger"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              {row.method === "CARTAO" ? (
                <CardFeeFields
                  row={row}
                  onChange={(patch) => setRows((prev) => prev.map((r) => (r.key === row.key ? applyCardFeePatch(r, patch) : r)))}
                />
              ) : null}
              </div>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setRows((prev) => [
                    ...prev,
                    newPayRow(
                      `p${prev.length + 1}-${Date.now()}`,
                      "PIX",
                      leftCents > 0 ? (leftCents / 100).toFixed(2).replace(".", ",") : "",
                    ),
                  ])
                }
                className="h-10 flex-1 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
              >
                + Outra forma de pagamento
              </button>
              {enteredCents === 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((r, idx) =>
                        idx === 0 ? { ...r, amount: (summary.remainingCents / 100).toFixed(2).replace(".", ",") } : r,
                      ),
                    )
                  }
                  className="h-10 rounded-xl border border-border px-3 text-sm font-medium"
                >
                  Pagar o saldo todo
                </button>
              ) : null}
            </div>
            <label className="text-xs text-muted" htmlFor="discount">
              Desconto (R$) — abate do saldo, não conta como dinheiro recebido
            </label>
            <input
              id="discount"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={inputClass}
            />
            <p className={`text-xs ${leftCents < 0 ? "text-danger" : "text-muted"}`}>
              Saldo da OS {formatBRL(summary.remainingCents)} · Lançando {formatBRL(enteredCents)}
              {discountCents > 0 ? ` · Desconto ${formatBRL(discountCents)}` : ""} ·{" "}
              {leftCents < 0 ? `Passou ${formatBRL(-leftCents)}` : `Ficará ${formatBRL(leftCents)} em aberto`}
            </p>
            <label className="text-xs text-muted" htmlFor="receivedOn">
              Data do recebimento
            </label>
            <input
              id="receivedOn"
              type="date"
              value={receivedOn}
              max={today}
              onChange={(e) => setReceivedOn(e.target.value)}
              className={inputClass}
            />
            {entryDate && receivedOn && receivedOn < entryDate ? (
              <p className="rounded-lg bg-accent/10 p-2 text-xs">
                Atenção: esta data é anterior à entrada da OS ({entryDate.split("-").reverse().join("/")}). Confira se está certa.
              </p>
            ) : null}
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observação (opcional)"
              className={inputClass}
            />
            {error ? <p className="text-xs text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <button
                onClick={handleRegister}
                disabled={isPending || (enteredCents <= 0 && discountCents <= 0) || leftCents < 0}
                className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {isPending ? "Registrando…" : "Confirmar"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}

/** Ciclo M — uma linha de recebimento, com opção de estorno (parcial ou
 * total). O recebimento em si nunca é editado/apagado (DEC-I6 mantida) —
 * "estornar" sempre cria um lançamento novo e separado. */
function PaymentRow({
  workOrderId,
  payment,
  refundedCents,
}: {
  workOrderId: string;
  payment: WorkOrderPaymentView;
  refundedCents: number;
}) {
  const router = useRouter();
  const [refunding, setRefunding] = useState(false);
  const [refundReais, setRefundReais] = useState("");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const availableCents = payment.amountCents - refundedCents;

  // Taxa da maquininha repassada ao cliente (só cartão): ver ou corrigir, inclusive em recebimentos antigos.
  const [editingFee, setEditingFee] = useState(false);
  const [feeRate, setFeeRate] = useState("");
  const [feeGross, setFeeGross] = useState(
    payment.cardFeeCents != null ? toReais(payment.amountCents + payment.cardFeeCents) : "",
  );
  const [feeInstallments, setFeeInstallments] = useState(payment.installments != null ? String(payment.installments) : "");
  const feeGrossCents = reaisToCents(feeGross || "0");
  const feeRateNum = parseFeePercent(feeRate);
  const newFeeCents =
    feeGrossCents > 0 ? Math.max(0, feeGrossCents - payment.amountCents) : feeRateNum && feeRateNum > 0 ? feeFromNet(payment.amountCents, feeRateNum) : 0;

  function saveFee() {
    setError(null);
    startTransition(async () => {
      const result = await setPaymentCardFeeAction(workOrderId, payment.id, {
        cardFeeReais: newFeeCents > 0 ? toReais(newFeeCents) : "",
        installments: feeInstallments.trim(),
      });
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar a taxa.");
        return;
      }
      setEditingFee(false);
      router.refresh();
    });
  }

  function confirmRefund() {
    setError(null);
    startTransition(async () => {
      const result = await refundWorkOrderPaymentAction(workOrderId, payment.id, { refundReais, reason });
      if (!result.success) {
        setError(result.error ?? "Falha ao estornar.");
        return;
      }
      setRefunding(false);
      setRefundReais("");
      setReason("");
      router.refresh();
    });
  }

  if (refunding) {
    return (
      <li className="rounded-xl border border-border bg-background p-2.5 text-sm">
        <p className="mb-2 text-xs text-muted">
          Estornando {formatBRL(payment.amountCents)} ({METHOD_LABEL[payment.method]}) — disponível para estorno:{" "}
          {formatBRL(availableCents)}
        </p>
        <div className="flex flex-col gap-2">
          <input
            inputMode="decimal"
            value={refundReais}
            onChange={(e) => setRefundReais(e.target.value)}
            placeholder="Valor a estornar (R$)"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo do estorno"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-sm"
          />
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <button
              onClick={confirmRefund}
              disabled={isPending || !refundReais.trim() || reason.trim().length < 3}
              className="h-9 flex-1 rounded-lg bg-danger text-xs font-semibold text-white disabled:opacity-50"
            >
              Confirmar estorno
            </button>
            <button onClick={() => setRefunding(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
              Voltar
            </button>
          </div>
        </div>
      </li>
    );
  }

  if (editingFee) {
    const small = "h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent";
    return (
      <li className="rounded-xl border border-border bg-background p-2.5 text-sm">
        <p className="mb-2 text-xs text-muted">
          Taxa da maquininha deste recebimento de {formatBRL(payment.amountCents)} (valor do serviço). A taxa incide sobre o valor passado no cartão.
          Deixe tudo vazio para apagar.
        </p>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            Taxa (%)
            <input value={feeRate} onChange={(e) => setFeeRate(e.target.value)} inputMode="decimal" placeholder="6,69" className={small} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            Passou no cartão (R$)
            <input value={feeGross} onChange={(e) => setFeeGross(e.target.value)} inputMode="decimal" placeholder="1.250,68" className={small} />
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-muted">
            Parcelas
            <input value={feeInstallments} onChange={(e) => setFeeInstallments(e.target.value)} inputMode="numeric" placeholder="4" className={small} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          {newFeeCents > 0
            ? `Taxa ${formatBRL(newFeeCents)} (${String(effectivePercent(payment.amountCents, newFeeCents)).replace(".", ",")}% do valor passado no cartão).`
            : "Sem taxa registrada."}
        </p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
        <div className="mt-2 flex gap-2">
          <button
            onClick={saveFee}
            disabled={isPending}
            className="h-9 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            {isPending ? "Salvando…" : "Salvar taxa"}
          </button>
          <button onClick={() => setEditingFee(false)} className="h-9 flex-1 rounded-lg border border-border text-xs">
            Voltar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-2.5 text-sm">
      <div>
        <span className="font-medium">{formatBRL(payment.amountCents)}</span>{" "}
        <span className="text-xs text-muted">{METHOD_LABEL[payment.method]}</span>
        {payment.cardFeeCents != null ? (
          <p className="text-xs text-muted">
            Cliente passou {formatBRL(payment.amountCents + payment.cardFeeCents)} no cartão
            {payment.installments ? ` em ${payment.installments}x` : ""} · taxa repassada {formatBRL(payment.cardFeeCents)} (
            {String(effectivePercent(payment.amountCents, payment.cardFeeCents)).replace(".", ",")}%)
          </p>
        ) : payment.installments ? (
          <p className="text-xs text-muted">{payment.installments}x no cartão</p>
        ) : null}
        {refundedCents > 0 ? (
          <p className="text-xs text-danger">Estornado: {formatBRL(refundedCents)}</p>
        ) : null}
        {payment.notes ? <p className="text-xs text-muted">{payment.notes}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">{formatDateBR(payment.receivedAt)}</span>
        {payment.method === "CARTAO" ? (
          <button onClick={() => setEditingFee(true)} className="text-xs font-medium text-accent">
            {payment.cardFeeCents != null ? "Taxa" : "+ Taxa"}
          </button>
        ) : null}
        {availableCents > 0 ? (
          <button onClick={() => setRefunding(true)} className="text-xs font-medium text-danger">
            Estornar
          </button>
        ) : null}
      </div>
    </li>
  );
}
