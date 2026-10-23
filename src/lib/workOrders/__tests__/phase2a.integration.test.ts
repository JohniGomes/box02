import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService, createStockMovementService } from "@/lib/inventory/service";
import { createService } from "@/lib/db/repositories/services";
import {
  createQuoteService,
  createNewQuoteVersionService,
  getQuoteService,
  registerInternalQuoteDecisionService,
} from "@/lib/quotes/service";
import {
  createWorkOrderFromQuoteService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
} from "@/lib/workOrders/service";
import { createExpenseService, listExpensesService } from "@/lib/expenses/service";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "expenses", "stock_movements", "parts", "services", "work_order_payments", "work_order_closures",
      "work_order_items", "work_orders", "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'quote_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  const user = await createUser({ name: "Testador", email: "p2a@teste.com", passwordHash: await hashPassword("senhaTeste123") });
  actorUserId = user.id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente 2A" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "PHA2A01", brand: "Fiat", model: "Palio" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function approveAll(quoteId: string) {
  const full = await getQuoteService(quoteId);
  const decidable = full!.items.filter((i) => i.category !== "INFORMATIVO");
  await registerInternalQuoteDecisionService(actorUserId, quoteId, {
    itemDecisions: decidable.map((i) => ({ itemId: i.id, decision: "APROVADO" as const })),
    approverName: "Cliente 2A",
  });
}

describe("custo guardado no item ao executar", () => {
  it("peça do estoque: guarda o custo da peça no momento; mudar o custo depois não altera o item", async () => {
    const part = await createPartService({ name: "Filtro 2A", unit: "un", costReais: "10,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 5 });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "PECA", description: "Filtro 2A", quantity: 1, unitPriceReais: "30,00", partId: part.id }],
    });
    const executed = await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO", { executedByUserId: actorUserId });
    expect(executed.unitCostCents).toBe(1000);

    await pool.query(`UPDATE parts SET "costCents" = 2500 WHERE id = $1`, [part.id]);
    const row = await pool.query(`SELECT "unitCostCents" FROM work_order_items WHERE id = $1`, [os.items[0].id]);
    expect(row.rows[0].unitCostCents).toBe(1000);
  });

  it("serviço do catálogo usa o custo estimado; item digitado à mão fica sem custo", async () => {
    const service = await createService({ name: "Revisão 2A", defaultPriceCents: 10000, costCents: 3500 });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", description: "Revisão 2A", quantity: 1, unitPriceReais: "100,00", serviceId: service.id },
        { type: "SERVICO", description: "Serviço digitado", quantity: 1, unitPriceReais: "50,00" },
      ],
    });
    const a = await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO", { executedByUserId: actorUserId });
    const b = await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[1].id, "EXECUTADO", { executedByUserId: actorUserId });
    expect(a.unitCostCents).toBe(3500);
    expect(b.unitCostCents).toBeNull();
  });
});

describe("peça do cliente", () => {
  it("o servidor zera o valor, a OS herda a marca e a execução não dá baixa nem exige estoque", async () => {
    const part = await createPartService({ name: "Radiador 2A", unit: "un", costReais: "200,00" });
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "PECA", category: "NECESSARIO", description: "Radiador do cliente", quantity: 1, unitPriceReais: "999,00", partId: part.id, customerSupplied: true },
        { type: "MAO_DE_OBRA", category: "NECESSARIO", description: "Troca do radiador", quantity: 1, unitPriceReais: "120,00" },
      ],
    });
    const supplied = quote.items.find((i) => i.description === "Radiador do cliente")!;
    expect(supplied.customerSupplied).toBe(true);
    expect(supplied.unitPriceCents).toBe(0);
    expect(quote.version.totalCents).toBe(12000);

    await approveAll(quote.quote.id);
    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { mileageAtEntry: 1000, customerComplaint: "Vazamento" });
    const osSupplied = os.items.find((i) => i.description === "Radiador do cliente")!;
    expect(osSupplied.customerSupplied).toBe(true);

    // estoque da peça é 0: sem a marca isso falharia por falta de estoque
    const executed = await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, osSupplied.id, "EXECUTADO", { executedByUserId: actorUserId });
    expect(executed.unitCostCents).toBe(0);
    const moves = await pool.query(`SELECT count(*)::int AS c FROM stock_movements WHERE "partId" = $1`, [part.id]);
    expect(moves.rows[0].c).toBe(0);
  });
});

describe("motivo do desconto", () => {
  it("grava no orçamento, copia para a nova versão e para a OS", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço", quantity: 1, unitPriceReais: "100,00" }],
      discount: { type: "FIXO", value: "10,00", reason: "Cliente fiel" },
    });
    expect(quote.version.discountReason).toBe("Cliente fiel");

    await approveAll(quote.quote.id);
    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { mileageAtEntry: 1000, customerComplaint: "Teste" });
    expect(os.workOrder.discountReason).toBe("Cliente fiel");
  });

  it("nova versão mantém o motivo", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço B", quantity: 1, unitPriceReais: "100,00" }],
      discount: { type: "PERCENTUAL", value: "10", reason: "Fechou dois serviços" },
    });
    await pool.query(`UPDATE quote_versions SET status = 'ENVIADO' WHERE id = $1`, [quote.version.id]);
    await pool.query(`UPDATE quotes SET status = 'ENVIADO' WHERE id = $1`, [quote.quote.id]);
    const next = await createNewQuoteVersionService(actorUserId, quote.quote.id);
    expect(next.version.discountReason).toBe("Fechou dois serviços");
  });
});

describe("despesa relacionada a uma OS", () => {
  it("liga a despesa à OS e a listagem traz o número", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId });
    const expense = await createExpenseService(actorUserId, {
      category: "FORNECEDORES",
      description: "Terceiro: recondicionamento de bicos",
      amountReais: "300,00",
      dueDate: "2026-12-01",
      workOrderId: os.workOrder.id,
    });
    expect(expense.workOrderId).toBe(os.workOrder.id);
    const listed = (await listExpensesService()).find((e) => e.id === expense.id);
    expect(listed?.workOrderNumber).toBe(os.workOrder.number);
  });

  it("recusa OS inexistente", async () => {
    await expect(
      createExpenseService(actorUserId, {
        category: "OUTROS",
        description: "x",
        amountReais: "10,00",
        dueDate: "2026-12-01",
        workOrderId: "id-que-nao-existe",
      }),
    ).rejects.toThrow(/OS escolhida/);
  });
});
