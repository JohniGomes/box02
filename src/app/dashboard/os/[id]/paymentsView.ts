import type { WorkOrderPaymentsSummary } from "@/lib/workOrders/service";
import type { WorkOrderPaymentsSummaryView } from "./WorkOrderPaymentsSection";

/** Resumo de recebimentos no formato que a tela (componente de cliente) recebe: datas viram texto. */
export function toPaymentsSummaryView(s: WorkOrderPaymentsSummary): WorkOrderPaymentsSummaryView {
  return {
    dueCents: s.dueCents,
    paidCents: s.paidCents,
    remainingCents: s.remainingCents,
    discountCents: s.discountCents,
    status: s.status,
    payments: s.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      method: p.method,
      notes: p.notes,
      receivedAt: p.receivedAt.toISOString(),
      cardFeeCents: p.cardFeeCents,
      installments: p.installments,
    })),
    refunds: s.refunds.map((r) => ({
      id: r.id,
      paymentId: r.paymentId,
      refundCents: r.refundCents,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
