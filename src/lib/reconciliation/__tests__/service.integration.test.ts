import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  registerWorkOrderPaymentService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { createExpenseService, markExpenseAsPaidService } from "@/lib/expenses/service";
import {
  listReconciliationEntriesService,
  reconcileEntryService,
  undoReconciliationService,
} from "../service";
import { ExpenseNotPaidError, ReconciliationEntryNotFoundError } from "../errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "bank_reconciliations", "work_order_payments", "work_order_closures", "work_order_items",
      "work_orders", "expenses", "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador Conciliação", email: "conciliacao@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "bank_reconciliations", "work_order_payments", "work_order_closures", "work_order_items",
      "work_orders", "expenses", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Conciliação" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CNC1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

const TODAY = new Date().toISOString().slice(0, 10);

async function createDeliveredWorkOrderWithPayment(amountReais = "200,00") {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Serviço Ciclo N", quantity: 1, unitPriceReais: amountReais }],
  });
  await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO", {
    executedByUserId: actorUserId,
  });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
  const payment = await registerWorkOrderPaymentService(actorUserId, os.workOrder.id, {
    amountReais,
    method: "PIX",
  });
  return payment.id;
}

async function createPaidExpense(amountReais = "300,00") {
  const expense = await createExpenseService(actorUserId, {
    category: "OUTROS",
    description: "Despesa Ciclo N",
    amountReais,
    dueDate: TODAY,
  });
  const paid = await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "PIX" });
  return paid.id;
}

describe("reconcileEntryService — recebimentos", () => {
  it("concilia um recebimento, marcando reconciledAt", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment();
    const result = await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);
    expect(result.reconciledAt).toBeTruthy();

    const summary = await listReconciliationEntriesService({ from: TODAY, to: TODAY });
    const entry = summary.entries.find((e) => e.entryId === paymentId);
    expect(entry?.reconciledAt).not.toBeNull();
  });

  it("é idempotente — conciliar duas vezes não duplica nem lança erro", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment();
    const first = await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);
    const second = await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);
    expect(second.reconciledAt).toBe(first.reconciledAt);

    const count = await pool.query(`SELECT COUNT(*) as count FROM bank_reconciliations WHERE "paymentId" = $1`, [
      paymentId,
    ]);
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it("lança erro ao conciliar recebimento inexistente", async () => {
    await expect(reconcileEntryService(actorUserId, "RECEBIMENTO", "id-que-nao-existe")).rejects.toThrow(
      ReconciliationEntryNotFoundError,
    );
  });

  it("grava auditoria RECONCILIATION_MARKED", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment();
    await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'RECONCILIATION_MARKED'`,
      [paymentId],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("reconcileEntryService — despesas", () => {
  it("concilia uma despesa já paga", async () => {
    const expenseId = await createPaidExpense();
    const result = await reconcileEntryService(actorUserId, "DESPESA", expenseId);
    expect(result.reconciledAt).toBeTruthy();
  });

  it("rejeita conciliar despesa ainda não paga", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa pendente",
      amountReais: "50,00",
      dueDate: TODAY,
    });

    await expect(reconcileEntryService(actorUserId, "DESPESA", expense.id)).rejects.toThrow(ExpenseNotPaidError);
  });

  it("lança erro ao conciliar despesa inexistente", async () => {
    await expect(reconcileEntryService(actorUserId, "DESPESA", "id-que-nao-existe")).rejects.toThrow(
      ReconciliationEntryNotFoundError,
    );
  });
});

describe("undoReconciliationService", () => {
  it("desfaz uma conciliação, permitindo re-conciliar depois", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment();
    await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);

    await undoReconciliationService(actorUserId, "RECEBIMENTO", paymentId);
    let summary = await listReconciliationEntriesService({ from: TODAY, to: TODAY });
    let entry = summary.entries.find((e) => e.entryId === paymentId);
    expect(entry?.reconciledAt).toBeNull();

    await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);
    summary = await listReconciliationEntriesService({ from: TODAY, to: TODAY });
    entry = summary.entries.find((e) => e.entryId === paymentId);
    expect(entry?.reconciledAt).not.toBeNull();
  });

  it("não faz nada (no-op) ao desfazer algo que não estava conciliado", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment();
    await expect(undoReconciliationService(actorUserId, "RECEBIMENTO", paymentId)).resolves.not.toThrow();
  });

  it("grava auditoria RECONCILIATION_UNMARKED", async () => {
    const expenseId = await createPaidExpense();
    await reconcileEntryService(actorUserId, "DESPESA", expenseId);
    await undoReconciliationService(actorUserId, "DESPESA", expenseId);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'RECONCILIATION_UNMARKED'`,
      [expenseId],
    );
    expect(logs.rowCount).toBe(1);
  });

  it("não altera o recebimento nem a despesa originais ao conciliar/desfazer", async () => {
    const paymentId = await createDeliveredWorkOrderWithPayment("150,00");
    const before = await pool.query(`SELECT "amountCents", method FROM work_order_payments WHERE id = $1`, [
      paymentId,
    ]);

    await reconcileEntryService(actorUserId, "RECEBIMENTO", paymentId);
    await undoReconciliationService(actorUserId, "RECEBIMENTO", paymentId);

    const after = await pool.query(`SELECT "amountCents", method FROM work_order_payments WHERE id = $1`, [
      paymentId,
    ]);
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});

describe("listReconciliationEntriesService — período", () => {
  it("filtra por período — lançamento fora do intervalo não aparece", async () => {
    await createDeliveredWorkOrderWithPayment("80,00");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const past = yesterday.toISOString().slice(0, 10);
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const evenMorePast = twoDaysAgo.toISOString().slice(0, 10);

    const summary = await listReconciliationEntriesService({ from: evenMorePast, to: past });
    expect(summary.entries.length).toBe(0);
  });

  it("inclui recebimentos e despesas pagas do período, com saldo líquido correto", async () => {
    await createDeliveredWorkOrderWithPayment("100,00");
    await createPaidExpense("40,00");

    const summary = await listReconciliationEntriesService({ from: TODAY, to: TODAY });
    expect(summary.entries.length).toBe(2);
    expect(summary.pendingCents).toBe(6000); // 100 - 40 = 60,00 ainda não conciliado
  });

  it("não inclui despesa pendente (não paga) na listagem", async () => {
    await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa ainda pendente",
      amountReais: "70,00",
      dueDate: TODAY,
    });

    const summary = await listReconciliationEntriesService({ from: TODAY, to: TODAY });
    expect(summary.entries.some((e) => e.description === "Despesa ainda pendente")).toBe(false);
  });
});
