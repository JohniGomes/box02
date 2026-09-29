import {
  createReconciliation,
  deleteReconciliationByExpenseId,
  deleteReconciliationByPaymentId,
  findReconciliationByExpenseId,
  findReconciliationByPaymentId,
  listPaidExpensesForReconciliation,
  listPaymentsForReconciliation,
  type ReconciliationEntryType,
} from "@/lib/db/repositories/bankReconciliations";
import { findExpenseById } from "@/lib/db/repositories/expenses";
import { findWorkOrderPaymentById } from "@/lib/db/repositories/workOrderPayments";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { reconciliationPeriodSchema } from "@/lib/validation/reconciliation";
import { ExpenseNotPaidError, ReconciliationEntryNotFoundError } from "./errors";

/** Ciclo N — conciliação bancária manual. Não toca no recebimento nem
 * na despesa originais (mesmo padrão do estorno, Ciclo M): "conciliar"
 * cria um registro novo e separado; "desfazer" apaga esse registro —
 * nunca edita o lançamento original. */
export interface ReconciliationEntryView {
  entryType: ReconciliationEntryType;
  entryId: string;
  description: string;
  amountCents: number;
  date: string; // ISO date do movimento de caixa
  reconciledAt: string | null;
}

export interface ReconciliationSummary {
  entries: ReconciliationEntryView[];
  reconciledCents: number;
  pendingCents: number;
}

export async function listReconciliationEntriesService(rawInput: unknown): Promise<ReconciliationSummary> {
  const { from, to } = reconciliationPeriodSchema.parse(rawInput);

  const [payments, expenses] = await Promise.all([
    listPaymentsForReconciliation(from, to),
    listPaidExpensesForReconciliation(from, to),
  ]);

  const paymentEntries: ReconciliationEntryView[] = payments.map((p) => ({
    entryType: "RECEBIMENTO",
    entryId: p.id,
    description: `Recebimento OS ${p.workOrderNumber} — ${p.customerNameSnapshot}`,
    amountCents: p.amountCents,
    date: p.receivedAt.toISOString(),
    reconciledAt: p.reconciledAt ? p.reconciledAt.toISOString() : null,
  }));

  const expenseEntries: ReconciliationEntryView[] = expenses.map((e) => ({
    entryType: "DESPESA",
    entryId: e.id,
    description: e.description,
    amountCents: -e.amountCents, // saída de caixa — mostrado como negativo
    date: e.paidAt.toISOString(),
    reconciledAt: e.reconciledAt ? e.reconciledAt.toISOString() : null,
  }));

  const entries = [...paymentEntries, ...expenseEntries].sort((a, b) => a.date.localeCompare(b.date));

  const reconciledCents = entries.filter((e) => e.reconciledAt).reduce((sum, e) => sum + e.amountCents, 0);
  const pendingCents = entries.filter((e) => !e.reconciledAt).reduce((sum, e) => sum + e.amountCents, 0);

  return { entries, reconciledCents, pendingCents };
}

/** Idempotente: conciliar um lançamento já conciliado apenas retorna o
 * registro existente, sem duplicar nem lançar erro. */
export async function reconcileEntryService(
  actorUserId: string,
  entryType: ReconciliationEntryType,
  entryId: string,
): Promise<{ reconciledAt: string }> {
  if (entryType === "RECEBIMENTO") {
    const payment = await findWorkOrderPaymentById(entryId);
    if (!payment) throw new ReconciliationEntryNotFoundError();

    const existing = await findReconciliationByPaymentId(entryId);
    if (existing) return { reconciledAt: existing.reconciledAt.toISOString() };

    const reconciliation = await createReconciliation({
      entryType: "RECEBIMENTO",
      paymentId: entryId,
      reconciledByUserId: actorUserId,
    });

    await recordAuditLog({
      userId: actorUserId,
      action: "RECONCILIATION_MARKED",
      entityType: "work_order_payment",
      entityId: entryId,
      metadata: { entryType: "RECEBIMENTO" },
    });

    return { reconciledAt: reconciliation.reconciledAt.toISOString() };
  }

  const expense = await findExpenseById(entryId);
  if (!expense) throw new ReconciliationEntryNotFoundError();
  if (!expense.paidAt) throw new ExpenseNotPaidError();

  const existing = await findReconciliationByExpenseId(entryId);
  if (existing) return { reconciledAt: existing.reconciledAt.toISOString() };

  const reconciliation = await createReconciliation({
    entryType: "DESPESA",
    expenseId: entryId,
    reconciledByUserId: actorUserId,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "RECONCILIATION_MARKED",
    entityType: "expense",
    entityId: entryId,
    metadata: { entryType: "DESPESA" },
  });

  return { reconciledAt: reconciliation.reconciledAt.toISOString() };
}

/** Desfazer é permitido livremente — é um check operacional interno,
 * não um documento assinado pelo cliente (mesmo raciocínio já usado
 * para correção de executor, Ciclo L). No-op se já não estava
 * conciliado. */
export async function undoReconciliationService(
  actorUserId: string,
  entryType: ReconciliationEntryType,
  entryId: string,
): Promise<void> {
  const removed =
    entryType === "RECEBIMENTO"
      ? await deleteReconciliationByPaymentId(entryId)
      : await deleteReconciliationByExpenseId(entryId);

  if (!removed) return;

  await recordAuditLog({
    userId: actorUserId,
    action: "RECONCILIATION_UNMARKED",
    entityType: entryType === "RECEBIMENTO" ? "work_order_payment" : "expense",
    entityId: entryId,
    metadata: { entryType },
  });
}
