import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  correctWorkOrderServiceDateService,
  createWorkOrderWithoutQuoteService,
  getWorkOrderPaymentsSummaryService,
  listWorkOrderCorrectionsService,
  registerWorkOrderPaymentService,
  reopenWorkOrderService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { WorkOrderNotDeliveredForCorrectionError } from "@/lib/workOrders/errors";
import { acceptReceptionForTest } from "./acceptHelper";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders",
      "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const user = await createUser({ name: "Testador", email: "corr@teste.com", passwordHash: await hashPassword("senhaTeste123") });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Correção" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "COR1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function prepareReady() {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Serviço", quantity: 1, unitPriceReais: "200,00" }],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente", receptionAwareness1: true, receptionAwareness2: true, receptionAwareness3: true });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
  return os;
}

async function prepareDelivered() {
  const os = await prepareReady();
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
  return os.workOrder.id;
}

describe("corrigir data de atendimento", () => {
  it("troca a data da entrega, grava o histórico e não mexe em pagamento", async () => {
    const id = await prepareDelivered();
    await registerWorkOrderPaymentService(actorUserId, id, { amountReais: "200,00", method: "PIX" });

    await correctWorkOrderServiceDateService(actorUserId, id, { serviceDate: "2026-01-10", serviceTime: "09:30", reason: "Data errada" });

    const row = (await pool.query(`SELECT "status", "deliveredAt", "entryAt" FROM work_orders WHERE id = $1`, [id])).rows[0];
    expect(row.status).toBe("ENTREGUE");
    expect(new Date(row.deliveredAt).toISOString()).toBe("2026-01-10T12:30:00.000Z");
    expect(new Date(row.entryAt).getTime()).toBeLessThanOrEqual(new Date(row.deliveredAt).getTime());

    const summary = await getWorkOrderPaymentsSummaryService(id);
    expect(summary!.paidCents).toBe(20000);

    const history = await listWorkOrderCorrectionsService(id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "DATA", reason: "Data errada", by: "Testador" });
    expect(history[0].to).toContain("10/01/2026");
  });

  it("recusa sem motivo e recusa OS que não está entregue", async () => {
    const id = await prepareDelivered();
    await expect(correctWorkOrderServiceDateService(actorUserId, id, { serviceDate: "2026-01-10", reason: "" })).rejects.toThrow();

    const ready = await prepareReady();
    await expect(
      correctWorkOrderServiceDateService(actorUserId, ready.workOrder.id, { serviceDate: "2026-01-10", reason: "Teste" }),
    ).rejects.toThrow(WorkOrderNotDeliveredForCorrectionError);
  });
});

describe("reabrir OS entregue", () => {
  it("volta para Pronta, mantém pagamentos e estoque, registra o motivo e permite entregar de novo", async () => {
    const id = await prepareDelivered();
    await registerWorkOrderPaymentService(actorUserId, id, { amountReais: "200,00", method: "DINHEIRO" });
    const movementsBefore = (await pool.query(`SELECT count(*)::int AS n FROM stock_movements`)).rows[0].n;

    await reopenWorkOrderService(actorUserId, id, { reason: "Cliente voltou" });

    const row = (await pool.query(`SELECT "status", "deliveredAt" FROM work_orders WHERE id = $1`, [id])).rows[0];
    expect(row.status).toBe("PRONTA");
    expect(row.deliveredAt).toBeNull();

    const payments = (await pool.query(`SELECT count(*)::int AS n FROM work_order_payments WHERE "workOrderId" = $1`, [id])).rows[0].n;
    expect(payments).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_movements`)).rows[0].n).toBe(movementsBefore);

    const closure = (await pool.query(`SELECT "reopenedAt", "reopenReason" FROM work_order_closures WHERE "workOrderId" = $1`, [id])).rows[0];
    expect(closure.reopenedAt).not.toBeNull();
    expect(closure.reopenReason).toBe("Cliente voltou");

    const history = await listWorkOrderCorrectionsService(id);
    expect(history.map((h) => h.kind)).toContain("REABERTURA");

    await closeWorkOrderService(actorUserId, id, { deliveryAcceptedName: "Cliente" });
    const again = (await pool.query(`SELECT "status" FROM work_orders WHERE id = $1`, [id])).rows[0];
    expect(again.status).toBe("ENTREGUE");
    expect((await getWorkOrderPaymentsSummaryService(id))!.paidCents).toBe(20000);
  });

  it("recusa reabrir OS que não está entregue", async () => {
    const ready = await prepareReady();
    await expect(reopenWorkOrderService(actorUserId, ready.workOrder.id, { reason: "Teste" })).rejects.toThrow(
      WorkOrderNotDeliveredForCorrectionError,
    );
  });
});
