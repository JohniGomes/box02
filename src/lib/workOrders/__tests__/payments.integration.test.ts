import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  getWorkOrderPaymentsSummaryService,
  listReceivablesService,
  listYardService,
  searchWorkOrdersService,
  refundWorkOrderPaymentService,
  registerWorkOrderPaymentService,
  registerWorkOrderPaymentsService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import {
  WorkOrderNotDeliveredError,
  WorkOrderPaymentExceedsBalanceError,
  WorkOrderPaymentNotFoundError,
  WorkOrderPaymentRefundExceedsAmountError,
} from "@/lib/workOrders/errors";
import { acceptReceptionForTest } from "./acceptHelper";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders",
      "vehicles", "customers", "audit_logs",
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
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo I" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CII1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function createDeliveredWorkOrder(totalReais = "200,00") {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Serviço Ciclo I", quantity: 1, unitPriceReais: totalReais }],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste", receptionAwareness1: true, receptionAwareness2: true, receptionAwareness3: true });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
  return os.workOrder.id;
}

describe("registro de recebimento — só permitido com OS ENTREGUE (DEC-I2)", () => {
  it("rejeita registrar recebimento numa OS ainda não entregue", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(
      registerWorkOrderPaymentService(actorUserId, os.workOrder.id, { amountReais: "50,00", method: "DINHEIRO" }),
    ).rejects.toThrow(WorkOrderNotDeliveredError);
  });

  it("permite registrar recebimento numa OS já entregue", async () => {
    const workOrderId = await createDeliveredWorkOrder();
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "50,00", method: "PIX" });
    expect(payment.amountCents).toBe(5000);
    expect(payment.method).toBe("PIX");
  });
});

describe("pagamento parcial, múltiplos recebimentos e saldo (DEC-I4)", () => {
  it("permite múltiplos recebimentos parciais até quitar", async () => {
    const workOrderId = await createDeliveredWorkOrder("200,00");

    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "80,00", method: "DINHEIRO" });
    let summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(8000);
    expect(summary!.remainingCents).toBe(12000);
    expect(summary!.status).toBe("PARCIALMENTE_PAGO");

    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "120,00", method: "CARTAO" });
    summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(20000);
    expect(summary!.remainingCents).toBe(0);
    expect(summary!.status).toBe("QUITADO");
    expect(summary!.payments).toHaveLength(2);
  });

  it("OS sem nenhum recebimento fica EM_ABERTO com saldo igual ao devido", async () => {
    const workOrderId = await createDeliveredWorkOrder("150,00");
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.dueCents).toBe(15000);
    expect(summary!.paidCents).toBe(0);
    expect(summary!.remainingCents).toBe(15000);
    expect(summary!.status).toBe("EM_ABERTO");
  });
});

describe("rejeição de lançamento acima do saldo restante (DEC-I8)", () => {
  it("rejeita um único lançamento maior que o total devido", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    await expect(
      registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "150,00", method: "DINHEIRO" }),
    ).rejects.toThrow(WorkOrderPaymentExceedsBalanceError);
  });

  it("rejeita um segundo lançamento que ultrapasse o saldo já reduzido pelo primeiro", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "70,00", method: "PIX" });
    await expect(
      registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "40,00", method: "PIX" }),
    ).rejects.toThrow(WorkOrderPaymentExceedsBalanceError);
  });

  it("permite lançamento que exatamente quita o saldo restante", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "70,00", method: "PIX" });
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "30,00", method: "OUTRO" });
    expect(payment.amountCents).toBe(3000);
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.status).toBe("QUITADO");
  });
});

describe("congelamento — valor devido nunca muda depois do fechamento", () => {
  it("dueCents permanece igual ao registrar recebimentos (lido só do WorkOrderClosure)", async () => {
    const workOrderId = await createDeliveredWorkOrder("300,00");
    const summaryBefore = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summaryBefore!.dueCents).toBe(30000);

    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "100,00", method: "DINHEIRO" });
    const summaryAfter = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summaryAfter!.dueCents).toBe(30000);
  });
});

describe("write-once — nunca existe update/delete de recebimento", () => {
  it("o módulo de repositório não expõe nenhuma função de update/delete", async () => {
    const repo = await import("@/lib/db/repositories/workOrderPayments");
    expect((repo as Record<string, unknown>).updateWorkOrderPayment).toBeUndefined();
    expect((repo as Record<string, unknown>).deleteWorkOrderPayment).toBeUndefined();
  });
});

describe("auditoria", () => {
  it("grava WORK_ORDER_PAYMENT_REGISTERED a cada lançamento", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    await registerWorkOrderPaymentService(actorUserId, workOrderId, { amountReais: "50,00", method: "PIX" });

    const log = await pool.query(
      `SELECT action, metadata FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_PAYMENT_REGISTERED'`,
      [workOrderId],
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].metadata.amountCents).toBe(5000);
  });
});

describe("Ciclo M — estorno de recebimento (DEC-I6 revisitada)", () => {
  it("estorno parcial reabre o saldo da OS e volta o status para PARCIALMENTE_PAGO", async () => {
    const workOrderId = await createDeliveredWorkOrder("200,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "200,00",
      method: "PIX",
    });
    let summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.status).toBe("QUITADO");

    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "50,00",
      reason: "Cobrança em duplicidade",
    });
    summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(15000);
    expect(summary!.remainingCents).toBe(5000);
    expect(summary!.status).toBe("PARCIALMENTE_PAGO");
    expect(summary!.refunds).toHaveLength(1);
  });

  it("estorno total volta o status para EM_ABERTO", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "DINHEIRO",
    });
    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "100,00",
      reason: "Cliente desistiu do serviço",
    });
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(0);
    expect(summary!.remainingCents).toBe(10000);
    expect(summary!.status).toBe("EM_ABERTO");
  });

  it("o recebimento original nunca é alterado por um estorno — write-once mantido (DEC-I6)", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "DINHEIRO",
    });
    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "40,00",
      reason: "Ajuste",
    });
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    const stillOriginal = summary!.payments.find((p) => p.id === payment.id);
    expect(stillOriginal!.amountCents).toBe(10000);
  });

  it("rejeita estorno acima do valor já estornado disponível do recebimento", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "DINHEIRO",
    });
    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "60,00",
      reason: "Primeiro estorno",
    });
    await expect(
      refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
        refundReais: "50,00",
        reason: "Segundo estorno, ultrapassa",
      }),
    ).rejects.toThrow(WorkOrderPaymentRefundExceedsAmountError);
  });

  it("rejeita estorno de um recebimento que não pertence à OS informada", async () => {
    const workOrderId1 = await createDeliveredWorkOrder("100,00");
    const workOrderId2 = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId1, {
      amountReais: "50,00",
      method: "DINHEIRO",
    });
    await expect(
      refundWorkOrderPaymentService(actorUserId, workOrderId2, payment.id, {
        refundReais: "10,00",
        reason: "Tentativa cruzada",
      }),
    ).rejects.toThrow(WorkOrderPaymentNotFoundError);
  });

  it("permite registrar novo recebimento depois de um estorno reabrir o saldo", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "DINHEIRO",
    });
    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "100,00",
      reason: "Estorno total",
    });
    const newPayment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "PIX",
    });
    expect(newPayment.amountCents).toBe(10000);
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.status).toBe("QUITADO");
  });

  it("grava auditoria WORK_ORDER_PAYMENT_REFUNDED", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, workOrderId, {
      amountReais: "100,00",
      method: "DINHEIRO",
    });
    await refundWorkOrderPaymentService(actorUserId, workOrderId, payment.id, {
      refundReais: "30,00",
      reason: "Ajuste de valor",
    });
    const log = await pool.query(
      `SELECT metadata FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_PAYMENT_REFUNDED'`,
      [workOrderId],
    );
    expect(log.rows.length).toBe(1);
    expect(log.rows[0].metadata.refundCents).toBe(3000);
  });
});

describe("regressão — Ciclos D/E/F/G/H continuam intocados", () => {
  it("gate de aceite de recepção continua funcionando (regressão do Ciclo F)", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow();
  });

  it("closeWorkOrderService continua criando WorkOrderClosure normalmente", async () => {
    const workOrderId = await createDeliveredWorkOrder("100,00");
    const closures = await pool.query(`SELECT "totalAtClosureCents" FROM work_order_closures WHERE "workOrderId" = $1`, [
      workOrderId,
    ]);
    expect(closures.rows).toHaveLength(1);
    expect(closures.rows[0].totalAtClosureCents).toBe(10000);
  });
});

describe("desconto no recebimento (Etapa 3.3)", () => {
  it("abate do saldo, quita a OS e não conta como dinheiro recebido", async () => {
    const workOrderId = await createDeliveredWorkOrder("200,00");

    await registerWorkOrderPaymentsService(actorUserId, workOrderId, {
      payments: [{ amountReais: "197,00", method: "PIX" }],
      discountReais: "3,00",
    });

    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(19700);
    expect(summary!.discountCents).toBe(300);
    expect(summary!.remainingCents).toBe(0);
    expect(summary!.status).toBe("QUITADO");
    expect(summary!.payments).toHaveLength(1);
  });

  it("recusa pagamento + desconto acima do saldo e aceita só desconto", async () => {
    const workOrderId = await createDeliveredWorkOrder("200,00");
    await expect(
      registerWorkOrderPaymentsService(actorUserId, workOrderId, {
        payments: [{ amountReais: "199,00", method: "PIX" }],
        discountReais: "5,00",
      }),
    ).rejects.toThrow(WorkOrderPaymentExceedsBalanceError);

    await registerWorkOrderPaymentsService(actorUserId, workOrderId, { payments: [], discountReais: "10,00" });
    const summary = await getWorkOrderPaymentsSummaryService(workOrderId);
    expect(summary!.paidCents).toBe(0);
    expect(summary!.remainingCents).toBe(19000);
  });
});

describe("A receber (Etapa 4.1)", () => {
  it("lista só OS entregues com saldo, com o saldo certo, e o filtro da lista bate", async () => {
    const owing = await createDeliveredWorkOrder("850,00");
    const partial = await createDeliveredWorkOrder("200,00");
    const paid = await createDeliveredWorkOrder("100,00");

    await registerWorkOrderPaymentsService(actorUserId, partial, {
      payments: [{ amountReais: "100,00", method: "PIX" }],
      discountReais: "10,00",
    });
    await registerWorkOrderPaymentsService(actorUserId, paid, { payments: [{ amountReais: "100,00", method: "PIX" }] });

    const rows = await listReceivablesService();
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.balanceCents]));
    expect(byId[owing]).toBe(85000);
    expect(byId[partial]).toBe(9000);
    expect(byId[paid]).toBeUndefined();

    const filtered = await searchWorkOrdersService({ withBalance: true });
    expect(filtered.items.map((i) => i.id).sort()).toEqual([owing, partial].sort());
    expect(filtered.items.find((i) => i.id === owing)!.balanceCents).toBe(85000);
  });

  it("estorno reabre o saldo", async () => {
    const id = await createDeliveredWorkOrder("100,00");
    const payment = await registerWorkOrderPaymentService(actorUserId, id, { amountReais: "100,00", method: "PIX" });
    expect((await listReceivablesService()).find((r) => r.id === id)).toBeUndefined();

    await refundWorkOrderPaymentService(actorUserId, id, payment.id, { refundReais: "30,00", reason: "Erro" });
    expect((await listReceivablesService()).find((r) => r.id === id)!.balanceCents).toBe(3000);
  });
});

describe("Pátio de hoje", () => {
  it("lista só OS que ainda estão na oficina", async () => {
    const delivered = await createDeliveredWorkOrder("100,00");
    const open = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });

    const ids = (await listYardService()).map((r) => r.id);
    expect(ids).toContain(open.workOrder.id);
    expect(ids).not.toContain(delivered);
  });
});
