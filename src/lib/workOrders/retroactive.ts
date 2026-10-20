import { z } from "zod";
import { pool } from "@/lib/db/pool";
import { withTransaction } from "@/lib/db/transaction";
import { findQuoteById } from "@/lib/db/repositories/quotes";
import { findQuoteVersionByNumber } from "@/lib/db/repositories/quoteVersions";
import { listQuoteItemsByVersion } from "@/lib/db/repositories/quoteItems";
import { findCustomerById } from "@/lib/db/repositories/customers";
import { findUserById } from "@/lib/db/repositories/users";
import { getPartCurrentStock } from "@/lib/db/repositories/parts";
import { setWorkOrderStatus } from "@/lib/db/repositories/workOrders";
import { listWorkOrderItemsByWorkOrder } from "@/lib/db/repositories/workOrderItems";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { registerInternalQuoteDecisionService } from "@/lib/quotes/service";
import { QuoteNotFoundError } from "@/lib/quotes/errors";
import { InsufficientStockError } from "@/lib/inventory/errors";
import { computeQuoteTotals, reaisToCents } from "@/lib/money";
import {
  closeWorkOrderService,
  createWorkOrderFromQuoteService,
  registerWorkOrderPaymentService,
  setWorkOrderItemStatusService,
} from "./service";
import { InvalidExecutorUserError, QuoteNotApprovedError } from "./errors";

/** Erro de validação com mensagem já pronta para o usuário. */
export class RetroactiveServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetroactiveServiceError";
  }
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const registerCompletedServiceSchema = z.object({
  /** Data em que o serviço foi realizado/pago (AAAA-MM-DD). */
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do serviço"),
  mileageAtEntry: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0, "Quilometragem inválida")),
  customerComplaint: optionalText,
  executedByUserId: z.string().trim().min(1, "Selecione quem executou"),
  deliveryAcceptedName: z.string().trim().min(2, "Informe quem retirou o veículo"),
  payments: z
    .array(
      z.object({
        method: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
        amountReais: z.union([z.string(), z.number()]),
        notes: optionalText,
      }),
    )
    .min(1, "Informe pelo menos um pagamento"),
});

export type RegisterCompletedServiceInput = z.infer<typeof registerCompletedServiceSchema>;

export interface RegisterCompletedServiceResult {
  workOrderId: string;
  workOrderNumber: string;
  totalCents: number;
  paidCents: number;
}

/** A OS chegou a ser criada mas uma etapa seguinte falhou: avisa qual OS e
 * em que ponto parou, para a pessoa concluir manualmente pela ficha da OS. */
export class RetroactiveServiceIncompleteError extends Error {
  constructor(
    public readonly workOrderId: string,
    public readonly workOrderNumber: string,
    public readonly step: string,
    cause: unknown,
  ) {
    super(
      `A OS ${workOrderNumber} foi criada, mas parou na etapa "${step}": ${
        cause instanceof Error ? cause.message : String(cause)
      }. Conclua o restante pela ficha da OS.`,
    );
    this.name = "RetroactiveServiceIncompleteError";
  }
}

/**
 * Registra um serviço que JÁ aconteceu e foi pago, a partir de um orçamento:
 * aprova (se ainda não aprovado), cria a OS, marca os itens como executados,
 * entrega, lança os pagamentos e ajusta as datas para a data real do serviço.
 *
 * Decisões de projeto:
 * - Reaproveita os serviços já existentes (criar OS, executar item, fechar,
 *   receber) em vez de duplicar regras — cada um mantém suas validações.
 * - NÃO registra Termo de Recepção: o cliente não assinou isso na época, então
 *   o sistema não finge que assinou. A transição de status é feita direto
 *   pelo repositório, sem o gate do aceite (que só vale para OS em andamento).
 * - Antes de criar qualquer coisa, valida tudo que dá para validar (estoque,
 *   executor, pagamentos x total, OS duplicada) para não deixar OS pela metade.
 */
export async function registerCompletedServiceFromQuoteService(
  actorUserId: string,
  quoteId: string,
  rawInput: unknown,
): Promise<RegisterCompletedServiceResult> {
  const input = registerCompletedServiceSchema.parse(rawInput);

  const serviceDate = new Date(`${input.serviceDate}T12:00:00-03:00`);
  if (Number.isNaN(serviceDate.getTime())) {
    throw new RetroactiveServiceError("Data do serviço inválida.");
  }
  if (serviceDate.getTime() > Date.now()) {
    throw new RetroactiveServiceError("A data do serviço não pode ser no futuro.");
  }

  const quote = await findQuoteById(quoteId);
  if (!quote) throw new QuoteNotFoundError(quoteId);

  let version = await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber);
  if (!version) throw new QuoteNotFoundError(quoteId);

  const executor = await findUserById(input.executedByUserId);
  if (!executor || executor.status !== "ATIVO") throw new InvalidExecutorUserError();

  const duplicate = await pool.query(
    `SELECT number FROM work_orders WHERE "sourceQuoteVersionId" = $1 LIMIT 1`,
    [version.id],
  );
  if (duplicate.rows[0]) {
    throw new RetroactiveServiceError(
      `Já existe a OS ${duplicate.rows[0].number} para este orçamento. Use a ficha dela para concluir.`,
    );
  }

  const paymentsCents = input.payments.map((p) => ({ ...p, cents: reaisToCents(p.amountReais) }));
  if (paymentsCents.some((p) => p.cents <= 0)) {
    throw new RetroactiveServiceError("Cada pagamento precisa ter valor maior que zero.");
  }

  // Aprova pela oficina se ainda não houver decisão (rascunho/enviado/expirado).
  const needsApproval = version.status === "RASCUNHO" || version.status === "ENVIADO" || version.status === "EXPIRADO";
  if (!needsApproval && version.status !== "APROVADO" && version.status !== "APROVADO_PARCIAL") {
    throw new QuoteNotApprovedError();
  }

  const allItems = await listQuoteItemsByVersion(version.id);
  const decidable = allItems.filter((i) => i.category !== "INFORMATIVO");
  const approvedItems = needsApproval ? decidable : allItems.filter((i) => i.clientDecision === "APROVADO");
  if (approvedItems.length === 0) {
    throw new RetroactiveServiceError("O orçamento não tem itens aprovados para virar OS.");
  }

  // Total que a OS vai fechar (mesma conta do fechamento).
  const totals = computeQuoteTotals({
    items: approvedItems.map((i) => ({ type: i.type, totalCents: i.totalCents })),
    discountType: version.discountType,
    discountValue: version.discountValue,
    surchargeType: version.surchargeType,
    surchargeValue: version.surchargeValue,
  });
  const paidCents = paymentsCents.reduce((sum, p) => sum + p.cents, 0);
  if (paidCents > totals.totalCents) {
    throw new RetroactiveServiceError(
      "A soma dos pagamentos é maior que o total do serviço. Confira os valores.",
    );
  }

  // Estoque: itens ligados a uma peça dão baixa ao serem executados. Confere
  // antes para não criar a OS e travar no meio.
  const neededByPart = new Map<string, number>();
  for (const item of approvedItems) {
    if (!item.partId) continue;
    const qty = Math.max(1, Math.round(Number(item.quantity)));
    neededByPart.set(item.partId, (neededByPart.get(item.partId) ?? 0) + qty);
  }
  for (const [partId, needed] of neededByPart) {
    const stock = await getPartCurrentStock(partId);
    if (needed > stock) throw new InsufficientStockError(stock, needed);
  }

  const customer = await findCustomerById(quote.customerId);

  if (needsApproval) {
    await registerInternalQuoteDecisionService(actorUserId, quoteId, {
      itemDecisions: decidable.map((i) => ({ itemId: i.id, decision: "APROVADO" as const })),
      approverName: customer?.legalName ?? input.deliveryAcceptedName,
      notes: "Serviço já realizado e pago — registrado retroativamente pela oficina.",
    });
    version = (await findQuoteVersionByNumber(quoteId, quote.currentVersionNumber)) ?? version;
  }

  const { workOrder } = await createWorkOrderFromQuoteService(actorUserId, quoteId, {
    mileageAtEntry: input.mileageAtEntry,
    customerComplaint: input.customerComplaint,
  });

  let step = "andamento da OS";
  try {
    // ABERTA -> EM_EXECUCAO -> TESTE_FINAL -> PRONTA, direto pelo repositório
    // (sem o gate do Termo de Recepção — ver comentário da função).
    await setWorkOrderStatus(workOrder.id, "EM_EXECUCAO", { startedAt: serviceDate });
    await setWorkOrderStatus(workOrder.id, "TESTE_FINAL", { completedAt: serviceDate });
    await setWorkOrderStatus(workOrder.id, "PRONTA");

    step = "execução dos itens";
    const woItems = await listWorkOrderItemsByWorkOrder(workOrder.id);
    for (const item of woItems.filter((i) => i.status === "PLANEJADO")) {
      await setWorkOrderItemStatusService(actorUserId, workOrder.id, item.id, "EXECUTADO", {
        executedByUserId: input.executedByUserId,
      });
    }

    step = "entrega da OS";
    await closeWorkOrderService(actorUserId, workOrder.id, {
      deliveryAcceptedName: input.deliveryAcceptedName,
    });

    step = "lançamento dos pagamentos";
    for (const p of paymentsCents) {
      await registerWorkOrderPaymentService(actorUserId, workOrder.id, {
        amountReais: p.amountReais,
        method: p.method,
        notes: p.notes,
      });
    }

    step = "ajuste das datas";
    await backdateWorkOrder(workOrder.id, version.id, serviceDate);
  } catch (err) {
    throw new RetroactiveServiceIncompleteError(workOrder.id, workOrder.number, step, err);
  }

  await recordAuditLog({
    userId: actorUserId,
    action: "WORK_ORDER_RETROACTIVE_REGISTERED",
    entityType: "work_order",
    entityId: workOrder.id,
    metadata: { serviceDate: input.serviceDate, totalCents: totals.totalCents, paidCents },
  });

  return {
    workOrderId: workOrder.id,
    workOrderNumber: workOrder.number,
    totalCents: totals.totalCents,
    paidCents,
  };
}

/**
 * Leva as datas do fluxo para a data real do serviço. Só mexe em datas de
 * eventos de negócio (entrada, início, fim, entrega, execução dos itens,
 * fechamento, recebimentos e a decisão do orçamento) — nunca em createdAt, que
 * continua mostrando quando o registro foi de fato feito no sistema.
 */
async function backdateWorkOrder(workOrderId: string, quoteVersionId: string, date: Date): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE work_orders SET "entryAt" = $2, "startedAt" = $2, "completedAt" = $2, "deliveredAt" = $2
       WHERE id = $1`,
      [workOrderId, date],
    );
    await client.query(
      `UPDATE work_order_items SET "executedAt" = $2 WHERE "workOrderId" = $1 AND status = 'EXECUTADO'`,
      [workOrderId, date],
    );
    await client.query(`UPDATE work_order_closures SET "closedAt" = $2 WHERE "workOrderId" = $1`, [
      workOrderId,
      date,
    ]);
    await client.query(`UPDATE work_order_payments SET "receivedAt" = $2 WHERE "workOrderId" = $1`, [
      workOrderId,
      date,
    ]);
    // A decisão/envio do orçamento não pode ficar DEPOIS do serviço.
    await client.query(
      `UPDATE quote_versions SET
         "decidedAt" = LEAST("decidedAt", $2),
         "sentAt" = LEAST("sentAt", $2)
       WHERE id = $1`,
      [quoteVersionId, date],
    );
    await client.query(
      `UPDATE quote_approvals SET "decidedAt" = LEAST("decidedAt", $2) WHERE "quoteVersionId" = $1`,
      [quoteVersionId, date],
    );
  });
}
