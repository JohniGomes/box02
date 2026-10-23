import { pool } from "@/lib/db/pool";
import { registerWorkOrderReceptionAcceptanceService } from "@/lib/workOrders/service";

/**
 * O aceite do Termo exige queixa e KM. Os testes que só precisam de uma OS
 * "aceita" completam esses dois campos (se faltarem) antes de aceitar.
 */
export async function acceptReceptionForTest(
  actorUserId: string,
  workOrderId: string,
  input: Parameters<typeof registerWorkOrderReceptionAcceptanceService>[2],
) {
  await pool.query(
    `UPDATE work_orders
        SET "customerComplaint" = COALESCE(NULLIF(btrim("customerComplaint"), ''), 'Queixa de teste'),
            "mileageAtEntry" = COALESCE("mileageAtEntry", 1000)
      WHERE id = $1`,
    [workOrderId],
  );
  return registerWorkOrderReceptionAcceptanceService(actorUserId, workOrderId, input);
}
