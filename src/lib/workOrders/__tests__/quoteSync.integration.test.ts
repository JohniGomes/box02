import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createNewQuoteVersionService,
  createQuoteService,
  getActiveQuoteLinkService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
} from "@/lib/quotes/service";
import {
  authorizeAdditionalItemDirectlyService,
  closeWorkOrderService,
  createAdditionalItemService,
  createWorkOrderFromQuoteService,
  getWorkOrderService,
  listWorkOrderCorrectionsService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import { applyQuoteSyncService, getQuoteSyncPreviewService } from "../quoteSyncService";
import { autoPair, computeSyncLines, similarity } from "../quoteSync";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders", "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%' OR key = 'work_order_number_seq'`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "qs@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Fabiano Teste" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "SYN1A23", brand: "Fiat", model: "Strada" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

/** Orçamento v1 aprovado → OS aberta (itens: cilindro R$100, alinhamento R$80, radiador R$300). */
async function osFromApprovedQuote() {
  const created = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [
      { type: "SERVICO", category: "NECESSARIO", description: "Troca do cilindro", quantity: 1, unitPriceReais: "100,00" },
      { type: "SERVICO", category: "NECESSARIO", description: "Alinhamento", quantity: 1, unitPriceReais: "80,00" },
      { type: "SERVICO", category: "NECESSARIO", description: "Troca do radiador", quantity: 1, unitPriceReais: "300,00" },
    ],
  });
  await sendQuoteVersionService(actorUserId, created.quote.id);
  const v1 = (await pool.query(`SELECT id FROM quote_versions WHERE "quoteId" = $1`, [created.quote.id])).rows[0].id as string;
  const link = await getActiveQuoteLinkService(v1);
  const itemRows = (await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [v1])).rows as { id: string }[];
  await submitPublicQuoteDecisionService(link!.token, {
    itemDecisions: itemRows.map((i) => ({ itemId: i.id, decision: "APROVADO" })),
    approverName: "Cliente",
  });
  const os = await createWorkOrderFromQuoteService(actorUserId, created.quote.id, { mileageAtEntry: 50000 });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, {
    receptionAcceptedName: "Cliente",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  return { quoteId: created.quote.id, os };
}

/** Cria a versão 2 (cópia da 1) e a deixa APROVADA com os itens que vierem de `edit`. */
async function approvedV2(quoteId: string, edit: (v2Id: string) => Promise<void>) {
  await createNewQuoteVersionService(actorUserId, quoteId);
  const v2 = (await pool.query(`SELECT id FROM quote_versions WHERE "quoteId" = $1 AND "versionNumber" = 2`, [quoteId])).rows[0].id as string;
  await edit(v2);
  await pool.query(`UPDATE quote_items SET "clientDecision" = 'APROVADO' WHERE "quoteVersionId" = $1`, [v2]);
  await pool.query(`UPDATE quote_versions SET status = 'APROVADO' WHERE id = $1`, [v2]);
  await pool.query(`UPDATE quotes SET status = 'APROVADO' WHERE id = $1`, [quoteId]);
  return v2;
}

async function addV2Item(v2: string, description: string, cents: number) {
  await pool.query(
    `INSERT INTO quote_items (id, "quoteVersionId", type, description, quantity, "unitPriceCents", "totalCents", category, "customerSupplied")
     VALUES ($1, $2, 'SERVICO', $3, 1, $4, $4, 'NECESSARIO', false)`,
    [`qi_${Math.random().toString(36).slice(2)}`, v2, description, cents],
  );
}

describe("pareamento e comparação (lógica pura)", () => {
  const os = (id: string, description: string, cents: number, status = "PLANEJADO") => ({
    id,
    type: "SERVICO",
    description,
    quantity: 1,
    unitPriceCents: cents,
    totalCents: cents,
    status,
    serviceId: null,
    partId: null,
  });
  const q = (id: string, description: string, cents: number) => ({
    id,
    type: "SERVICO",
    description,
    quantity: 1,
    unitPriceCents: cents,
    totalCents: cents,
    serviceId: null,
    partId: null,
  });

  it("pareia igual, mesmo texto com valor novo e texto corrigido parecido; sobra vira item novo ou retirado", () => {
    const osItems = [os("o1", "Troca do cilindro", 10000), os("o2", "Alinhamento", 8000), os("o3", "Troca do radiador", 30000)];
    const quoteItems = [
      q("q1", "Troca dos cilindros traseiros", 10000),
      q("q2", "Alinhamento", 9000),
      q("q4", "Retentores do diferencial", 45000),
    ];
    const pairs = autoPair(osItems, quoteItems);
    expect(pairs).toEqual({ o1: "q1", o2: "q2" });

    const lines = computeSyncLines(osItems, quoteItems, pairs, []);
    const kinds = lines.map((l) => l.kind);
    expect(kinds).toEqual(["PAIR", "PAIR", "REMOVE", "ADD"]);
    const first = lines[0];
    expect(first.kind === "PAIR" && first.changes.description?.to).toBe("Troca dos cilindros traseiros");
    const second = lines[1];
    expect(second.kind === "PAIR" && second.changes.unitPrice).toEqual({ from: 8000, to: 9000 });
  });

  it("item novo parecido com adicional que já existe é marcado como possível duplicidade", () => {
    const quoteItems = [q("q9", "Troca dos retentores do diferencial dianteiro", 45000)];
    const lines = computeSyncLines([], quoteItems, {}, [
      { id: "a1", description: "Retentores do diferencial", quantity: 1, unitPriceCents: 45000, totalCents: 45000 },
    ]);
    expect(lines[0].kind === "ADD" && lines[0].duplicateOf?.id).toBe("a1");
    expect(similarity("Filtro de óleo", "Pastilha de freio")).toBe(0);
  });

  it("item executado: valor não muda, só a descrição", () => {
    const lines = computeSyncLines([os("o1", "Alinhamento", 8000, "EXECUTADO")], [q("q1", "Alinhamento e balanceamento", 9000)], { o1: "q1" });
    const line = lines[0];
    expect(line.kind === "PAIR" && line.blockedNote).toMatch(/executado/);
  });
});

describe("sincronizar a OS com a versão nova do orçamento", () => {
  it("sem versão nova aprovada não há o que sincronizar", async () => {
    const { os, quoteId } = await osFromApprovedQuote();
    const none = await getQuoteSyncPreviewService(os.workOrder.id);
    expect(none.available).toBe(false);

    // Versão 2 ainda pendente (não aprovada pelo cliente).
    await createNewQuoteVersionService(actorUserId, quoteId);
    const pending = await getQuoteSyncPreviewService(os.workOrder.id);
    expect(pending.available).toBe(false);
    expect(!pending.available && pending.reason).toMatch(/não foi aprovada/);
  });

  it("aplica texto, valor, item novo e retirada; não toca em executado nem em adicional; registra no histórico", async () => {
    const { os, quoteId } = await osFromApprovedQuote();
    // Os itens da OS saem ordenados por descrição: procura cada um pelo nome.
    const cilindro = os.items.find((i) => i.description === "Troca do cilindro")!;
    const alinhamento = os.items.find((i) => i.description === "Alinhamento")!;
    const radiador = os.items.find((i) => i.description === "Troca do radiador")!;

    // O alinhamento já foi executado; existe um adicional aprovado "Retentores" de R$ 450.
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, alinhamento.id, "EXECUTADO");
    const extra = await createAdditionalItemService(actorUserId, os.workOrder.id, {
      type: "SERVICO",
      description: "Troca dos retentores",
      quantity: 1,
      unitPriceReais: "450,00",
    });
    await authorizeAdditionalItemDirectlyService(actorUserId, os.workOrder.id, extra.id, {
      decision: "APROVADO",
      authorizedBy: "Fabiano",
      channel: "PRESENCIAL",
    });

    await approvedV2(quoteId, async (v2) => {
      await pool.query(`UPDATE quote_items SET description = 'Troca dos cilindros traseiros', "unitPriceCents" = 12000, "totalCents" = 12000 WHERE "quoteVersionId" = $1 AND description = 'Troca do cilindro'`, [v2]);
      await pool.query(`UPDATE quote_items SET description = 'Alinhamento e balanceamento', "unitPriceCents" = 9000, "totalCents" = 9000 WHERE "quoteVersionId" = $1 AND description = 'Alinhamento'`, [v2]);
      await pool.query(`DELETE FROM quote_items WHERE "quoteVersionId" = $1 AND description = 'Troca do radiador'`, [v2]);
      await addV2Item(v2, "Retentores do diferencial dianteiro", 45000); // o mesmo serviço do adicional
      await addV2Item(v2, "Troca do tubo de arrefecimento", 15000); // item realmente novo
    });

    const preview = await getQuoteSyncPreviewService(os.workOrder.id);
    expect(preview.available).toBe(true);
    if (!preview.available) return;
    expect(preview.fromVersionNumber).toBe(1);
    expect(preview.toVersionNumber).toBe(2);
    expect(preview.additionals.map((a) => a.description)).toEqual(["Troca dos retentores"]);

    const lines = computeSyncLines(preview.osItems, preview.quoteItems, preview.autoPairs, preview.additionals);
    const dup = lines.find((l) => l.kind === "ADD" && l.quoteItem.description.startsWith("Retentores"));
    expect(dup && dup.kind === "ADD" && dup.duplicateOf?.description).toBe("Troca dos retentores");

    const tube = preview.quoteItems.find((q) => q.description === "Troca do tubo de arrefecimento")!;
    const result = await applyQuoteSyncService(actorUserId, os.workOrder.id, {
      updates: Object.entries(preview.autoPairs).map(([osItemId, quoteItemId]) => ({ osItemId, quoteItemId })),
      removals: [radiador.id],
      additions: [tube.id], // o duplicado do adicional fica de fora
      syncAdjustments: false,
    });
    expect(result).toMatchObject({ updated: 1, descriptionsOnly: 1, removed: 1, added: 1 });
    expect(result.skipped.join(" ")).toMatch(/já executado/);

    const after = await getWorkOrderService(os.workOrder.id);
    const byId = new Map(after!.items.map((i) => [i.id, i]));
    expect(byId.get(cilindro.id)).toMatchObject({ description: "Troca dos cilindros traseiros", unitPriceCents: 12000, totalCents: 12000 });
    // Executado: descrição atualizada, valor intacto.
    expect(byId.get(alinhamento.id)).toMatchObject({ description: "Alinhamento e balanceamento", unitPriceCents: 8000 });
    expect(byId.get(radiador.id)).toMatchObject({ status: "CANCELADO" });
    expect(byId.get(radiador.id)?.cancelReason).toMatch(/versão 2/);
    // Adicional intacto e item novo entrou planejado.
    expect(byId.get(extra.id)).toMatchObject({ unitPriceCents: 45000, status: "PLANEJADO" });
    expect(after!.items.find((i) => i.description === "Troca do tubo de arrefecimento")).toMatchObject({ status: "PLANEJADO", origin: "DO_ORCAMENTO" });
    expect(after!.items.some((i) => i.description.startsWith("Retentores do diferencial"))).toBe(false);

    // A OS passa a seguir a versão 2: nada mais a sincronizar.
    expect((await getQuoteSyncPreviewService(os.workOrder.id)).available).toBe(false);

    const history = await listWorkOrderCorrectionsService(os.workOrder.id);
    expect(history[0].kind).toBe("SINCRONIZACAO");
    expect(history[0].to).toContain("versão 2");
  });

  it("copia o desconto da versão nova quando pedido", async () => {
    const { os, quoteId } = await osFromApprovedQuote();
    await approvedV2(quoteId, async (v2) => {
      await pool.query(`UPDATE quote_versions SET "discountType" = 'FIXO', "discountValue" = 5000, "discountReason" = 'Cliente antigo' WHERE id = $1`, [v2]);
    });
    const preview = await getQuoteSyncPreviewService(os.workOrder.id);
    expect(preview.available && preview.adjustmentsDiffer).toBe(true);
    if (!preview.available) return;
    await applyQuoteSyncService(actorUserId, os.workOrder.id, {
      updates: Object.entries(preview.autoPairs).map(([osItemId, quoteItemId]) => ({ osItemId, quoteItemId })),
      removals: [],
      additions: [],
      syncAdjustments: true,
    });
    const after = await getWorkOrderService(os.workOrder.id);
    expect(after!.workOrder).toMatchObject({ discountType: "FIXO", discountValue: 5000 });
  });

  it("não revalida cegamente a tela: par inventado, item de outra OS e cancelar executado são ignorados", async () => {
    const { os, quoteId } = await osFromApprovedQuote();
    await approvedV2(quoteId, async () => undefined);
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    const executado = os.items[1];
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, executado.id, "EXECUTADO");

    const result = await applyQuoteSyncService(actorUserId, os.workOrder.id, {
      updates: [{ osItemId: os.items[0].id, quoteItemId: "nao-existe" }],
      removals: [executado.id, "item-de-outra-os"],
      additions: ["tambem-nao-existe"],
      syncAdjustments: false,
    });
    expect(result).toMatchObject({ updated: 0, removed: 0, added: 0 });
    const after = await getWorkOrderService(os.workOrder.id);
    expect(after!.items.find((i) => i.id === executado.id)?.status).toBe("EXECUTADO");
  });

  it("OS entregue não sincroniza", async () => {
    const { os, quoteId } = await osFromApprovedQuote();
    await approvedV2(quoteId, async () => undefined);
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    for (const item of os.items) await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, item.id, "EXECUTADO");
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    const preview = await getQuoteSyncPreviewService(os.workOrder.id);
    expect(preview.available).toBe(false);
    await expect(
      applyQuoteSyncService(actorUserId, os.workOrder.id, { updates: [], removals: [], additions: [], syncAdjustments: false }),
    ).rejects.toThrow(/entregue ou cancelada/);
  });
});
