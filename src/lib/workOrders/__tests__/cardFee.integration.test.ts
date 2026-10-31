import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { effectivePercent, feeFromNet, grossFromNet, netFromGross, parseFeePercent } from "@/lib/cardFee";
import { getMonthFinanceService } from "@/lib/finance/service";
import { currentMonthBr } from "@/lib/finance/month";
import { setCardFeePercent } from "@/lib/settings/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  getWorkOrderPaymentsSummaryService,
  registerWorkOrderPaymentsService,
  setWorkOrderItemStatusService,
  setWorkOrderPaymentCardFeeService,
  setWorkOrderStatusService,
  refundWorkOrderPaymentService,
} from "../service";
import { getWorkOrderMarginService } from "../marginService";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payment_refunds", "work_order_payments", "work_order_discounts", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('card_fee_percent', 'work_order_number_seq')`);
}

/** OS entregue de R$ 1.167,00 (o caso do Fox). */
async function deliveredOs(price = "1167,00") {
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
  return os.workOrder.id;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "cf@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Cartão" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CFE1A23", brand: "VW", model: "Fox" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("conta da taxa da maquininha", () => {
  it("a taxa incide sobre o valor passado no cartão (caso do Fox: R$ 1.167 líquido, 6,69%)", () => {
    const net = 116700;
    const gross = grossFromNet(net, 6.69);
    expect(gross).toBe(125067); // R$ 1.250,67 (a maquininha mostrou 1.250,68: arredondamento da taxa)
    expect(feeFromNet(net, 6.69)).toBe(8367);
    expect(netFromGross(125068, 6.69)).toBe(116701);
    // Se fosse 6,69% sobre o serviço, ficaria R$ 78,07: a oficina perderia a diferença.
    expect(Math.round(net * 0.0669)).toBe(7807);
    expect(effectivePercent(net, 8368)).toBe(6.69);
  });

  it("lê a porcentagem do jeito que se escreve", () => {
    expect(parseFeePercent("6,69")).toBe(6.69);
    expect(parseFeePercent("6.69%")).toBe(6.69);
    expect(parseFeePercent("")).toBeNull();
    expect(parseFeePercent("abc")).toBeNull();
    expect(parseFeePercent("45")).toBeNull();
  });
});

describe("recebimento no cartão com taxa repassada", () => {
  it("o saldo da OS conta só o valor do serviço; a taxa fica à parte", async () => {
    const osId = await deliveredOs();
    const [payment] = await registerWorkOrderPaymentsService(actorUserId, osId, {
      payments: [{ amountReais: "1167,00", method: "CARTAO", cardFeeReais: "83,68", installments: "4" }],
    });
    expect(payment.amountCents).toBe(116700);
    expect(payment.cardFeeCents).toBe(8368);
    expect(payment.installments).toBe(4);

    const summary = await getWorkOrderPaymentsSummaryService(osId);
    expect(summary?.paidCents).toBe(116700);
    expect(summary?.remainingCents).toBe(0);
    expect(summary?.status).toBe("QUITADO");
  });

  it("não deixa taxa nem parcelas fora do cartão, nem valores inválidos", async () => {
    const osId = await deliveredOs("100,00");
    await expect(
      registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "100,00", method: "PIX", cardFeeReais: "5,00" }] }),
    ).rejects.toThrow(/só valem para recebimento no cartão/);
    await expect(
      registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "100,00", method: "CARTAO", installments: "0" }] }),
    ).rejects.toThrow(/parcelas/);
    await expect(
      registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "100,00", method: "CARTAO", cardFeeReais: "-1,00" }] }),
    ).rejects.toThrow(/taxa/);
    expect((await getWorkOrderPaymentsSummaryService(osId))?.paidCents).toBe(0);
  });

  it("taxa zero ou vazia é 'sem taxa registrada' (continua a estimativa)", async () => {
    const osId = await deliveredOs("100,00");
    const [payment] = await registerWorkOrderPaymentsService(actorUserId, osId, {
      payments: [{ amountReais: "100,00", method: "CARTAO", cardFeeReais: "0,00" }],
    });
    expect(payment.cardFeeCents).toBeNull();
  });

  it("o lucro da OS só estima taxa onde ela NÃO foi repassada", async () => {
    await setCardFeePercent(10);
    const comTaxa = await deliveredOs("200,00");
    await registerWorkOrderPaymentsService(actorUserId, comTaxa, { payments: [{ amountReais: "200,00", method: "CARTAO", cardFeeReais: "22,22" }] });
    expect((await getWorkOrderMarginService(comTaxa)).cardFeeCents).toBe(0);

    const semTaxa = await deliveredOs("200,00");
    await registerWorkOrderPaymentsService(actorUserId, semTaxa, { payments: [{ amountReais: "200,00", method: "CARTAO" }] });
    expect((await getWorkOrderMarginService(semTaxa)).cardFeeCents).toBe(2000); // 10% de R$ 200
  });

  it("o Financeiro soma o líquido nas entradas e mostra a taxa repassada à parte", async () => {
    await setCardFeePercent(10);
    const month = currentMonthBr();
    const before = (await getMonthFinanceService(month)).current;

    const osId = await deliveredOs("500,00");
    await registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "500,00", method: "CARTAO", cardFeeReais: "35,00", installments: "3" }] });

    const after = (await getMonthFinanceService(month)).current;
    expect(after.revenueCents - before.revenueCents).toBe(50000); // só o serviço, sem a taxa
    expect(after.cardFeePassedCents - before.cardFeePassedCents).toBe(3500);
    expect(after.cardFeeCents).toBe(before.cardFeeCents); // sem taxa estimada nova: ela foi repassada
  });

  it("registra a taxa depois, em recebimento antigo; corrige e apaga", async () => {
    const osId = await deliveredOs("850,00");
    const [payment] = await registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "850,00", method: "CARTAO" }] });
    expect(payment.cardFeeCents).toBeNull();

    const set = await setWorkOrderPaymentCardFeeService(actorUserId, osId, payment.id, { cardFeeReais: "58,08", installments: "4" });
    expect(set.cardFeeCents).toBe(5808);
    expect(set.installments).toBe(4);
    expect((await getWorkOrderPaymentsSummaryService(osId))?.paidCents).toBe(85000); // saldo intacto

    const cleared = await setWorkOrderPaymentCardFeeService(actorUserId, osId, payment.id, {});
    expect(cleared.cardFeeCents).toBeNull();
    expect(cleared.installments).toBeNull();
  });

  it("taxa só em recebimento no cartão, e o recebimento precisa ser da OS", async () => {
    const osId = await deliveredOs("100,00");
    const [pix] = await registerWorkOrderPaymentsService(actorUserId, osId, { payments: [{ amountReais: "100,00", method: "PIX" }] });
    await expect(setWorkOrderPaymentCardFeeService(actorUserId, osId, pix.id, { cardFeeReais: "5,00" })).rejects.toThrow(/cartão/);
    const outra = await deliveredOs("100,00");
    await expect(setWorkOrderPaymentCardFeeService(actorUserId, outra, pix.id, { cardFeeReais: "5,00" })).rejects.toThrow();
  });

  it("estorno continua valendo só sobre o valor do serviço", async () => {
    const osId = await deliveredOs("300,00");
    const [payment] = await registerWorkOrderPaymentsService(actorUserId, osId, {
      payments: [{ amountReais: "300,00", method: "CARTAO", cardFeeReais: "21,00" }],
    });
    await refundWorkOrderPaymentService(actorUserId, osId, payment.id, { refundReais: "100,00", reason: "Peça devolvida" });
    const summary = await getWorkOrderPaymentsSummaryService(osId);
    expect(summary?.paidCents).toBe(20000);
    expect(summary?.remainingCents).toBe(10000);
    await expect(
      refundWorkOrderPaymentService(actorUserId, osId, payment.id, { refundReais: "250,00", reason: "Acima do valor" }),
    ).rejects.toThrow();
  });
});
