import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService, getVehicleService } from "@/lib/vehicles/service";
import {
  createQuoteService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
  getActiveQuoteLinkService,
} from "@/lib/quotes/service";
import {
  cancelWorkOrderService,
  closeWorkOrderService,
  createWorkOrderFromQuoteService,
  createWorkOrderWithoutQuoteService,
  getWorkOrderService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import {
  InvalidWorkOrderItemTransitionError,
  InvalidWorkOrderTransitionError,
  QuoteNotApprovedError,
  WorkOrderHasPendingItemsError,
} from "../errors";
import { VehicleNotOwnedByCustomerError } from "@/lib/quotes/errors";
import { generateWorkOrderNumber } from "../numbering";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%' OR key = 'work_order_number_seq'`);
}

let actorUserId: string;
let customerAId: string;
let customerBId: string;
let vehicleAId: string;
let vehicleBId: string;

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
      "vehicles", "customers" CASCADE`,
  );
  const a = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente A" });
  const b = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente B" });
  customerAId = a.id;
  customerBId = b.id;
  const va = await createVehicleService(actorUserId, { customerId: customerAId, plate: "OSA-0001", mileage: 40000 });
  const vb = await createVehicleService(actorUserId, { customerId: customerBId, plate: "OSB-0002", mileage: 10000 });
  vehicleAId = va.id;
  vehicleBId = vb.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function approvedQuote(overrides: Record<string, unknown> = {}) {
  const created = await createQuoteService(actorUserId, {
    customerId: customerAId,
    vehicleId: vehicleAId,
    items: [
      { type: "SERVICO", category: "NECESSARIO", description: "Troca de óleo", quantity: 1, unitPriceReais: "80,00" },
      { type: "PECA", category: "NECESSARIO", description: "Filtro", quantity: 1, unitPriceReais: "35,00" },
    ],
    ...overrides,
  });
  await sendQuoteVersionService(actorUserId, created.quote.id);
  const link = await getActiveQuoteLinkService(
    (
      await pool.query(`SELECT id FROM quote_versions WHERE "quoteId" = $1`, [created.quote.id])
    ).rows[0].id,
  );
  const items = (
    await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = (SELECT id FROM quote_versions WHERE "quoteId" = $1)`, [
      created.quote.id,
    ])
  ).rows;
  return { created, token: link!.token, items };
}

describe("numeração da OS — contínua, sem colisão", () => {
  it("gera no formato OS-000001", async () => {
    const number = await generateWorkOrderNumber();
    expect(number).toMatch(/^OS-\d{6}$/);
  });

  it("incrementa sequencialmente, sem segmentar por ano", async () => {
    const n1 = await generateWorkOrderNumber();
    const n2 = await generateWorkOrderNumber();
    const seq1 = Number(n1.split("-")[1]);
    const seq2 = Number(n2.split("-")[1]);
    expect(seq2).toBe(seq1 + 1);
  });

  it("não colide sob geração concorrente", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => generateWorkOrderNumber()));
    expect(new Set(results).size).toBe(10);
  });
});

describe("criação de OS SEM orçamento", () => {
  it("cria com itens digitados manualmente, origin SEM_ORCAMENTO", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
      customerComplaint: "Barulho no motor",
      items: [{ type: "SERVICO", description: "Diagnóstico", quantity: 1, unitPriceReais: "50,00" }],
    });

    expect(result.workOrder.sourceQuoteVersionId).toBeNull();
    expect(result.workOrder.status).toBe("ABERTA");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].origin).toBe("SEM_ORCAMENTO");
    expect(result.items[0].status).toBe("PLANEJADO");
  });

  it("permite criar sem nenhum item (diagnóstico ainda por vir)", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    expect(result.items).toHaveLength(0);
  });

  it("rejeita veículo que não pertence ao cliente informado", async () => {
    await expect(
      createWorkOrderWithoutQuoteService(actorUserId, {
        customerId: customerAId,
        vehicleId: vehicleBId,
        mileageAtEntry: 41000,
      }),
    ).rejects.toThrow(VehicleNotOwnedByCustomerError);
  });

  it("congela nome do cliente e placa do veículo no momento da criação", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    expect(result.workOrder.customerNameSnapshot).toBe("Cliente A");
    expect(result.workOrder.vehiclePlateSnapshot).toBe("OSA0001");
  });
});

describe("congelamento — edição posterior do cadastro não afeta a OS já criada", () => {
  it("editar o nome do cliente depois não muda o snapshot gravado na OS", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });

    await pool.query(`UPDATE customers SET "legalName" = 'Nome Totalmente Diferente' WHERE id = $1`, [customerAId]);

    const refetched = await getWorkOrderService(result.workOrder.id);
    expect(refetched?.workOrder.customerNameSnapshot).toBe("Cliente A");
  });
});

describe("D-OS-6 — bump de quilometragem do veículo", () => {
  it("atualiza vehicles.mileage quando a quilometragem da OS é maior", async () => {
    await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 45000, // veículo A começou com 40000
    });
    const vehicle = await getVehicleService(vehicleAId);
    expect(vehicle?.mileage).toBe(45000);
  });

  it("NÃO reduz vehicles.mileage quando a quilometragem da OS é menor", async () => {
    await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 100, // bem menor que os 40000 atuais
    });
    const vehicle = await getVehicleService(vehicleAId);
    expect(vehicle?.mileage).toBe(40000); // permanece o mesmo
  });

  it("work_orders.mileageAtEntry permanece congelada independente do resultado do bump", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 100,
    });
    expect(result.workOrder.mileageAtEntry).toBe(100);
  });

  it("grava auditoria só quando o bump realmente acontece", async () => {
    const result = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 50000,
    });
    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'VEHICLE_MILEAGE_UPDATED_FROM_WORK_ORDER'`,
      [vehicleAId],
    );
    expect(logs.rowCount).toBe(1);
    void result;
  });
});

describe("conversão de orçamento APROVADO (total)", () => {
  it("cria OS com todos os itens aprovados, origin DO_ORCAMENTO, ligados ao item de origem", async () => {
    const { created, token, items } = await approvedQuote();
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.map((i: { id: string }) => ({ itemId: i.id, decision: "APROVADO" })),
      approverName: "Aprovador Total",
    });

    const result = await createWorkOrderFromQuoteService(actorUserId, created.quote.id, {
      mileageAtEntry: 41500,
    });

    expect(result.workOrder.sourceQuoteVersionId).not.toBeNull();
    expect(result.items).toHaveLength(2);
    expect(result.items.every((i) => i.origin === "DO_ORCAMENTO")).toBe(true);
    expect(result.items.every((i) => i.sourceQuoteItemId !== null)).toBe(true);
  });

  it("copia desconto/acréscimo da versão do orçamento para a OS", async () => {
    const { created, token, items } = await approvedQuote({ discount: { type: "PERCENTUAL", value: 10 } });
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.map((i: { id: string }) => ({ itemId: i.id, decision: "APROVADO" })),
      approverName: "Aprovador",
    });
    const result = await createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 });
    expect(result.workOrder.discountType).toBe("PERCENTUAL");
  });

  it("rejeita conversão se o orçamento ainda não foi decidido (ENVIADO)", async () => {
    const { created } = await approvedQuote();
    await expect(
      createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 }),
    ).rejects.toThrow(QuoteNotApprovedError);
  });

  it("rejeita conversão de orçamento RECUSADO", async () => {
    const { created, token, items } = await approvedQuote();
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.map((i: { id: string }) => ({ itemId: i.id, decision: "RECUSADO" })),
      approverName: "Recusador",
    });
    await expect(
      createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 }),
    ).rejects.toThrow(QuoteNotApprovedError);
  });

  it("o orçamento original nunca é alterado pela conversão", async () => {
    const { created, token, items } = await approvedQuote();
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.map((i: { id: string }) => ({ itemId: i.id, decision: "APROVADO" })),
      approverName: "Aprovador",
    });
    const statusBefore = (await pool.query(`SELECT status FROM quotes WHERE id = $1`, [created.quote.id])).rows[0].status;

    await createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 });

    const statusAfter = (await pool.query(`SELECT status FROM quotes WHERE id = $1`, [created.quote.id])).rows[0].status;
    expect(statusAfter).toBe(statusBefore);
  });
});

describe("conversão de orçamento APROVADO_PARCIAL — só itens aprovados entram na OS", () => {
  it("traz somente os itens com clientDecision = APROVADO", async () => {
    const { created, token, items } = await approvedQuote();
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: items[0].id, decision: "APROVADO" },
        { itemId: items[1].id, decision: "RECUSADO" },
      ],
      approverName: "Aprovador Parcial",
    });

    const result = await createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceQuoteItemId).toBe(items[0].id);
  });

  it("o item recusado nunca aparece na OS, mesmo indiretamente", async () => {
    const { created, token, items } = await approvedQuote();
    await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: items[0].id, decision: "APROVADO" },
        { itemId: items[1].id, decision: "RECUSADO" },
      ],
      approverName: "Aprovador Parcial",
    });
    const result = await createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 41500 });
    const referencedQuoteItemIds = result.items.map((i) => i.sourceQuoteItemId);
    expect(referencedQuoteItemIds).not.toContain(items[1].id);
  });
});

describe("máquina de estados da OS", () => {
  async function newOS() {
    return createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
      items: [{ type: "SERVICO", description: "Item 1", quantity: 1, unitPriceReais: "100,00" }],
    });
  }

  it("permite transições válidas: ABERTA -> EM_EXECUCAO -> TESTE_FINAL -> PRONTA", async () => {
    const { workOrder } = await newOS();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    await setWorkOrderStatusService(actorUserId, workOrder.id, "TESTE_FINAL");
    const final = await setWorkOrderStatusService(actorUserId, workOrder.id, "PRONTA");
    expect(final.status).toBe("PRONTA");
  });

  it("permite o caminho com diagnóstico e aguardando peça", async () => {
    const { workOrder } = await newOS();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_DIAGNOSTICO");
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    const waiting = await setWorkOrderStatusService(actorUserId, workOrder.id, "AGUARDANDO_PECA");
    expect(waiting.status).toBe("AGUARDANDO_PECA");
    const back = await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    expect(back.status).toBe("EM_EXECUCAO");
  });

  it("rejeita pulo inválido (ABERTA direto para ENTREGUE)", async () => {
    const { workOrder } = await newOS();
    await expect(setWorkOrderStatusService(actorUserId, workOrder.id, "ENTREGUE")).rejects.toThrow(
      InvalidWorkOrderTransitionError,
    );
  });

  it("rejeita transição a partir de CANCELADA (estado terminal)", async () => {
    const { workOrder } = await newOS();
    await cancelWorkOrderService(actorUserId, workOrder.id, { reason: "Cliente desistiu" });
    await expect(setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO")).rejects.toThrow(
      InvalidWorkOrderTransitionError,
    );
  });

  it("grava startedAt ao entrar em EM_EXECUCAO pela primeira vez", async () => {
    const { workOrder } = await newOS();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    const updated = await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    expect(updated.startedAt).not.toBeNull();
  });

  it("grava auditoria em toda mudança de status", async () => {
    const { workOrder } = await newOS();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_STATUS_CHANGED'`,
      [workOrder.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("execução e cancelamento de item", () => {
  async function newOSWithTwoItems() {
    return createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
      items: [
        { type: "SERVICO", description: "Item A", quantity: 1, unitPriceReais: "100,00" },
        { type: "PECA", description: "Item B", quantity: 1, unitPriceReais: "50,00" },
      ],
    });
  }

  it("marca item como EXECUTADO, registrando quem executou e quando", async () => {
    const { workOrder, items } = await newOSWithTwoItems();
    const updated = await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    expect(updated.status).toBe("EXECUTADO");
    expect(updated.executedByUserId).toBe(actorUserId);
    expect(updated.executedAt).not.toBeNull();
  });

  it("cancela item exigindo motivo", async () => {
    const { workOrder, items } = await newOSWithTwoItems();
    await expect(
      setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", {}),
    ).rejects.toThrow();

    const updated = await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", {
      reason: "Peça indisponível",
    });
    expect(updated.status).toBe("CANCELADO");
    expect(updated.cancelReason).toBe("Peça indisponível");
  });

  it("item cancelado nunca é apagado — continua consultável", async () => {
    const { workOrder, items } = await newOSWithTwoItems();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", {
      reason: "Não será feito",
    });
    const refetched = await getWorkOrderService(workOrder.id);
    expect(refetched?.items).toHaveLength(2);
    expect(refetched?.items.find((i) => i.id === items[0].id)?.status).toBe("CANCELADO");
  });

  it("rejeita mudar status de um item que já não está mais PLANEJADO", async () => {
    const { workOrder, items } = await newOSWithTwoItems();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await expect(
      setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", { reason: "Tarde demais" }),
    ).rejects.toThrow(InvalidWorkOrderItemTransitionError);
  });
});

describe("fechamento da OS", () => {
  async function readyOS() {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
      items: [
        { type: "SERVICO", description: "Serviço executado", quantity: 1, unitPriceReais: "100,00" },
        { type: "PECA", description: "Peça cancelada", quantity: 1, unitPriceReais: "999,00" },
      ],
    });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, created.workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "TESTE_FINAL");
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "PRONTA");
    return created;
  }

  it("bloqueia fechamento com item ainda PLANEJADO", async () => {
    const { workOrder } = await readyOS();
    await expect(
      closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "João" }),
    ).rejects.toThrow(WorkOrderHasPendingItemsError);
  });

  it("fecha corretamente quando todos os itens estão decididos; total considera só EXECUTADO", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", {
      reason: "Cliente não quis",
    });

    const closed = await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "João Receptor" });

    expect(closed.status).toBe("ENTREGUE");
    expect(closed.totalCents).toBe(10000); // só o item de R$100, não os R$999 cancelados
  });

  it("grava work_order_closures com o total no momento do fechamento", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });
    await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "João" });

    const closure = await pool.query(`SELECT * FROM work_order_closures WHERE "workOrderId" = $1`, [workOrder.id]);
    expect(closure.rowCount).toBe(1);
    expect(closure.rows[0].totalAtClosureCents).toBe(10000);
    expect(closure.rows[0].reopenedAt).toBeNull(); // Sub-etapa 3 ainda não existe
  });

  it("aceite de entrega: nome obrigatório, CPF opcional", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });

    await expect(closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "" })).rejects.toThrow();

    const closed = await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "Maria Sem CPF" });
    expect(closed.deliveryAcceptedName).toBe("Maria Sem CPF");
    expect(closed.deliveryAcceptedDocument).toBeNull();
  });

  it("CPF é validado quando informado (rejeita inválido)", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });

    await expect(
      closeWorkOrderService(actorUserId, workOrder.id, {
        deliveryAcceptedName: "Nome",
        deliveryAcceptedDocument: "111.111.111-11", // inválido
      }),
    ).rejects.toThrow();
  });

  it("CPF válido é normalizado (só dígitos) e gravado", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });

    const closed = await closeWorkOrderService(actorUserId, workOrder.id, {
      deliveryAcceptedName: "Nome",
      deliveryAcceptedDocument: "529.982.247-25",
    });
    expect(closed.deliveryAcceptedDocument).toBe("52998224725");
  });

  it("registra deliveredByUserId e deliveredAt automaticamente", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });
    const closed = await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "Nome" });
    expect(closed.deliveredByUserId).toBe(actorUserId);
    expect(closed.deliveredAt).not.toBeNull();
  });

  it("EXECUTADO nunca é confundido com PAGO — nenhum campo de pagamento existe", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });
    const closed = await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "Nome" });
    expect(Object.keys(closed)).not.toContain("paid");
    expect(Object.keys(closed)).not.toContain("paymentStatus");
  });

  it("grava auditoria de fechamento", async () => {
    const { workOrder, items } = await readyOS();
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[1].id, "CANCELADO", { reason: "Não" });
    await closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "Nome" });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_CLOSED'`,
      [workOrder.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("bloqueios de segurança no servidor (não só na UI)", () => {
  it("bloqueia mudança de status de item quando a OS já está ENTREGUE, mesmo chamando o serviço direto", async () => {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
      items: [{ type: "SERVICO", description: "Item", quantity: 1, unitPriceReais: "100,00" }],
    });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, created.workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, created.workOrder.id, created.items[0].id, "EXECUTADO");
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "TESTE_FINAL");
    await setWorkOrderStatusService(actorUserId, created.workOrder.id, "PRONTA");
    await closeWorkOrderService(actorUserId, created.workOrder.id, { deliveryAcceptedName: "Nome" });

    await expect(
      setWorkOrderItemStatusService(actorUserId, created.workOrder.id, created.items[0].id, "CANCELADO", {
        reason: "tentativa pós-fechamento",
      }),
    ).rejects.toThrow(InvalidWorkOrderItemTransitionError);
  });

  it("bloqueia transição de status de uma OS já CANCELADA", async () => {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    await cancelWorkOrderService(actorUserId, created.workOrder.id, { reason: "Motivo" });
    await expect(
      setWorkOrderStatusService(actorUserId, created.workOrder.id, "EM_EXECUCAO"),
    ).rejects.toThrow(InvalidWorkOrderTransitionError);
  });
});

describe("cancelamento da OS", () => {
  it("cancela com motivo, de qualquer status antes de ENTREGUE", async () => {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    const cancelled = await cancelWorkOrderService(actorUserId, created.workOrder.id, { reason: "Cliente desistiu" });
    expect(cancelled.status).toBe("CANCELADA");
    expect(cancelled.cancelReason).toBe("Cliente desistiu");
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it("exige motivo (rejeita string vazia/curta)", async () => {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    await expect(cancelWorkOrderService(actorUserId, created.workOrder.id, { reason: "" })).rejects.toThrow();
  });

  it("grava auditoria de cancelamento", async () => {
    const created = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: customerAId,
      vehicleId: vehicleAId,
      mileageAtEntry: 41000,
    });
    await cancelWorkOrderService(actorUserId, created.workOrder.id, { reason: "Motivo qualquer" });
    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_CANCELLED'`,
      [created.workOrder.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});
