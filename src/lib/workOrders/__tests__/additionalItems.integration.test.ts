import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  cancelWorkOrderService,
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import {
  adjustAdditionalItemService,
  authorizeAdditionalItemDirectlyService,
  createAdditionalItemService,
  generateAdditionalItemLinkService,
  resolveAdditionalItemAccessTokenService,
  submitAdditionalItemDecisionService,
} from "../service";
import {
  AdditionalItemAccessTokenNotFoundError,
  AdditionalItemAlreadyDecidedError,
  AdditionalItemNotAuthorizedError,
  WorkOrderHasPendingItemsError,
} from "../errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
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
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_items", "quote_versions", "quotes", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Adicional" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "ADI-0001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function newWorkOrder() {
  return createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 30000,
    items: [{ type: "SERVICO", description: "Serviço original", quantity: 1, unitPriceReais: "100,00" }],
  });
}

describe("criação de item adicional", () => {
  it("nasce com origin ADICIONAL_DURANTE_EXECUCAO, clientDecision PENDENTE, createdByUserId preenchido", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Bandeja com problema",
      quantity: 1,
      unitPriceReais: "350,00",
    });

    expect(item.origin).toBe("ADICIONAL_DURANTE_EXECUCAO");
    expect(item.clientDecision).toBe("PENDENTE");
    expect(item.createdByUserId).toBe(actorUserId);
    expect(item.status).toBe("PLANEJADO");
    expect(item.totalCents).toBe(35000);
  });

  it("grava auditoria de criação", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Adicional auditado",
      quantity: 1,
      unitPriceReais: "50,00",
    });
    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_ITEM_ADDITIONAL_CREATED'`,
      [item.id],
    );
    expect(logs.rowCount).toBe(1);
  });

  it("rejeita criar adicional numa OS já fechada/cancelada", async () => {
    const { workOrder } = await newWorkOrder();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    await cancelWorkOrderService(actorUserId, workOrder.id, { reason: "Teste" });

    await expect(
      createAdditionalItemService(actorUserId, workOrder.id, {
        type: "SERVICO",
        description: "Não deveria criar",
        quantity: 1,
        unitPriceReais: "10,00",
      }),
    ).rejects.toThrow();
  });
});

describe("Cenário 10 (AD-4) — bloqueio rígido de execução sem autorização", () => {
  it("rejeita EXECUTADO quando clientDecision ainda é PENDENTE, mesmo chamando o serviço direto", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Sem autorização ainda",
      quantity: 1,
      unitPriceReais: "200,00",
    });

    await expect(
      setWorkOrderItemStatusService(actorUserId, workOrder.id, item.id, "EXECUTADO"),
    ).rejects.toThrow(AdditionalItemNotAuthorizedError);
  });

  it("permite EXECUTADO depois que clientDecision vira APROVADO", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Vai ser autorizado",
      quantity: 1,
      unitPriceReais: "200,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "APROVADO",
      authorizedBy: "Cliente Teste",
      channel: "PRESENCIAL",
    });

    const updated = await setWorkOrderItemStatusService(actorUserId, workOrder.id, item.id, "EXECUTADO");
    expect(updated.status).toBe("EXECUTADO");
  });
});

describe("Cenários 3 e 4 — autorização direta (presencial/telefone)", () => {
  it("presencial: aprova e grava canal/quem/quando", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Autorizado presencial",
      quantity: 1,
      unitPriceReais: "80,00",
    });

    const updated = await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "APROVADO",
      authorizedBy: "João Cliente",
      channel: "PRESENCIAL",
    });

    expect(updated.clientDecision).toBe("APROVADO");
    expect(updated.clientAuthorizedBy).toBe("João Cliente");
    expect(updated.authorizationChannel).toBe("PRESENCIAL");
    expect(updated.clientAuthorizedAt).not.toBeNull();
  });

  it("telefone: recusa e grava observação", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Recusado por telefone",
      quantity: 1,
      unitPriceReais: "80,00",
    });

    const updated = await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "RECUSADO",
      authorizedBy: "Maria Cliente",
      channel: "TELEFONE",
      notes: "Vai fazer em outro lugar",
    });

    expect(updated.clientDecision).toBe("RECUSADO");
    expect(updated.authorizationChannel).toBe("TELEFONE");
    expect(updated.authorizationNotes).toBe("Vai fazer em outro lugar");
  });

  it("recusado nunca pode ser executado (estado terminal)", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Item recusado",
      quantity: 1,
      unitPriceReais: "80,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "RECUSADO",
      authorizedBy: "Cliente",
      channel: "PRESENCIAL",
    });

    await expect(
      setWorkOrderItemStatusService(actorUserId, workOrder.id, item.id, "EXECUTADO"),
    ).rejects.toThrow(AdditionalItemNotAuthorizedError);
  });

  it("rejeita autorizar duas vezes o mesmo item", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Item",
      quantity: 1,
      unitPriceReais: "80,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "APROVADO",
      authorizedBy: "Cliente",
      channel: "PRESENCIAL",
    });

    await expect(
      authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
        decision: "RECUSADO",
        authorizedBy: "Cliente de novo",
        channel: "TELEFONE",
      }),
    ).rejects.toThrow(AdditionalItemAlreadyDecidedError);
  });
});

describe("Cenário 1/2 — link público (AD-1 LINK, AD-3 48h)", () => {
  it("gera token de 64 caracteres hex (256 bits), válido por 48h", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Via link",
      quantity: 1,
      unitPriceReais: "400,00",
    });

    const before = Date.now();
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    expect(token).toMatch(/^[0-9a-f]{64}$/);

    const resolution = await resolveAdditionalItemAccessTokenService(token);
    expect(resolution.kind).toBe("pending");
    if (resolution.kind === "pending") {
      const hoursUntilExpiry =
        (resolution.item.accessTokenExpiresAt!.getTime() - before) / (1000 * 60 * 60);
      expect(hoursUntilExpiry).toBeGreaterThan(47.9);
      expect(hoursUntilExpiry).toBeLessThan(48.1);
    }
  });

  it("token inexistente resolve como not_found", async () => {
    const resolution = await resolveAdditionalItemAccessTokenService("token-que-nunca-existiu");
    expect(resolution.kind).toBe("not_found");
  });

  it("acessa SOMENTE o item correspondente ao token — nunca outro adicional", async () => {
    const { workOrder } = await newWorkOrder();
    const itemA = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Item A",
      quantity: 1,
      unitPriceReais: "100,00",
    });
    const itemB = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Item B",
      quantity: 1,
      unitPriceReais: "200,00",
    });

    const { token: tokenA } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, itemA.id);
    const { token: tokenB } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, itemB.id);

    const resolutionA = await resolveAdditionalItemAccessTokenService(tokenA);
    const resolutionB = await resolveAdditionalItemAccessTokenService(tokenB);

    if (resolutionA.kind === "pending" && resolutionB.kind === "pending") {
      expect(resolutionA.item.id).toBe(itemA.id);
      expect(resolutionB.item.id).toBe(itemB.id);
      expect(resolutionA.item.description).toBe("Item A");
      expect(resolutionB.item.description).toBe("Item B");
    } else {
      throw new Error("esperava 'pending' para os dois");
    }
  });

  it("aprovação via link grava clientDecision, canal LINK e IP", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Aprovado via link",
      quantity: 1,
      unitPriceReais: "150,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    const updated = await submitAdditionalItemDecisionService(token, {
      decision: "APROVADO",
      approverName: "Cliente Via Link",
      ipAddress: "203.0.113.10",
    });

    expect(updated.clientDecision).toBe("APROVADO");
    expect(updated.authorizationChannel).toBe("LINK");
    expect(updated.clientAuthorizedBy).toBe("Cliente Via Link");
  });

  it("recusa via link com motivo", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Recusado via link",
      quantity: 1,
      unitPriceReais: "150,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    const updated = await submitAdditionalItemDecisionService(token, {
      decision: "RECUSADO",
      approverName: "Cliente Via Link",
      notes: "Muito caro",
    });

    expect(updated.clientDecision).toBe("RECUSADO");
  });

  it("rejeita submissão em token inexistente", async () => {
    await expect(
      submitAdditionalItemDecisionService("token-fake-0000", {
        decision: "APROVADO",
        approverName: "Alguém",
      }),
    ).rejects.toThrow(AdditionalItemAccessTokenNotFoundError);
  });

  it("rejeita segunda submissão (idempotência) — não sobrescreve a primeira decisão", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Dupla submissão",
      quantity: 1,
      unitPriceReais: "90,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    await submitAdditionalItemDecisionService(token, { decision: "APROVADO", approverName: "Primeira" });

    await expect(
      submitAdditionalItemDecisionService(token, { decision: "RECUSADO", approverName: "Segunda" }),
    ).rejects.toThrow(AdditionalItemAlreadyDecidedError);

    const check = await pool.query(`SELECT "clientAuthorizedBy" FROM work_order_items WHERE id = $1`, [item.id]);
    expect(check.rows[0].clientAuthorizedBy).toBe("Primeira");
  });

  it("duas submissões SIMULTÂNEAS: só uma é aplicada", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Concorrência",
      quantity: 1,
      unitPriceReais: "90,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    const results = await Promise.allSettled([
      submitAdditionalItemDecisionService(token, { decision: "APROVADO", approverName: "Tentativa 1" }),
      submitAdditionalItemDecisionService(token, { decision: "RECUSADO", approverName: "Tentativa 2" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it("aprovação via link permite depois marcar como executado", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Aprovado e executado",
      quantity: 1,
      unitPriceReais: "150,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);
    await submitAdditionalItemDecisionService(token, { decision: "APROVADO", approverName: "Cliente" });

    const updated = await setWorkOrderItemStatusService(actorUserId, workOrder.id, item.id, "EXECUTADO");
    expect(updated.status).toBe("EXECUTADO");
  });
});

describe("gerar novo link para o mesmo item (Cenário 7 via ajuste)", () => {
  it("gerar novo link para o item ainda PENDENTE substitui o anterior", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Regerar link",
      quantity: 1,
      unitPriceReais: "80,00",
    });
    const first = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);
    const second = await generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id);

    expect(first.token).not.toBe(second.token);

    const resolutionOld = await resolveAdditionalItemAccessTokenService(first.token);
    const resolutionNew = await resolveAdditionalItemAccessTokenService(second.token);
    expect(resolutionOld.kind).toBe("not_found");
    expect(resolutionNew.kind).toBe("pending");
  });

  it("rejeita gerar link para item que já foi decidido", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Já decidido",
      quantity: 1,
      unitPriceReais: "80,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "APROVADO",
      authorizedBy: "Cliente",
      channel: "PRESENCIAL",
    });

    await expect(
      generateAdditionalItemLinkService(actorUserId, workOrder.id, item.id),
    ).rejects.toThrow(AdditionalItemAlreadyDecidedError);
  });
});

describe("AD-6 — Ajustar valor/escopo (Cenários 5 e 7)", () => {
  it("cancela o item anterior e cria um novo atomicamente, preenchendo supersedesItemId", async () => {
    const { workOrder } = await newWorkOrder();
    const original = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Bandeja — valor a confirmar",
      quantity: 1,
      unitPriceReais: "500,00",
    });

    const adjusted = await adjustAdditionalItemService(actorUserId, workOrder.id, original.id, {
      description: "Bandeja — só a peça, sem mão de obra",
      quantity: 1,
      unitPriceReais: "300,00",
      adjustReason: "Cliente pediu redução de escopo",
    });

    expect(adjusted.id).not.toBe(original.id);
    expect(adjusted.totalCents).toBe(30000);
    expect(adjusted.supersedesItemId).toBe(original.id);
    expect(adjusted.clientDecision).toBe("PENDENTE");
    expect(adjusted.status).toBe("PLANEJADO");

    const oldItem = await pool.query(
      `SELECT status, "cancelReason", "totalCents" FROM work_order_items WHERE id = $1`,
      [original.id],
    );
    expect(oldItem.rows[0].status).toBe("CANCELADO");
    expect(oldItem.rows[0].cancelReason).toBe("Cliente pediu redução de escopo");
    expect(oldItem.rows[0].totalCents).toBe(50000);
  });

  it("nunca edita o item antigo em memória — os dois continuam consultáveis no histórico", async () => {
    const { workOrder } = await newWorkOrder();
    const original = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Valor errado",
      quantity: 1,
      unitPriceReais: "300,00",
    });
    await adjustAdditionalItemService(actorUserId, workOrder.id, original.id, {
      description: "Valor corrigido",
      quantity: 1,
      unitPriceReais: "350,00",
      adjustReason: "Valor corrigido",
    });

    const allItems = await pool.query(
      `SELECT description, "totalCents" FROM work_order_items WHERE "workOrderId" = $1 ORDER BY "createdAt"`,
      [workOrder.id],
    );
    expect(allItems.rowCount).toBe(3);
  });

  it("revoga o link antigo ao ajustar um item que já tinha link ativo", async () => {
    const { workOrder } = await newWorkOrder();
    const original = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Com link",
      quantity: 1,
      unitPriceReais: "300,00",
    });
    const { token } = await generateAdditionalItemLinkService(actorUserId, workOrder.id, original.id);

    await adjustAdditionalItemService(actorUserId, workOrder.id, original.id, {
      description: "Ajustado",
      quantity: 1,
      unitPriceReais: "250,00",
      adjustReason: "Correção",
    });

    const resolution = await resolveAdditionalItemAccessTokenService(token);
    expect(resolution.kind).toBe("revoked");
  });

  it("rejeita ajustar um item que já foi decidido", async () => {
    const { workOrder } = await newWorkOrder();
    const item = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Já aprovado",
      quantity: 1,
      unitPriceReais: "100,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, item.id, {
      decision: "APROVADO",
      authorizedBy: "Cliente",
      channel: "PRESENCIAL",
    });

    await expect(
      adjustAdditionalItemService(actorUserId, workOrder.id, item.id, {
        description: "Tentando ajustar",
        quantity: 1,
        unitPriceReais: "50,00",
        adjustReason: "Não deveria funcionar",
      }),
    ).rejects.toThrow();
  });

  it("grava auditoria WORK_ORDER_ITEM_SUPERSEDED", async () => {
    const { workOrder } = await newWorkOrder();
    const original = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "SERVICO",
      description: "Item",
      quantity: 1,
      unitPriceReais: "100,00",
    });
    const adjusted = await adjustAdditionalItemService(actorUserId, workOrder.id, original.id, {
      description: "Item corrigido",
      quantity: 1,
      unitPriceReais: "120,00",
      adjustReason: "Motivo",
    });

    const logs = await pool.query(
      `SELECT metadata FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_ITEM_SUPERSEDED'`,
      [adjusted.id],
    );
    expect(logs.rowCount).toBe(1);
    expect(logs.rows[0].metadata.supersedesItemId).toBe(original.id);
  });
});

describe("correção de concorrência — FOR UPDATE em setWorkOrderItemStatusService", () => {
  it("duas tentativas simultâneas de mudar o mesmo item: só uma é aplicada", async () => {
    const { workOrder, items } = await newWorkOrder();

    const results = await Promise.allSettled([
      setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO"),
      setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "CANCELADO", { reason: "Motivo" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);

    const final = await pool.query(`SELECT status FROM work_order_items WHERE id = $1`, [items[0].id]);
    expect(["EXECUTADO", "CANCELADO"]).toContain(final.rows[0].status);
  });
});

describe("fechamento da OS com adicional aprovado mas não executado (Cenário 8)", () => {
  it("bloqueia fechamento enquanto o adicional aprovado não for decidido (executado/cancelado)", async () => {
    const { workOrder, items } = await newWorkOrder();
    await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrder.id, { receptionAcceptedName: "Aceite Teste" });
    await setWorkOrderStatusService(actorUserId, workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, workOrder.id, items[0].id, "EXECUTADO");

    const additional = await createAdditionalItemService(actorUserId, workOrder.id, {
      type: "PECA",
      description: "Aprovado mas esquecido",
      quantity: 1,
      unitPriceReais: "200,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, workOrder.id, additional.id, {
      decision: "APROVADO",
      authorizedBy: "Cliente",
      channel: "PRESENCIAL",
    });

    await setWorkOrderStatusService(actorUserId, workOrder.id, "TESTE_FINAL");
    await setWorkOrderStatusService(actorUserId, workOrder.id, "PRONTA");

    await expect(
      closeWorkOrderService(actorUserId, workOrder.id, { deliveryAcceptedName: "Nome" }),
    ).rejects.toThrow(WorkOrderHasPendingItemsError);
  });
});
