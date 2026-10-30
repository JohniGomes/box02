import { listWorkOrderItemsByWorkOrder } from "@/lib/db/repositories/workOrderItems";
import { sumWorkOrderDiscounts } from "@/lib/db/repositories/workOrderDiscounts";
import { computeMargin, type Margin } from "./margin";

export async function getWorkOrderMarginService(workOrderId: string): Promise<Margin> {
  const [items, discountCents] = await Promise.all([listWorkOrderItemsByWorkOrder(workOrderId), sumWorkOrderDiscounts(workOrderId)]);
  return computeMargin(items, discountCents);
}
