import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService, createStockMovementService, getPartCurrentStockService } from "@/lib/inventory/service";
import {
  cancelWorkOrderService,
  createWorkOrderWithoutQuoteService,
  listReturnablePartsService,
  reactivateWorkOrderService,
  setWorkOrderItemStatusService,
} from "../service";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders", "stock_movements", "parts",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "dev@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

beforeEach(async () => {
  await pool.query(`TRUNCATE "work_order_items", "work_orders", "stock_movements", "parts", "vehicles", "customers" CASCADE`);
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Estoque" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "DEV1A23" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function osWithExecutedPart(stock = 10, qty = 2) {
  const part = await createPartService({ name: "Óleo de motor", costReais: "30,00" });
  await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: stock });
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "PECA", description: "Óleo de motor", quantity: qty, unitPriceReais: "50,00", partId: part.id }],
  });
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
  return { part, os };
}

describe("cancelar OS: devolver as peças ao estoque (pergunta, sem trava)", () => {
  it("lista as peças que podem voltar e devolve quando a resposta é Sim", async () => {
    const { part, os } = await osWithExecutedPart(10, 2);
    expect(await getPartCurrentStockService(part.id)).toBe(8);
    expect(await listReturnablePartsService(os.workOrder.id)).toEqual([
      { itemId: os.items[0].id, description: "Óleo de motor", quantity: 2 },
    ]);

    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Cliente desistiu", returnParts: true });
    expect(await getPartCurrentStockService(part.id)).toBe(10);
    // já devolvida: não aparece de novo e não devolve duas vezes
    expect(await listReturnablePartsService(os.workOrder.id)).toEqual([]);
    const moves = await pool.query(`SELECT type, quantity, source FROM stock_movements WHERE "partId" = $1 ORDER BY "createdAt"`, [part.id]);
    expect(moves.rows.map((m) => `${m.type}:${m.quantity}:${m.source}`)).toEqual(["ENTRADA:10:null", "SAIDA:2:OS_BAIXA", "ENTRADA:2:OS_DEVOLUCAO"]);
  });

  it("responder Não (ou não perguntar) cancela do mesmo jeito e não mexe no estoque", async () => {
    const { part, os } = await osWithExecutedPart(10, 2);
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Peça foi usada", returnParts: false });
    expect(await getPartCurrentStockService(part.id)).toBe(8);
    const row = (await pool.query(`SELECT status FROM work_orders WHERE id = $1`, [os.workOrder.id])).rows[0];
    expect(row.status).toBe("CANCELADA");
  });

  it("item só planejado e peça do cliente não geram devolução", async () => {
    const part = await createPartService({ name: "Filtro", costReais: "10,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 5 });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Filtro", quantity: 1, unitPriceReais: "20,00", partId: part.id }],
    });
    expect(await listReturnablePartsService(os.workOrder.id)).toEqual([]);
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Sem execução", returnParts: true });
    expect(await getPartCurrentStockService(part.id)).toBe(5);
  });
});

describe("reativar OS: as peças devolvidas voltam a sair", () => {
  it("nova baixa na reativação, sem travar por falta de saldo", async () => {
    const { part, os } = await osWithExecutedPart(10, 2);
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Engano", returnParts: true });
    expect(await getPartCurrentStockService(part.id)).toBe(10);

    // alguém usou o estoque nesse meio tempo: sobra menos do que a OS precisa
    await createStockMovementService(actorUserId, part.id, { type: "SAIDA", quantity: 9 });
    expect(await getPartCurrentStockService(part.id)).toBe(1);

    await reactivateWorkOrderService(actorUserId, os.workOrder.id, { reason: "Cancelei por engano" });
    // a saída acontece mesmo com saldo menor (fica negativo: -1) e a OS voltou
    expect(await getPartCurrentStockService(part.id)).toBe(-1);
    expect((await pool.query(`SELECT status FROM work_orders WHERE id = $1`, [os.workOrder.id])).rows[0].status).not.toBe("CANCELADA");

    // cancelar de novo devolve de novo (ciclo completo)
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Agora é de verdade", returnParts: true });
    expect(await getPartCurrentStockService(part.id)).toBe(1);
  });

  it("se as peças não tinham sido devolvidas, reativar não mexe no estoque", async () => {
    const { part, os } = await osWithExecutedPart(10, 2);
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Engano", returnParts: false });
    await reactivateWorkOrderService(actorUserId, os.workOrder.id, { reason: "Voltou" });
    expect(await getPartCurrentStockService(part.id)).toBe(8);
  });
});
