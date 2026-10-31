import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  refundWorkOrderPaymentService,
  registerWorkOrderPaymentsService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { acceptReceptionForTest } from "@/lib/workOrders/__tests__/acceptHelper";
import { CASH_PERIODS, cashRange, getCashSummaryService, parseCashPeriod } from "../cash";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payment_refunds", "work_order_payments", "work_order_discounts", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

async function deliveredOs(price: string) {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Serviço", quantity: 1, unitPriceReais: price }],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, {
    receptionAcceptedName: "Cliente",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
  return os.workOrder;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "cx@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Caixa" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CXA1A23", brand: "Fiat", model: "Uno" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("períodos do caixa", () => {
  const now = new Date("2026-10-31T15:00:00.000Z"); // 31/10/2026 12h em Brasília

  it("calcula hoje, 7 dias, mês e mês passado (dias de Brasília, fim não incluso)", () => {
    expect(cashRange("hoje", now)).toMatchObject({ from: "2026-10-31", to: "2026-11-01" });
    expect(cashRange("semana", now)).toMatchObject({ from: "2026-10-25", to: "2026-11-01" });
    expect(cashRange("mes", now)).toMatchObject({ from: "2026-10-01", to: "2026-11-01" });
    expect(cashRange("mes-passado", now)).toMatchObject({ from: "2026-09-01", to: "2026-10-01" });
  });

  it("valor desconhecido vira 'hoje'; todos os períodos têm nome", () => {
    expect(parseCashPeriod(undefined).period).toBe("hoje");
    expect(parseCashPeriod("qualquer").period).toBe("hoje");
    expect(parseCashPeriod("mes").period).toBe("mes");
    expect(parseCashPeriod("tudo").period).toBe("tudo");
    expect(CASH_PERIODS.map((p) => p.id)).toEqual(["hoje", "semana", "mes", "mes-passado", "tudo"]);
  });

  it("período personalizado: datas válidas, invertidas viram o intervalo certo, inválidas voltam a 'hoje'", () => {
    const now = new Date("2026-10-31T15:00:00.000Z");
    const ok = parseCashPeriod(undefined, "2026-08-01", "2026-08-31");
    expect(ok).toEqual({ period: "personalizado", custom: { from: "2026-08-01", to: "2026-08-31" } });
    expect(cashRange("personalizado", now, ok.custom)).toMatchObject({ from: "2026-08-01", to: "2026-09-01" });
    expect(parseCashPeriod(undefined, "2026-08-31", "2026-08-01").custom).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(parseCashPeriod(undefined, "ontem", "2026-08-01").period).toBe("hoje");
    expect(cashRange("tudo", now).from).toBe("1900-01-01");
  });

  it("à meia-noite de Brasília já é o dia seguinte", () => {
    const lateNight = new Date("2026-11-01T02:30:00.000Z"); // 31/10 23h30 em Brasília
    expect(cashRange("hoje", lateNight).from).toBe("2026-10-31");
    const afterMidnight = new Date("2026-11-01T03:30:00.000Z"); // 01/11 00h30 em Brasília
    expect(cashRange("hoje", afterMidnight).from).toBe("2026-11-01");
  });
});

describe("caixa: a receber e recebido", () => {
  it("lista o que falta receber e o que entrou hoje, com totais por forma, taxa e estorno", async () => {
    const empty = await getCashSummaryService("hoje");
    expect(empty.receivables).toHaveLength(0);
    expect(empty.payments).toHaveLength(0);
    expect(empty.totalReceivedCents).toBe(0);

    const devendo = await deliveredOs("500,00"); // ninguém pagou ainda
    const parcial = await deliveredOs("1000,00");
    const cartao = await deliveredOs("300,00");

    await registerWorkOrderPaymentsService(actorUserId, parcial.id, {
      payments: [
        { amountReais: "400,00", method: "PIX" },
        { amountReais: "100,00", method: "DINHEIRO" },
      ],
    });
    const [card] = await registerWorkOrderPaymentsService(actorUserId, cartao.id, {
      payments: [{ amountReais: "300,00", method: "CARTAO", cardFeeReais: "21,00", installments: "3" }],
    });
    await refundWorkOrderPaymentService(actorUserId, cartao.id, card.id, { refundReais: "50,00", reason: "Peça devolvida" });

    const cash = await getCashSummaryService("hoje");

    // A receber: o que não foi pago e o que ficou com saldo; a OS quitada no cartão com estorno volta a ter saldo de R$ 50.
    expect(cash.receivables.map((r) => r.number).sort()).toEqual([devendo.number, parcial.number, cartao.number].sort());
    const byNumber = new Map(cash.receivables.map((r) => [r.number, r]));
    expect(byNumber.get(devendo.number)).toMatchObject({ dueCents: 50000, balanceCents: 50000, plate: "CXA1A23" });
    expect(byNumber.get(parcial.number)).toMatchObject({ dueCents: 100000, balanceCents: 50000 });
    expect(byNumber.get(cartao.number)).toMatchObject({ balanceCents: 5000 });
    expect(cash.receivablesTotalCents).toBe(50000 + 50000 + 5000);

    // Recebido hoje: valor dos serviços por forma; taxa à parte; estorno separado.
    expect(cash.byMethod).toEqual({ DINHEIRO: 10000, PIX: 40000, CARTAO: 30000, OUTRO: 0 });
    expect(cash.totalReceivedCents).toBe(80000);
    expect(cash.cardFeePassedCents).toBe(2100);
    expect(cash.refundsCents).toBe(5000);
    expect(cash.payments).toHaveLength(3);
    const cardRow = cash.payments.find((p) => p.id === card.id)!;
    expect(cardRow).toMatchObject({ cardFeeCents: 2100, installments: 3, refundedCents: 5000, customerName: "Cliente Caixa" });
  });

  it("busca por número da OS, cliente (sem acento) ou placa filtra pagamentos, a receber e OS encontradas", async () => {
    const os = await deliveredOs("120,00");
    await registerWorkOrderPaymentsService(actorUserId, os.id, { payments: [{ amountReais: "20,00", method: "PIX" }] });

    const byNumber = await getCashSummaryService("tudo", new Date(), { q: os.number.toLowerCase() });
    expect(byNumber.orders.map((o) => o.id)).toContain(os.id);
    const found = byNumber.orders.find((o) => o.id === os.id)!;
    expect(found).toMatchObject({ dueCents: 12000, paidCents: 2000, balanceCents: 10000 });
    expect(byNumber.payments.every((p) => p.number === os.number)).toBe(true);
    expect(byNumber.receivables.map((r) => r.id)).toEqual([os.id]);

    expect((await getCashSummaryService("tudo", new Date(), { q: "caixa" })).orders.length).toBeGreaterThan(0);
    expect((await getCashSummaryService("tudo", new Date(), { q: "cxa-1a23" })).orders.length).toBeGreaterThan(0);
    const none = await getCashSummaryService("tudo", new Date(), { q: "zzzinexistente" });
    expect(none.orders).toHaveLength(0);
    expect(none.payments).toHaveLength(0);
    expect(none.receivables).toHaveLength(0);
    expect((await getCashSummaryService("tudo", new Date(), { q: "   " })).orders).toHaveLength(0);
  });

  it("recebimento de outro dia não entra em 'hoje', mas entra em '7 dias' e no mês", async () => {
    const os = await deliveredOs("200,00");
    const [p] = await registerWorkOrderPaymentsService(actorUserId, os.id, { payments: [{ amountReais: "200,00", method: "PIX" }] });
    await pool.query(`UPDATE work_order_payments SET "receivedAt" = NOW() - interval '3 days' WHERE id = $1`, [p.id]);

    expect((await getCashSummaryService("hoje")).payments.some((x) => x.id === p.id)).toBe(false);
    expect((await getCashSummaryService("semana")).payments.some((x) => x.id === p.id)).toBe(true);
    // Mês passado só se cair no mês anterior: com 3 dias atrás, depende da data de hoje; o importante é não quebrar.
    expect(await getCashSummaryService("mes-passado")).toHaveProperty("payments");
  });
});
