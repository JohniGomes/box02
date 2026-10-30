import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService, createStockMovementService } from "@/lib/inventory/service";
import { createServiceService } from "@/lib/services/service";
import { getMonthFinanceService } from "@/lib/finance/service";
import { currentMonthBr } from "@/lib/finance/month";
import { cardFeeOf, computeMargin } from "../margin";
import { getCardFeePercent, setCardFeePercent } from "@/lib/settings/service";
import { getWorkOrderMarginService } from "../marginService";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import { acceptReceptionForTest } from "./acceptHelper";

describe("cálculo da margem", () => {
  const item = (status: string, totalCents: number, quantity: number, unitCostCents: number | null) => ({ status, totalCents, quantity, unitCostCents });

  it("receita e custo só dos itens executados; desconto abate a receita", () => {
    const m = computeMargin(
      [item("EXECUTADO", 10000, 2, 3000), item("EXECUTADO", 5000, 1, 0), item("PLANEJADO", 9999, 1, 5000), item("CANCELADO", 7777, 1, 5000)],
      1000,
    );
    expect(m).toMatchObject({ revenueCents: 14000, costCents: 6000, profitCents: 8000, marginPercent: 57, itemsWithoutCost: 0, pendingItems: 1 });
  });

  it("item sem custo entra como zero e é contado; sem receita não calcula percentual", () => {
    expect(computeMargin([item("EXECUTADO", 10000, 1, null)], 0)).toMatchObject({ costCents: 0, itemsWithoutCost: 1, marginPercent: 100 });
    expect(computeMargin([], 0)).toMatchObject({ revenueCents: 0, profitCents: 0, marginPercent: null });
  });
});

let actorUserId: string;
let osId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_discounts", "work_order_closures", "work_order_items", "work_orders", "stock_movements", "parts", "services",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'card_fee_percent')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "mg@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  const customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Margem" })).id;
  const vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "MRG1A23" })).id;
  const part = await createPartService({ name: "Filtro", costReais: "30,00" });
  await createStockMovementService(actorUserId, part.id, { type: "ENTRADA", quantity: 10 });
  const service = await createServiceService(actorUserId, { name: "Alinhamento", defaultPriceReais: "80,00", costReais: "40,00" });

  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [
      { type: "PECA", description: "Filtro", quantity: 2, unitPriceReais: "50,00", partId: part.id },
      { type: "MAO_DE_OBRA", description: "Mão de obra digitada", quantity: 1, unitPriceReais: "100,00" },
      { type: "SERVICO", description: "Alinhamento", quantity: 1, unitPriceReais: "80,00", serviceId: service.id },
    ],
  });
  osId = os.workOrder.id;
  await acceptReceptionForTest(actorUserId, osId, {
    receptionAcceptedName: "Ana",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  await setWorkOrderStatusService(actorUserId, osId, "EM_EXECUCAO");
  for (const it of os.items) await setWorkOrderItemStatusService(actorUserId, osId, it.id, "EXECUTADO");
  await setWorkOrderStatusService(actorUserId, osId, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, osId, "PRONTA");
  await closeWorkOrderService(actorUserId, osId, { deliveryAcceptedName: "Ana" });
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("margem de uma OS e do mês, com o custo gravado na execução", () => {
  it("OS: peça pelo custo do estoque, serviço pelo custo estimado, item digitado sem custo", async () => {
    const m = await getWorkOrderMarginService(osId);
    // receita 100 + 100 + 80 = R$ 280; custo 2 x 30 + 0 (sem custo) + 40 = R$ 100
    expect(m).toMatchObject({ revenueCents: 28000, costCents: 10000, profitCents: 18000, marginPercent: 64, itemsWithoutCost: 1, pendingItems: 0 });
  });

  it("mês: soma as OS entregues e o desconto abate a receita", async () => {
    const month = currentMonthBr();
    let { current } = await getMonthFinanceService(month);
    expect(current.margin).toMatchObject({ osCount: 1, revenueCents: 28000, costCents: 10000, profitCents: 18000, marginPercent: 64, itemsWithoutCost: 1 });

    await pool.query(
      `INSERT INTO work_order_discounts (id, "workOrderId", "amountCents", reason, "createdByUserId") VALUES ('d1', $1, 2000, 'teste', $2)`,
      [osId, actorUserId],
    );
    expect((await getWorkOrderMarginService(osId)).profitCents).toBe(16000);
    ({ current } = await getMonthFinanceService(month));
    expect(current.margin).toMatchObject({ revenueCents: 26000, profitCents: 16000 });
  });

  it("mês sem entrega volta zerado", async () => {
    const { current } = await getMonthFinanceService("2020-01");
    expect(current.margin).toMatchObject({ osCount: 0, revenueCents: 0, costCents: 0, profitCents: 0, marginPercent: null });
  });
});

describe("taxa da maquininha (6,83% por padrão, vale para todo pagamento no cartão)", () => {
  it("cálculo: porcentagem sobre o pago no cartão, nunca negativa", () => {
    expect(cardFeeOf(10000, 6.83)).toBe(683);
    expect(cardFeeOf(8000, 6.83)).toBe(546);
    expect(cardFeeOf(0, 6.83)).toBe(0);
    expect(cardFeeOf(-500, 6.83)).toBe(0);
    expect(computeMargin([{ status: "EXECUTADO", totalCents: 10000, quantity: 1, unitCostCents: 2000 }], 0, 683)).toMatchObject({ profitCents: 7317, cardFeeCents: 683 });
  });

  it("padrão 6,83, grava outro valor e recusa valor absurdo", async () => {
    expect(await getCardFeePercent()).toBe(6.83);
    await setCardFeePercent(5);
    expect(await getCardFeePercent()).toBe(5);
    await expect(setCardFeePercent(50)).rejects.toThrow();
    await expect(setCardFeePercent(-1)).rejects.toThrow();
    await pool.query(`DELETE FROM app_settings WHERE key = 'card_fee_percent'`);
    expect(await getCardFeePercent()).toBe(6.83);
  });

  it("OS e mês descontam a taxa só do que foi pago no cartão, sem contar estornos", async () => {
    // até aqui o lucro da OS é R$ 160,00 (receita 260 − desconto já incluído − custo 100)
    expect((await getWorkOrderMarginService(osId)).cardFeeCents).toBe(0); // sem pagamento no cartão: sem taxa

    await pool.query(
      `INSERT INTO work_order_payments (id, "workOrderId", "amountCents", method, "registeredByUserId", "receivedAt") VALUES ('pc1', $1, 10000, 'CARTAO', $2, NOW()), ('pp1', $1, 5000, 'PIX', $2, NOW())`,
      [osId, actorUserId],
    );
    let m = await getWorkOrderMarginService(osId);
    expect(m).toMatchObject({ cardPaidCents: 10000, cardFeePercent: 6.83, cardFeeCents: 683, profitCents: 16000 - 683 });

    await pool.query(
      `INSERT INTO work_order_payment_refunds (id, "paymentId", "workOrderId", "refundCents", reason, "refundedByUserId") VALUES ('rf1', 'pc1', $1, 2000, 'teste', $2)`,
      [osId, actorUserId],
    );
    m = await getWorkOrderMarginService(osId);
    expect(m).toMatchObject({ cardPaidCents: 8000, cardFeeCents: 546, profitCents: 16000 - 546 });

    const { current } = await getMonthFinanceService(currentMonthBr());
    expect(current.margin).toMatchObject({ cardFeeCents: 546, profitCents: 16000 - 546 });
    // taxa estimada sobre o que entrou no cartão no mês (valor cheio, sem estornos): 6,83% de R$ 100,00
    expect(current.cardFeePercent).toBe(6.83);
    expect(current.cardFeeCents).toBe(683);
  });
});
