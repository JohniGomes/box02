import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createWorkOrderWithoutQuoteService } from "@/lib/workOrders/service";
import { getMonthFinanceService } from "../service";
import { currentMonthBr, monthLabel, parseMonth, percentChange, shiftMonth } from "../month";

describe("meses", () => {
  it("anda para frente e para trás passando o ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(monthLabel("2026-10")).toBe("outubro de 2026");
  });

  it("mês inválido vira o mês atual de Brasília", () => {
    const now = new Date("2026-11-01T01:00:00.000Z"); // ainda 31/10 em Brasília
    expect(currentMonthBr(now)).toBe("2026-10");
    expect(parseMonth("2026-13", now)).toBe("2026-10");
    expect(parseMonth("abc", now)).toBe("2026-10");
    expect(parseMonth(undefined, now)).toBe("2026-10");
    expect(parseMonth("2026-03", now)).toBe("2026-03");
  });

  it("variação percentual não divide por zero", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(10, 0)).toBeNull();
  });
});

let actorUserId: string;
let workOrderId: string;
let paymentId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payment_refunds", "work_order_payments", "expenses", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

async function pay(id: string, cents: number, method: string, receivedAt: string) {
  await pool.query(
    `INSERT INTO work_order_payments (id, "workOrderId", "amountCents", method, "registeredByUserId", "receivedAt") VALUES ($1,$2,$3,$4,$5,$6)`,
    [id, workOrderId, cents, method, actorUserId, receivedAt],
  );
}

async function expense(id: string, category: string, cents: number, due: string, paidAt: string | null) {
  await pool.query(
    `INSERT INTO expenses (id, category, description, "amountCents", "dueDate", "paidAt", "createdByUserId") VALUES ($1,$2,'teste',$3,$4,$5,$6)`,
    [id, category, cents, due, paidAt, actorUserId],
  );
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "fin@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  const customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Fin", phone: "62999990000" })).id;
  const vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "FIN1A23", brand: "Fiat", model: "Uno" })).id;
  workOrderId = (
    await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Teste", quantity: 1, unitPriceReais: "100,00" }],
    })
  ).workOrder.id;

  paymentId = "pay-out-a";
  await pay(paymentId, 30000, "PIX", "2026-10-10 15:00:00");
  await pay("pay-out-b", 10000, "DINHEIRO", "2026-10-31 23:30:00"); // 20h30 em Brasília: ainda é outubro
  await pay("pay-nov-edge", 5000, "CARTAO", "2026-11-01 02:00:00"); // 31/10 23h em Brasília: conta em outubro
  await pay("pay-set", 20000, "PIX", "2026-09-15 12:00:00");
  await pool.query(
    `INSERT INTO work_order_payment_refunds (id, "paymentId", "workOrderId", "refundCents", reason, "refundedByUserId", "createdAt") VALUES ('ref1',$1,$2,5000,'teste',$3,'2026-10-12 12:00:00')`,
    [paymentId, workOrderId, actorUserId],
  );

  await expense("e1", "ALUGUEL", 20000, "2026-10-05", "2026-10-05 12:00:00");
  await expense("e2", "SALARIOS", 10000, "2026-10-20", "2026-10-20 12:00:00");
  await expense("e3", "FORNECEDORES", 4000, "2026-10-25", null); // não paga: não entra em saídas
  await expense("e4", "ALUGUEL", 8000, "2026-09-05", "2026-09-05 12:00:00");
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("financeiro do mês", () => {
  it("entradas descontam estornos, respeitam o fuso de Brasília e somam por forma", async () => {
    const { current } = await getMonthFinanceService("2026-10");
    expect(current.byMethod).toEqual({ dinheiroCents: 10000, pixCents: 30000, cartaoCents: 5000, outroCents: 0 });
    expect(current.refundsCents).toBe(5000);
    expect(current.revenueCents).toBe(45000 - 5000);
  });

  it("saídas só contam despesas pagas, agrupadas por categoria, com pró-labore à parte", async () => {
    const { current } = await getMonthFinanceService("2026-10");
    expect(current.expensesCents).toBe(30000);
    expect(current.expensesByCategory).toEqual([
      { category: "ALUGUEL", cents: 20000 },
      { category: "SALARIOS", cents: 10000 },
    ]);
    expect(current.proLaboreCents).toBe(10000);
    expect(current.resultCents).toBe(40000 - 30000);
    expect(current.resultBeforeProLaboreCents).toBe(20000);
  });

  it("a pagar do mês soma só o que não foi pago e vence no mês; compara com o mês anterior", async () => {
    const { current, previous } = await getMonthFinanceService("2026-10");
    expect(current.unpaidDueCents).toBe(4000);
    expect(current.unpaidDueCount).toBe(1);
    expect(previous.month).toBe("2026-09");
    expect(previous.revenueCents).toBe(20000);
    expect(previous.expensesCents).toBe(8000);
  });

  it("mês sem movimento volta tudo zerado", async () => {
    const { current } = await getMonthFinanceService("2020-01");
    expect(current).toMatchObject({ revenueCents: 0, expensesCents: 0, resultCents: 0, unpaidDueCents: 0, expensesByCategory: [] });
  });
});
