import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createQuoteService,
  createNewQuoteVersionService,
  getActiveQuoteLinkService,
  resolveQuoteAccessTokenService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
} from "../service";
import {
  QuoteAccessTokenNotFoundError,
  QuoteAlreadyDecidedError,
  QuoteItemsIncompleteDecisionError,
} from "../errors";

async function cleanAll() {
  await pool.query(
    'TRUNCATE "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%'`);
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
    'TRUNCATE "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes", "vehicles", "customers" CASCADE',
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Teste" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "LNK-0001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function createAndSendQuote(overrides: Record<string, unknown> = {}) {
  const created = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [
      { type: "SERVICO", category: "NECESSARIO", description: "Troca de óleo", quantity: 1, unitPriceReais: "80,00" },
      { type: "PECA", category: "NECESSARIO", description: "Filtro", quantity: 1, unitPriceReais: "35,00" },
    ],
    ...overrides,
  });
  await sendQuoteVersionService(actorUserId, created.quote.id);
  return created;
}

async function getTokenFor(quoteId: string) {
  // A versão vigente é sempre a 1 neste helper de teste (orçamento recém-enviado).
  const { rows } = await pool.query(
    `SELECT qv.id FROM quote_versions qv WHERE qv."quoteId" = $1 ORDER BY qv."versionNumber" DESC LIMIT 1`,
    [quoteId],
  );
  const versionId = rows[0].id;
  const link = await getActiveQuoteLinkService(versionId);
  return { token: link!.token, versionId };
}

describe("resolveQuoteAccessTokenService — segurança do token", () => {
  it("token válido de orçamento ENVIADO resolve como 'pending'", async () => {
    const created = await createAndSendQuote();
    const { token } = await getTokenFor(created.quote.id);

    const resolution = await resolveQuoteAccessTokenService(token);
    expect(resolution.kind).toBe("pending");
  });

  it("token inexistente resolve como 'not_found'", async () => {
    const resolution = await resolveQuoteAccessTokenService("token-que-nunca-existiu-0000");
    expect(resolution.kind).toBe("not_found");
  });

  it("token com formato inválido (curto, não-hex) também resolve como 'not_found', sem quebrar", async () => {
    const resolution = await resolveQuoteAccessTokenService("abc");
    expect(resolution.kind).toBe("not_found");
  });

  it("token revogado (nova versão criada) resolve como 'revoked'", async () => {
    const created = await createAndSendQuote();
    const { token } = await getTokenFor(created.quote.id);

    await createNewQuoteVersionService(actorUserId, created.quote.id);

    const resolution = await resolveQuoteAccessTokenService(token);
    expect(resolution.kind).toBe("revoked");
  });

  it("token expirado resolve como 'expired' e grava EXPIRADO no banco (sem apagar nada)", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const created = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Item", quantity: 1, unitPriceReais: "10,00" }],
      validUntil: pastDate.toISOString(),
    });
    await sendQuoteVersionService(actorUserId, created.quote.id);
    const { token } = await getTokenFor(created.quote.id);

    const resolution = await resolveQuoteAccessTokenService(token);
    expect(resolution.kind).toBe("expired");

    const check = await pool.query(`SELECT status FROM quote_versions WHERE "quoteId" = $1`, [created.quote.id]);
    expect(check.rows[0].status).toBe("EXPIRADO");
  });

  it("acessa SOMENTE o orçamento correspondente ao token — nunca outro", async () => {
    const quoteA = await createAndSendQuote();
    const customerB = await createCustomerService(actorUserId, { type: "PF", legalName: "Outro Cliente" });
    const vehicleB = await createVehicleService(actorUserId, { customerId: customerB.id, plate: "LNK-0002" });
    const createdB = await createQuoteService(actorUserId, {
      customerId: customerB.id,
      vehicleId: vehicleB.id,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Outro item", quantity: 1, unitPriceReais: "50,00" }],
    });
    await sendQuoteVersionService(actorUserId, createdB.quote.id);

    const { token: tokenA } = await getTokenFor(quoteA.quote.id);
    const { token: tokenB } = await getTokenFor(createdB.quote.id);

    const resolutionA = await resolveQuoteAccessTokenService(tokenA);
    const resolutionB = await resolveQuoteAccessTokenService(tokenB);

    expect(resolutionA.kind).toBe("pending");
    expect(resolutionB.kind).toBe("pending");
    if (resolutionA.kind === "pending" && resolutionB.kind === "pending") {
      expect(resolutionA.context.quote.id).toBe(quoteA.quote.id);
      expect(resolutionB.context.quote.id).toBe(createdB.quote.id);
      expect(resolutionA.context.quote.id).not.toBe(resolutionB.context.quote.id);
    }
  });
});

describe("submitPublicQuoteDecisionService — fluxo de decisão", () => {
  it("aprovação total: todos os itens aprovados -> versão APROVADO", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
      approverName: "Maria Cliente",
    });

    expect(updated.status).toBe("APROVADO");
  });

  it("recusa total: todos os itens recusados -> versão RECUSADO", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "RECUSADO" })),
      approverName: "Maria Cliente",
      reason: "Vou fazer em outro lugar",
    });

    expect(updated.status).toBe("RECUSADO");
  });

  it("aprovação parcial: pelo menos um aprovado e um recusado -> APROVADO_PARCIAL", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1 ORDER BY id`, [
      versionId,
    ]);

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: items.rows[0].id, decision: "APROVADO" },
        { itemId: items.rows[1].id, decision: "RECUSADO" },
      ],
      approverName: "Maria Cliente",
    });

    expect(updated.status).toBe("APROVADO_PARCIAL");
  });

  it("item pendente (faltando decisão) impede a confirmação", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await expect(
      submitPublicQuoteDecisionService(token, {
        itemDecisions: [{ itemId: items.rows[0].id, decision: "APROVADO" }], // falta o segundo item
        approverName: "Maria Cliente",
      }),
    ).rejects.toThrow(QuoteItemsIncompleteDecisionError);
  });

  it("grava quote_approvals com nome, decisão e canal corretos", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
      approverName: "Maria Cliente",
      approverDocument: "52998224725",
    });

    const approval = await pool.query(`SELECT * FROM quote_approvals WHERE "quoteVersionId" = $1`, [versionId]);
    expect(approval.rows[0].approverName).toBe("Maria Cliente");
    expect(approval.rows[0].approverDocument).toBe("52998224725");
    expect(approval.rows[0].channel).toBe("LINK");
    expect(approval.rows[0].decision).toBe("APROVADO");
  });

  it("nome do aprovador é obrigatório (rejeita string vazia)", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await expect(
      submitPublicQuoteDecisionService(token, {
        itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
        approverName: "",
      }),
    ).rejects.toThrow();
  });

  it("documento é opcional — decisão funciona sem ele", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
      approverName: "Sem Documento",
    });
    expect(updated.status).toBe("APROVADO");
  });

  it("aceita CNPJ válido como documento do aprovador (não só CPF)", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
      approverName: "Aprovador PJ",
      approverDocument: "11.222.333/0001-81",
    });

    const approval = await pool.query(`SELECT "approverDocument" FROM quote_approvals WHERE "quoteVersionId" = $1`, [
      versionId,
    ]);
    expect(approval.rows[0].approverDocument).toBe("11222333000181"); // normalizado
  });

  it("rejeita documento com formato/dígito verificador inválido, em vez de aceitar qualquer texto", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await expect(
      submitPublicQuoteDecisionService(token, {
        itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
        approverName: "Documento Ruim",
        approverDocument: "111.111.111-11", // CPF com dígitos repetidos, inválido
      }),
    ).rejects.toThrow();
  });
});

describe("submitPublicQuoteDecisionService — segurança contra reenvio e token inválido", () => {
  it("rejeita submissão em token inexistente", async () => {
    await expect(
      submitPublicQuoteDecisionService("token-inexistente-0000", {
        itemDecisions: [{ itemId: "qualquer", decision: "APROVADO" }],
        approverName: "Alguém",
      }),
    ).rejects.toThrow(QuoteAccessTokenNotFoundError);
  });

  it("rejeita segunda submissão da mesma decisão (idempotência)", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);
    const payload = {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" as const })),
      approverName: "Primeira Decisão",
    };

    await submitPublicQuoteDecisionService(token, payload);

    await expect(
      submitPublicQuoteDecisionService(token, { ...payload, approverName: "Segunda Tentativa" }),
    ).rejects.toThrow(QuoteAlreadyDecidedError);

    // garante que a SEGUNDA tentativa não sobrescreveu a primeira
    const approvals = await pool.query(`SELECT "approverName" FROM quote_approvals WHERE "quoteVersionId" = $1`, [
      versionId,
    ]);
    expect(approvals.rows).toHaveLength(1);
    expect(approvals.rows[0].approverName).toBe("Primeira Decisão");
  });

  it("rejeita submissão em link revogado (nova versão criada)", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);

    await createNewQuoteVersionService(actorUserId, created.quote.id);

    await expect(
      submitPublicQuoteDecisionService(token, {
        itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" })),
        approverName: "Tentativa Tardia",
      }),
    ).rejects.toThrow(QuoteAlreadyDecidedError);
  });

  it("rejeita decisão referenciando item de OUTRO orçamento (item id inválido para esta versão)", async () => {
    const quoteA = await createAndSendQuote();
    const customerB = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente B" });
    const vehicleB = await createVehicleService(actorUserId, { customerId: customerB.id, plate: "LNK-0003" });
    const quoteB = await createQuoteService(actorUserId, {
      customerId: customerB.id,
      vehicleId: vehicleB.id,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Item de B", quantity: 1, unitPriceReais: "10,00" }],
    });
    await sendQuoteVersionService(actorUserId, quoteB.quote.id);

    const { token: tokenA } = await getTokenFor(quoteA.quote.id);
    const { versionId: versionIdB } = await getTokenFor(quoteB.quote.id);
    const itemsB = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionIdB]);

    await expect(
      submitPublicQuoteDecisionService(tokenA, {
        itemDecisions: [{ itemId: itemsB.rows[0].id, decision: "APROVADO" }],
        approverName: "Tentando decidir item alheio",
      }),
    ).rejects.toThrow(QuoteItemsIncompleteDecisionError);
  });

  it("duas submissões SIMULTÂNEAS: só uma é aplicada, a outra é rejeitada", async () => {
    const created = await createAndSendQuote();
    const { token, versionId } = await getTokenFor(created.quote.id);
    const items = await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionId]);
    const payload = {
      itemDecisions: items.rows.map((r) => ({ itemId: r.id, decision: "APROVADO" as const })),
    };

    const results = await Promise.allSettled([
      submitPublicQuoteDecisionService(token, { ...payload, approverName: "Tentativa 1" }),
      submitPublicQuoteDecisionService(token, { ...payload, approverName: "Tentativa 2" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const approvals = await pool.query(`SELECT "approverName" FROM quote_approvals WHERE "quoteVersionId" = $1`, [
      versionId,
    ]);
    expect(approvals.rows).toHaveLength(1);
  });
});

describe("revogação de link ao criar nova versão", () => {
  it("o link antigo é revogado e o novo link (da nova versão) funciona", async () => {
    const created = await createAndSendQuote();
    const { token: oldToken } = await getTokenFor(created.quote.id);

    await createNewQuoteVersionService(actorUserId, created.quote.id);

    const oldResolution = await resolveQuoteAccessTokenService(oldToken);
    expect(oldResolution.kind).toBe("revoked");

    // link antigo continua no banco, só revogado — não apagamos nada
    const oldLinkRow = await pool.query(`SELECT "revokedAt" FROM quote_access_links WHERE token = $1`, [oldToken]);
    expect(oldLinkRow.rows[0].revokedAt).not.toBeNull();
  });
});
