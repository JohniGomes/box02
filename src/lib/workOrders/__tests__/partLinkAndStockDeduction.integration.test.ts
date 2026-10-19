import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService, createStockMovementService, getPartCurrentStockService } from "@/lib/inventory/service";
import { createWorkOrderWithoutQuoteService, setWorkOrderItemStatusService } from "../service";
import { createQuoteService } from "@/lib/quotes/service";
import { PartNotActiveError, PartNotFoundError, InsufficientStockError } from "@/lib/inventory/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "stock_movements", "parts",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%' OR key = 'work_order_number_seq'`);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "stock_movements", "parts",
      "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Teste" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "PRT1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("item de orçamento/OS vinculado a partId", () => {
  it("rejeita partId de peça inativa", async () => {
    const part = await createPartService({ name: "Pastilha de freio", costReais: "20,00" });
    await pool.query(`UPDATE parts SET status = 'INATIVO' WHERE id = $1`, [part.id]);

    await expect(
      createWorkOrderWithoutQuoteService(actorUserId, {
        customerId,
        vehicleId,
        mileageAtEntry: 1000,
        items: [{ type: "PECA", description: "Pastilha", quantity: 1, unitPriceReais: "50,00", partId: part.id }],
      }),
    ).rejects.toThrow(PartNotActiveError);
  });

  it("rejeita partId inexistente", async () => {
    await expect(
      createWorkOrderWithoutQuoteService(actorUserId, {
        customerId,
        vehicleId,
        mileageAtEntry: 1000,
        items: [{ type: "PECA", description: "Pastilha", quantity: 1, unitPriceReais: "50,00", partId: "id-que-nao-existe" }],
      }),
    ).rejects.toThrow(PartNotFoundError);
  });

  it("aceita partId de peça ativa e grava o vínculo no item do orçamento", async () => {
    const part = await createPartService({ name: "Filtro de óleo", costReais: "15,00", markupPercent: 50 });

    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        {
          type: "PECA",
          description: "Filtro de óleo",
          quantity: 1,
          unitPriceReais: "22,50",
          partId: part.id,
          category: "NECESSARIO",
        },
      ],
    });

    expect(quote.items[0].partId).toBe(part.id);
  });
});

describe("baixa automática de estoque ao marcar item EXECUTADO", () => {
  it("desconta a quantidade do item do estoque quando marcado EXECUTADO", async () => {
    const part = await createPartService({ name: "Óleo de motor", costReais: "30,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 10 });

    const { workOrder, items } = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Óleo de motor", quantity: 2, unitPriceReais: "50,00", partId: part.id }],
    });

    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");

    const stockAfter = await getPartCurrentStockService(part.id);
    expect(stockAfter).toBe(8);
  });

  it("não desconta estoque de item sem partId (item personalizado)", async () => {
    const { workOrder, items } = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Peça avulsa sem cadastro", quantity: 1, unitPriceReais: "50,00" }],
    });

    const updated = await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    expect(updated.status).toBe("EXECUTADO");
  });

  it("bloqueia a execução (e não marca o item) quando o estoque é insuficiente", async () => {
    const part = await createPartService({ name: "Correia dentada", costReais: "80,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 1 });

    const { workOrder, items } = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Correia dentada", quantity: 3, unitPriceReais: "150,00", partId: part.id }],
    });

    await expect(
      setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO"),
    ).rejects.toThrow(InsufficientStockError);

    const row = await pool.query(`SELECT status FROM work_order_items WHERE id = $1`, [items[0].id]);
    expect(row.rows[0].status).toBe("PLANEJADO");

    const stockAfter = await getPartCurrentStockService(part.id);
    expect(stockAfter).toBe(1);
  });

  it("não desconta estoque ao CANCELAR um item (só EXECUTADO desconta)", async () => {
    const part = await createPartService({ name: "Vela de ignição", costReais: "10,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 4 });

    const { workOrder, items } = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Vela de ignição", quantity: 4, unitPriceReais: "20,00", partId: part.id }],
    });

    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", { reason: "Cliente desistiu" });

    const stockAfter = await getPartCurrentStockService(part.id);
    expect(stockAfter).toBe(4);
  });

  it("registra o movimento de estoque com motivo rastreável (número da OS)", async () => {
    const part = await createPartService({ name: "Amortecedor", costReais: "200,00" });
    await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 2 });

    const { workOrder, items } = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "PECA", description: "Amortecedor dianteiro", quantity: 1, unitPriceReais: "400,00", partId: part.id }],
    });

    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");

    const movements = await pool.query(
      `SELECT type, quantity, reason FROM stock_movements WHERE "partId" = $1 AND type = 'SAIDA'`,
      [part.id],
    );
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].reason).toContain(workOrder.number);
  });
});
