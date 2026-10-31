import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { listPartsWithoutCost } from "@/lib/db/repositories/monthlyFinance";
import { currentMonthBr } from "@/lib/finance/month";
import {
  closeWorkOrderService,
  correctWorkOrderItemCostService,
  createWorkOrderWithoutQuoteService,
  listWorkOrderCorrectionsService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import { getWorkOrderMarginService } from "../marginService";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('rule_detailed_stages', 'work_order_number_seq')`);
}

async function osWithExecutedPart(deliver: boolean) {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [
      { type: "PECA", description: "Filtro digitado", quantity: 2, unitPriceReais: "50,00" },
      { type: "MAO_DE_OBRA", description: "Troca", quantity: 1, unitPriceReais: "100,00" },
    ],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, {
    receptionAcceptedName: "Cliente",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  for (const it of os.items) await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, it.id, "EXECUTADO");
  if (deliver) await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
  return os;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ct@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Custo" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CST1A23", brand: "Fiat", model: "Uno" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("corrigir custo de item executado", () => {
  it("grava o custo, muda a margem, fica no histórico e não mexe no valor cobrado", async () => {
    const os = await osWithExecutedPart(false);
    const part = os.items.find((i) => i.description === "Filtro digitado")!;
    expect((await getWorkOrderMarginService(os.workOrder.id)).itemsWithoutCost).toBe(1);

    const updated = await correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "30,00", reason: "Custo não tinha sido informado" });
    expect(updated.unitCostCents).toBe(3000);
    expect(updated.totalCents).toBe(10000);

    const margin = await getWorkOrderMarginService(os.workOrder.id);
    expect(margin).toMatchObject({ itemsWithoutCost: 0, partsCostCents: 6000, costCents: 6000, partsRevenueCents: 10000, laborRevenueCents: 10000 });

    const history = await listWorkOrderCorrectionsService(os.workOrder.id);
    expect(history[0]).toMatchObject({ kind: "CUSTO", reason: "Custo não tinha sido informado", from: expect.stringContaining("sem custo"), to: expect.stringContaining("30,00") });
  });

  it("vale também numa OS entregue e aceita custo zero", async () => {
    const os = await osWithExecutedPart(true);
    const part = os.items.find((i) => i.description === "Filtro digitado")!;
    const updated = await correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "0", reason: "Peça do cliente" });
    expect(updated.unitCostCents).toBe(0);
  });

  it("lista as peças sem custo das OS entregues no mês", async () => {
    const os = await osWithExecutedPart(true);
    const list = await listPartsWithoutCost(currentMonthBr());
    const mine = list.filter((p) => p.workOrderId === os.workOrder.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ description: "Filtro digitado", quantity: 2, totalCents: 10000 });
    await correctWorkOrderItemCostService(actorUserId, os.workOrder.id, mine[0].itemId, { unitCostReais: "10,00", reason: "Conferido na nota" });
    expect((await listPartsWithoutCost(currentMonthBr())).some((p) => p.workOrderId === os.workOrder.id)).toBe(false);
  });

  it("recusa custo igual, inválido, sem motivo e item não executado", async () => {
    const os = await osWithExecutedPart(false);
    const part = os.items.find((i) => i.description === "Filtro digitado")!;
    await expect(correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "", reason: "motivo" })).rejects.toThrow(/Informe o custo/);
    await expect(correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "10,00", reason: "" })).rejects.toThrow(/motivo/);
    await expect(correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "-5", reason: "motivo" })).rejects.toThrow(/inválido/);
    await correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "10,00", reason: "motivo" });
    await expect(correctWorkOrderItemCostService(actorUserId, os.workOrder.id, part.id, { unitCostReais: "10,00", reason: "motivo" })).rejects.toThrow(/o mesmo/);

    const planned = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Peça planejada", quantity: 1, unitPriceReais: "20,00" }],
    });
    await expect(
      correctWorkOrderItemCostService(actorUserId, planned.workOrder.id, planned.items[0].id, { unitCostReais: "5,00", reason: "motivo" }),
    ).rejects.toThrow(/já executado/);
  });
});
