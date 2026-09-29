import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  cancelQuoteVersionService,
  createNewQuoteVersionService,
  createQuoteService,
  getQuoteService,
  sendQuoteVersionService,
  updateQuoteVersionService,
} from "../service";
import {
  InvalidQuoteTransitionError,
  QuoteVersionNotEditableError,
  VehicleNotOwnedByCustomerError,
} from "../errors";

async function cleanAll() {
  await pool.query(
    'TRUNCATE "quote_items", "quote_versions", "quotes", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%'`);
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
  await pool.query('TRUNCATE "quote_items", "quote_versions", "quotes", "vehicles", "customers" CASCADE');
  const a = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente A" });
  const b = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente B" });
  customerAId = a.id;
  customerBId = b.id;
  const va = await createVehicleService(actorUserId, { customerId: customerAId, plate: "AAA-1111" });
  const vb = await createVehicleService(actorUserId, { customerId: customerBId, plate: "BBB-2222" });
  vehicleAId = va.id;
  vehicleBId = vb.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: customerAId,
    vehicleId: vehicleAId,
    items: [
      { type: "SERVICO", category: "NECESSARIO", description: "Troca de óleo", quantity: 1, unitPriceReais: "80,00" },
      { type: "PECA", category: "NECESSARIO", description: "Filtro de óleo", quantity: 1, unitPriceReais: "35,50" },
    ],
    ...overrides,
  };
}

describe("createQuoteService", () => {
  it("cria orçamento com número, totais e status RASCUNHO", async () => {
    const result = await createQuoteService(actorUserId, baseInput());

    expect(result.quote.number).toMatch(/^ORC-\d{4}-\d{6}$/);
    expect(result.quote.status).toBe("RASCUNHO");
    expect(result.version.versionNumber).toBe(1);
    expect(result.version.subtotalServicesCents).toBe(8000);
    expect(result.version.subtotalPartsCents).toBe(3550);
    expect(result.version.totalCents).toBe(11550);
    expect(result.items).toHaveLength(2);
  });

  it("rejeita quando o veículo não pertence ao cliente informado", async () => {
    await expect(
      createQuoteService(actorUserId, baseInput({ customerId: customerAId, vehicleId: vehicleBId })),
    ).rejects.toThrow(VehicleNotOwnedByCustomerError);
  });

  it("rejeita orçamento sem nenhum item", async () => {
    await expect(createQuoteService(actorUserId, baseInput({ items: [] }))).rejects.toThrow();
  });

  it("aplica desconto e acréscimo corretamente nos totais", async () => {
    const result = await createQuoteService(
      actorUserId,
      baseInput({
        discount: { type: "PERCENTUAL", value: 10 },
        surcharge: { type: "FIXO", value: 5 },
      }),
    );
    // subtotal 11550 - 10% (1155) = 10395; + R$5,00 (500) = 10895
    expect(result.version.discountTotalCents).toBe(1155);
    expect(result.version.surchargeTotalCents).toBe(500);
    expect(result.version.totalCents).toBe(10895);
  });

  it("usa a validade padrão configurada quando não informada explicitamente", async () => {
    const before = Date.now();
    const result = await createQuoteService(actorUserId, baseInput());
    const diffDays = (new Date(result.version.validUntil).getTime() - before) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it("respeita validade customizada quando informada", async () => {
    const customDate = new Date();
    customDate.setDate(customDate.getDate() + 30);
    const result = await createQuoteService(
      actorUserId,
      baseInput({ validUntil: customDate.toISOString() }),
    );
    expect(new Date(result.version.validUntil).toDateString()).toBe(customDate.toDateString());
  });

  it("grava auditoria de criação do orçamento e da versão", async () => {
    const result = await createQuoteService(actorUserId, baseInput());
    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" IN ($1, $2) ORDER BY action`,
      [result.quote.id, result.version.id],
    );
    const actions = logs.rows.map((r) => r.action);
    expect(actions).toContain("QUOTE_CREATED");
    expect(actions).toContain("QUOTE_VERSION_CREATED");
  });
});

describe("updateQuoteVersionService — só edita em RASCUNHO", () => {
  it("edita itens e recalcula totais enquanto RASCUNHO", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    const updated = await updateQuoteVersionService(actorUserId, created.quote.id, {
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Alinhamento", quantity: 1, unitPriceReais: "120,00" }],
    });
    expect(updated.items).toHaveLength(1);
    expect(updated.version.totalCents).toBe(12000);
  });

  it("bloqueia edição depois que a versão foi enviada, mesmo chamando a Server Action diretamente", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);

    await expect(
      updateQuoteVersionService(actorUserId, created.quote.id, { items: baseInput().items }),
    ).rejects.toThrow(QuoteVersionNotEditableError);
  });
});

describe("sendQuoteVersionService", () => {
  it("transiciona RASCUNHO -> ENVIADO e grava sentAt", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    const sent = await sendQuoteVersionService(actorUserId, created.quote.id);
    expect(sent.status).toBe("ENVIADO");
    expect(sent.sentAt).not.toBeNull();
  });

  it("quotes.status reflete o status da versão vigente após enviar", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    const refreshed = await getQuoteService(created.quote.id);
    expect(refreshed?.quote.status).toBe("ENVIADO");
  });

  it("rejeita enviar um orçamento que já não está em RASCUNHO", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    await expect(sendQuoteVersionService(actorUserId, created.quote.id)).rejects.toThrow(
      InvalidQuoteTransitionError,
    );
  });
});

describe("createNewQuoteVersionService — versionamento", () => {
  it("só é permitido a partir de uma versão que não está em RASCUNHO", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await expect(createNewQuoteVersionService(actorUserId, created.quote.id)).rejects.toThrow(
      InvalidQuoteTransitionError,
    );
  });

  it("copia itens, ajustes e textos da versão anterior, reseta decisões e incrementa o número", async () => {
    const created = await createQuoteService(
      actorUserId,
      baseInput({
        internalNotes: "nota interna original",
        customerMessage: "mensagem original ao cliente",
        discount: { type: "PERCENTUAL", value: 5 },
      }),
    );
    await sendQuoteVersionService(actorUserId, created.quote.id);

    const newVersionResult = await createNewQuoteVersionService(actorUserId, created.quote.id);

    expect(newVersionResult.version.versionNumber).toBe(2);
    expect(newVersionResult.version.status).toBe("RASCUNHO");
    expect(newVersionResult.version.internalNotes).toBe("nota interna original");
    expect(newVersionResult.version.customerMessage).toBe("mensagem original ao cliente");
    expect(newVersionResult.version.discountType).toBe("PERCENTUAL");
    expect(newVersionResult.items).toHaveLength(2);
    expect(newVersionResult.items.every((i) => i.clientDecision === "PENDENTE")).toBe(true);
  });

  it("a versão anterior permanece TOTALMENTE imutável após a cópia (clarificação #3)", async () => {
    const created = await createQuoteService(
      actorUserId,
      baseInput({ internalNotes: "nota original", customerMessage: "mensagem original" }),
    );
    await sendQuoteVersionService(actorUserId, created.quote.id);
    await createNewQuoteVersionService(actorUserId, created.quote.id);

    // a versão 1 (agora "antiga") não deve ter sido alterada
    const allData = await getQuoteService(created.quote.id);
    const oldVersion = allData?.allVersions.find((v) => v.versionNumber === 1);
    expect(oldVersion?.status).toBe("ENVIADO");
    expect(oldVersion?.internalNotes).toBe("nota original");
    expect(oldVersion?.customerMessage).toBe("mensagem original");
  });

  it("quotes.currentVersionNumber e status avançam para a nova versão", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    await createNewQuoteVersionService(actorUserId, created.quote.id);

    const refreshed = await getQuoteService(created.quote.id);
    expect(refreshed?.quote.currentVersionNumber).toBe(2);
    expect(refreshed?.quote.status).toBe("RASCUNHO");
  });

  it("grava auditoria referenciando a versão anterior", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    const newVersionResult = await createNewQuoteVersionService(actorUserId, created.quote.id);

    const logs = await pool.query(
      `SELECT metadata FROM audit_logs WHERE "entityId" = $1 AND action = 'QUOTE_VERSION_CREATED' ORDER BY "createdAt" DESC LIMIT 1`,
      [newVersionResult.version.id],
    );
    expect(logs.rows[0].metadata.previousVersionNumber).toBe(1);
  });
});

describe("cancelQuoteVersionService", () => {
  it("cancela a partir de RASCUNHO", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    const cancelled = await cancelQuoteVersionService(actorUserId, created.quote.id);
    expect(cancelled.status).toBe("CANCELADO");
  });

  it("cancela a partir de ENVIADO (antes de decisão do cliente)", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    const cancelled = await cancelQuoteVersionService(actorUserId, created.quote.id);
    expect(cancelled.status).toBe("CANCELADO");
  });

  it("não permite cancelar duas vezes", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await cancelQuoteVersionService(actorUserId, created.quote.id);
    await expect(cancelQuoteVersionService(actorUserId, created.quote.id)).rejects.toThrow(
      InvalidQuoteTransitionError,
    );
  });
});

describe("expiração sob demanda (K5)", () => {
  it("reconhece uma versão ENVIADO com validade vencida como EXPIRADO ao consultar", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const created = await createQuoteService(
      actorUserId,
      baseInput({ validUntil: pastDate.toISOString() }),
    );
    await sendQuoteVersionService(actorUserId, created.quote.id);

    const fetched = await getQuoteService(created.quote.id);
    expect(fetched?.version.status).toBe("EXPIRADO");
    expect(fetched?.quote.status).toBe("EXPIRADO");
  });

  it("nunca apaga o orçamento, a versão ou os itens ao expirar", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const created = await createQuoteService(
      actorUserId,
      baseInput({ validUntil: pastDate.toISOString() }),
    );
    await sendQuoteVersionService(actorUserId, created.quote.id);

    const fetched = await getQuoteService(created.quote.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.items).toHaveLength(2);
  });

  it("versão ainda dentro da validade não é marcada como expirada", async () => {
    const created = await createQuoteService(actorUserId, baseInput());
    await sendQuoteVersionService(actorUserId, created.quote.id);
    const fetched = await getQuoteService(created.quote.id);
    expect(fetched?.version.status).toBe("ENVIADO");
  });
});
