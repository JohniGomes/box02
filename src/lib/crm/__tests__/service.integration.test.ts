import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import {
  CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY,
  getReengagementThresholdDays,
  setReengagementThresholdDays,
} from "@/lib/settings/service";
import { getCustomerHistoryService, listReengagementCandidatesService } from "../service";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders",
      "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', $1)`, [
    CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY,
  ]);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador CRM", email: "crm@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = $1`, [CRM_REENGAGEMENT_THRESHOLD_DAYS_KEY]);
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente CRM" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CRM1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function createDeliveredWorkOrder(totalReais = "200,00", deliveredDaysAgo = 0) {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Serviço Ciclo O", quantity: 1, unitPriceReais: totalReais }],
  });
  await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO", {
    executedByUserId: actorUserId,
  });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });

  if (deliveredDaysAgo > 0) {
    await pool.query(
      `UPDATE work_orders SET "deliveredAt" = "deliveredAt" - ($1 || ' days')::interval WHERE id = $2`,
      [deliveredDaysAgo, os.workOrder.id],
    );
  }

  return os.workOrder.id;
}

describe("getCustomerHistoryService — histórico consolidado", () => {
  it("retorna lista vazia e totais zerados para cliente sem OS", async () => {
    const history = await getCustomerHistoryService(customerId);
    expect(history.workOrders).toHaveLength(0);
    expect(history.totalWorkOrders).toBe(0);
    expect(history.totalSpentCents).toBe(0);
  });

  it("retorna as OS do cliente com total gasto somando só as entregues", async () => {
    await createDeliveredWorkOrder("150,00");
    await createDeliveredWorkOrder("50,00");

    const history = await getCustomerHistoryService(customerId);
    expect(history.totalWorkOrders).toBe(2);
    expect(history.totalSpentCents).toBe(20000);
    expect(history.workOrders.every((wo) => wo.status === "ENTREGUE")).toBe(true);
  });

  it("não mistura OS de outro cliente", async () => {
    await createDeliveredWorkOrder("100,00");
    const other = await createCustomerService(actorUserId, { type: "PF", legalName: "Outro Cliente" });

    const history = await getCustomerHistoryService(other.id);
    expect(history.totalWorkOrders).toBe(0);
  });
});

describe("listReengagementCandidatesService — lembrete de retorno", () => {
  it("não calcula nada enquanto o limite não está configurado", async () => {
    const threshold = await getReengagementThresholdDays();
    expect(threshold).toBeNull();

    const summary = await listReengagementCandidatesService();
    expect(summary.thresholdDays).toBeNull();
    expect(summary.candidates).toHaveLength(0);
  });

  it("lista cliente que passou do limite configurado", async () => {
    await setReengagementThresholdDays(30);
    await createDeliveredWorkOrder("100,00", 45);

    const summary = await listReengagementCandidatesService();
    expect(summary.thresholdDays).toBe(30);
    expect(summary.candidates.some((c) => c.id === customerId)).toBe(true);
  });

  it("não lista cliente que ainda está dentro do limite", async () => {
    await setReengagementThresholdDays(30);
    await createDeliveredWorkOrder("100,00", 5);

    const summary = await listReengagementCandidatesService();
    expect(summary.candidates.some((c) => c.id === customerId)).toBe(false);
  });

  it("nunca lista cliente sem nenhuma OS entregue", async () => {
    await setReengagementThresholdDays(30);
    // cliente existe (criado no beforeEach) mas sem nenhuma OS entregue
    const summary = await listReengagementCandidatesService();
    expect(summary.candidates.some((c) => c.id === customerId)).toBe(false);
  });

  it("usa a última OS entregue quando há mais de uma", async () => {
    await setReengagementThresholdDays(30);
    await createDeliveredWorkOrder("100,00", 45); // antiga
    await createDeliveredWorkOrder("50,00", 5); // recente — deveria "salvar" o cliente

    const summary = await listReengagementCandidatesService();
    expect(summary.candidates.some((c) => c.id === customerId)).toBe(false);
  });
});
