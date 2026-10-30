import { listWorkOrderItemsByWorkOrder } from "@/lib/db/repositories/workOrderItems";
import { sumWorkOrderDiscounts } from "@/lib/db/repositories/workOrderDiscounts";
import { sumCardPaymentsNet } from "@/lib/db/repositories/workOrderPayments";
import { getCardFeePercent } from "@/lib/settings/service";
import { cardFeeOf, computeMargin, type Margin } from "./margin";

export type WorkOrderMargin = Margin & { cardPaidCents: number; cardFeePercent: number };

export async function getWorkOrderMarginService(workOrderId: string): Promise<WorkOrderMargin> {
  const [items, discountCents, cardPaidCents, cardFeePercent] = await Promise.all([
    listWorkOrderItemsByWorkOrder(workOrderId),
    sumWorkOrderDiscounts(workOrderId),
    sumCardPaymentsNet(workOrderId),
    getCardFeePercent(),
  ]);
  return { ...computeMargin(items, discountCents, cardFeeOf(cardPaidCents, cardFeePercent)), cardPaidCents, cardFeePercent };
}
