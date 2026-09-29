import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createQuoteService,
  updateQuoteVersionService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
  getActiveQuoteLinkService,
} from "@/lib/quotes/service";
import { getQuoteIndicatorsService } from "@/lib/quotes/indicators";
import { createWorkOrderFromQuoteService } from "@/lib/workOrders/service";
import { QuoteItemsIncompleteDecisionError } from "@/lib/quotes/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
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
      "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo C1" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIC1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function decisionHelpers(quoteId: string) {
  const version = (await pool.query(`SELECT id FROM quote_versions WHERE "quoteId" = $1`, [quoteId])).rows[0];
  const link = await getActiveQuoteLinkService(version.id);
  const items = (
    await pool.query(`SELECT id, description, category FROM quote_items WHERE "quoteVersionId" = $1`, [version.id])
  ).rows as { id: string; description: string; category: string }[];
  return { versionId: version.id, token: link!.token, items };
}

describe("CENÁRIO EXPLÍCITO — R$500 NECESSÁRIO + R$300 RECOMENDADO + R$200 INFORMATIVO", () => {
  it("total do orçamento = R$800 (nunca R$1.000); valor informativo = R$200, nunca somado", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "500,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "300,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "200,00" },
      ],
    });

    expect(quote.version.totalCents).toBe(80000);
    const informativoItem = quote.items.find((i) => i.category === "INFORMATIVO")!;
    expect(informativoItem.unitPriceCents).toBe(20000);
    expect(informativoItem.totalCents).toBe(20000);

    const decidableSum = quote.items
      .filter((i) => i.category !== "INFORMATIVO")
      .reduce((sum, i) => sum + i.totalCents, 0);
    expect(decidableSum).toBe(80000);
    expect(quote.version.totalCents).toBe(decidableSum);
  });
});

describe("INFORMATIVO não pode ser aprovado por chamada direta ao servidor", () => {
  it("rejeita submissão de decisão que inclua um item informativo", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "100,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "50,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;
    const informativo = items.find((i) => i.category === "INFORMATIVO")!;

    await expect(
      submitPublicQuoteDecisionService(token, {
        itemDecisions: [
          { itemId: necessario.id, decision: "APROVADO" },
          { itemId: informativo.id, decision: "APROVADO" },
        ],
        approverName: "Cliente Teste",
      }),
    ).rejects.toThrow(QuoteItemsIncompleteDecisionError);
  });
});

describe("INFORMATIVO não pode gerar OS mesmo por chamada direta ao serviço", () => {
  it("conversão em OS nunca inclui item informativo, mesmo com valor alto", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "100,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo caro", quantity: 1, unitPriceReais: "9999,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;

    await submitPublicQuoteDecisionService(token, {
      itemDecisions: [{ itemId: necessario.id, decision: "APROVADO" }],
      approverName: "Cliente Teste",
    });

    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { mileageAtEntry: 1000 });
    expect(os.items).toHaveLength(1);
    expect(os.items[0].description).toBe("Necessário");
    const total = os.items.reduce((sum, i) => sum + i.unitPriceCents, 0);
    expect(total).toBe(10000);
  });
});

describe("INFORMATIVO não bloqueia aprovação do restante nem a submissão da decisão", () => {
  it("orçamento com necessário+recomendado+informativo é decidido normalmente, informativo de fora", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "500,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "300,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "200,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;
    const recomendado = items.find((i) => i.category === "RECOMENDADO")!;
    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: necessario.id, decision: "APROVADO" },
        { itemId: recomendado.id, decision: "APROVADO" },
      ],
      approverName: "Cliente Teste",
    });
    expect(updated.status).toBe("APROVADO");
  });
});

describe("aprovação parcial considera só NECESSÁRIO e RECOMENDADO", () => {
  it("aprova só o necessário, recusa o recomendado, informativo de fora -> APROVADO_PARCIAL", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "500,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "300,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "200,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;
    const recomendado = items.find((i) => i.category === "RECOMENDADO")!;

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: necessario.id, decision: "APROVADO" },
        { itemId: recomendado.id, decision: "RECUSADO" },
      ],
      approverName: "Cliente Teste",
    });
    expect(updated.status).toBe("APROVADO_PARCIAL");
  });

  it("aprova todos os decidíveis, informativo nunca conta -> APROVADO total (não parcial)", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "500,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "300,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "200,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;
    const recomendado = items.find((i) => i.category === "RECOMENDADO")!;

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: [
        { itemId: necessario.id, decision: "APROVADO" },
        { itemId: recomendado.id, decision: "APROVADO" },
      ],
      approverName: "Cliente Teste",
    });
    expect(updated.status).toBe("APROVADO");
  });
});

describe("versionamento — categoria preservada na versão anterior", () => {
  it("editar rascunho muda categoria livremente; depois de enviado, versão antiga preserva a categoria intacta", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "RECOMENDADO", description: "Item reclassificável", quantity: 1, unitPriceReais: "100,00" }],
    });

    const editedDraft = await updateQuoteVersionService(actorUserId, quote.quote.id, {
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Item reclassificável", quantity: 1, unitPriceReais: "100,00" }],
    });
    expect(editedDraft.items[0].category).toBe("NECESSARIO");

    await sendQuoteVersionService(actorUserId, quote.quote.id);

    const v1ItemsBefore = await pool.query(
      `SELECT category FROM quote_items WHERE "quoteVersionId" = (SELECT id FROM quote_versions WHERE "quoteId" = $1 AND "versionNumber" = 1)`,
      [quote.quote.id],
    );
    expect(v1ItemsBefore.rows[0].category).toBe("NECESSARIO");
  });
});

describe("indicadores — INFORMATIVO nunca contabilizado", () => {
  it("valor total orçado e ticket médio excluem informativo", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "500,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "300,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "200,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);

    const indicators = await getQuoteIndicatorsService();
    expect(indicators.totalQuotedValueCents).toBe(80000);
    expect(indicators.avgQuoteValueCents).toBe(80000);
  });

  it("valor aprovado nunca inclui informativo", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "100,00" },
        { type: "SERVICO", category: "INFORMATIVO", description: "Informativo", quantity: 1, unitPriceReais: "50,00" },
      ],
    });
    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);
    const necessario = items.find((i) => i.category === "NECESSARIO")!;

    await submitPublicQuoteDecisionService(token, {
      itemDecisions: [{ itemId: necessario.id, decision: "APROVADO" }],
      approverName: "Cliente Teste",
    });

    const indicators = await getQuoteIndicatorsService();
    expect(indicators.approvedValueCents).toBe(10000);
  });
});

describe("regressão — orçamento sem nenhum informativo se comporta exatamente como antes", () => {
  it("fluxo completo necessário+recomendado, sem informativo algum", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Necessário", quantity: 1, unitPriceReais: "200,00" },
        { type: "SERVICO", category: "RECOMENDADO", description: "Recomendado", quantity: 1, unitPriceReais: "100,00" },
      ],
    });
    expect(quote.version.totalCents).toBe(30000);

    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const { token, items } = await decisionHelpers(quote.quote.id);

    const updated = await submitPublicQuoteDecisionService(token, {
      itemDecisions: items.map((i) => ({ itemId: i.id, decision: "APROVADO" as const })),
      approverName: "Cliente Teste",
    });
    expect(updated.status).toBe("APROVADO");

    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { mileageAtEntry: 500 });
    expect(os.items).toHaveLength(2);
  });
});
