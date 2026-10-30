import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService, createStockMovementService, getPartCurrentStockService } from "@/lib/inventory/service";
import {
  authorizeAdditionalItemDirectlyService,
  cancelWorkOrderService,
  correctApprovedAdditionalItemService,
  createAdditionalItemService,
  createWorkOrderWithoutQuoteService,
  listReturnablePartsService,
  setWorkOrderItemStatusService,
  undoWorkOrderItemExecutionService,
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
  actorUserId = (await createUser({ name: "Testador", email: "undo@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

beforeEach(async () => {
  await pool.query(`TRUNCATE "work_order_items", "work_orders", "stock_movements", "parts", "vehicles", "customers" CASCADE`);
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Undo" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "UND1A23" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function osWithPart(stock = 10, qty = 2) {
  const part = await createPartService({ name: "Óleo de motor", costReais: "30,00" });
  await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: stock });
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "PECA", description: "Óleo de motor", quantity: qty, unitPriceReais: "50,00", partId: part.id }],
  });
  return { part, os, itemId: os.items[0].id };
}

describe("desfazer execução", () => {
  it("volta o item para Planejado, devolve a peça ao estoque e limpa executor e custo", async () => {
    const { part, os, itemId } = await osWithPart(10, 2);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, itemId, "EXECUTADO");
    expect(await getPartCurrentStockService(part.id)).toBe(8);

    const item = await undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "Marquei o item errado" });
    expect(item).toMatchObject({ status: "PLANEJADO", executedAt: null, executedByUserId: null, unitCostCents: null });
    expect(await getPartCurrentStockService(part.id)).toBe(10);

    const log = await pool.query(`SELECT metadata FROM audit_logs WHERE action = 'WORK_ORDER_ITEM_EXECUTION_UNDONE'`);
    expect(log.rows[0].metadata).toMatchObject({ reason: "Marquei o item errado", returnedQuantity: 2 });
  });

  it("executar de novo dá nova baixa e a conta continua certa (cancelar devolve uma vez só)", async () => {
    const { part, os, itemId } = await osWithPart(10, 2);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, itemId, "EXECUTADO");
    await undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "Errei" });
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, itemId, "EXECUTADO");
    expect(await getPartCurrentStockService(part.id)).toBe(8);

    expect(await listReturnablePartsService(os.workOrder.id)).toHaveLength(1);
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Cliente desistiu", returnParts: true });
    expect(await getPartCurrentStockService(part.id)).toBe(10);
  });

  it("item sem peça volta sem mexer em estoque; exige motivo e item executado", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Alinhamento", quantity: 1, unitPriceReais: "80,00" }],
    });
    const itemId = os.items[0].id;
    await expect(undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "Erro" })).rejects.toThrow(/EXECUTADO/);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, itemId, "EXECUTADO");
    await expect(undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "" })).rejects.toThrow();
    const item = await undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "Item errado" });
    expect(item.status).toBe("PLANEJADO");
    const moves = await pool.query(`SELECT count(*)::int AS n FROM stock_movements`);
    expect(moves.rows[0].n).toBe(0);
  });

  it("OS cancelada não aceita desfazer", async () => {
    const { os, itemId } = await osWithPart(10, 1);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, itemId, "EXECUTADO");
    await cancelWorkOrderService(actorUserId, os.workOrder.id, { reason: "Desistiu", returnParts: false });
    await expect(undoWorkOrderItemExecutionService(actorUserId, os.workOrder.id, itemId, { reason: "Erro" })).rejects.toThrow(/fechada|cancelada/);
  });
});

describe("corrigir adicional já aprovado", () => {
  async function approvedAdditional() {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Revisão", quantity: 1, unitPriceReais: "200,00" }],
    });
    const add = await createAdditionalItemService(actorUserId, os.workOrder.id, {
      type: "SERVICO",
      description: "Trocar bieleta",
      quantity: 1,
      unitPriceReais: "100,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, os.workOrder.id, add.id, {
      decision: "APROVADO",
      authorizedBy: "Dona Maria",
      channel: "TELEFONE",
    });
    return { os, add };
  }

  it("cancela o antigo e cria o novo já aprovado, com a autorização original anotada", async () => {
    const { os, add } = await approvedAdditional();
    const novo = await correctApprovedAdditionalItemService(actorUserId, os.workOrder.id, add.id, {
      description: "Trocar bieleta (par)",
      quantity: 2,
      unitPriceReais: "90,00",
      adjustReason: "Eram duas bielétas",
    });
    expect(novo).toMatchObject({
      clientDecision: "APROVADO",
      clientAuthorizedBy: "Dona Maria",
      authorizationChannel: "TELEFONE",
      supersedesItemId: add.id,
      totalCents: 18000,
      status: "PLANEJADO",
    });
    expect(novo.authorizationNotes).toMatch(/Eram duas bielétas/);
    expect(novo.authorizationNotes).toMatch(/R\$\s?100,00/);
    expect(novo.authorizationNotes).toMatch(/Dona Maria/);

    const old = await pool.query(`SELECT status, "cancelReason" FROM work_order_items WHERE id = $1`, [add.id]);
    expect(old.rows[0]).toMatchObject({ status: "CANCELADO" });
    expect(old.rows[0].cancelReason).toMatch(/Corrigido/);
  });

  it("adicional ainda pendente, recusado ou já executado não passa por aqui", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Revisão", quantity: 1, unitPriceReais: "200,00" }],
    });
    const pend = await createAdditionalItemService(actorUserId, os.workOrder.id, { type: "SERVICO", description: "Pendente", quantity: 1, unitPriceReais: "10,00" });
    const input = { description: "x", quantity: 1, unitPriceReais: "20,00", adjustReason: "motivo" };
    await expect(correctApprovedAdditionalItemService(actorUserId, os.workOrder.id, pend.id, input)).rejects.toThrow(/Ajustar/);

    await authorizeAdditionalItemDirectlyService(actorUserId, os.workOrder.id, pend.id, { decision: "RECUSADO", authorizedBy: "Maria", channel: "PRESENCIAL" });
    await expect(correctApprovedAdditionalItemService(actorUserId, os.workOrder.id, pend.id, input)).rejects.toThrow(/recusou/);

    const { os: os2, add } = await approvedAdditional();
    await setWorkOrderItemStatusService(actorUserId, os2.workOrder.id, add.id, "EXECUTADO");
    await expect(correctApprovedAdditionalItemService(actorUserId, os2.workOrder.id, add.id, input)).rejects.toThrow(/Desfazer execução/);
  });
});
