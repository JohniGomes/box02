import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  cancelQuoteVersionService,
  createQuoteService,
  getActiveQuoteLinkService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
} from "../service";
import { getQuoteIndicatorsService, type QuoteIndicators } from "../indicators";

async function cleanAll() {
  await pool.query(
    'TRUNCATE "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%'`);
}

let actorUserId: string;
let customerId: string;
let vehicleId: string;

/** Client dedicado + transação SERIALIZABLE (correção da DT3 — ver
 * TECH_DEBT.md). Aberta logo após o cenário de 8 orçamentos terminar de
 * ser montado, mantida aberta até o fim do describe, com ROLLBACK no
 * afterAll. Isso dá a todas as asserções abaixo um snapshot único e
 * estável, imune a qualquer commit de outro arquivo de teste que rode em
 * paralelo (mesmo banco de teste físico compartilhado) — a causa raiz da
 * instabilidade já documentada. Nenhuma fórmula do indicador muda: é o
 * mesmo `getQuoteIndicatorsService`, só chamado com um client isolado. */
let indicatorsClient: PoolClient;
let capturedIndicators: QuoteIndicators;

/**
 * CENÁRIO CONTROLADO — 8 orçamentos, um para cada situação relevante
 * pedida na validação (aprovado total, parcial, recusado, expirado,
 * cancelado — enviado e não enviado —, ainda enviado, rascunho).
 * Todos os valores em reais redondos para permitir conferência manual
 * exata, sem desconto/acréscimo (mantém totalCents == soma dos itens).
 *
 *  Q1 RASCUNHO             — nunca enviado.                 R$700  (não conta em nenhum indicador de valor)
 *  Q2 ENVIADO (pendente)   — enviado, sem decisão ainda.     R$200
 *  Q3 APROVADO (total)     — enviado, aprovado por inteiro.  R$300
 *  Q4 APROVADO_PARCIAL     — enviado, 1 item aprovado (R$100) + 1 recusado (R$150). R$250
 *  Q5 RECUSADO (total)     — enviado, recusado por inteiro.  R$400
 *  Q6 EXPIRADO             — enviado, validade no passado, nunca decidido. R$500
 *  Q7 CANCELADO (enviado)  — enviado e depois cancelado.     R$600
 *  Q8 CANCELADO (rascunho) — cancelado sem nunca ter sido enviado. R$700 (não conta em valor/conversão)
 *
 * Cálculo esperado:
 *  totalQuotes            = 8
 *  sentCount (denominador)= 6  (Q2,Q3,Q4,Q5,Q6,Q7 — Q1 e Q8 nunca enviados)
 *  totalQuotedValueCents  = 20000+30000+25000+40000+50000+60000 = 225000 (R$2.250,00)
 *  approvedValueCents     = 30000 (Q3 inteiro) + 10000 (item aprovado de Q4) = 40000 (R$400,00)
 *  rejectedValueCents     = 15000 (item recusado de Q4) + 40000 (Q5 inteiro) = 55000 (R$550,00)
 *  approvedCount (numerador conversão) = 2 (Q3 e Q4 — parcial conta como conversão)
 *  conversionRate          = 2/6 = 0,3333...
 *  decidedCount            = 3 (Q3, Q4, Q5 — únicos com decidedAt)
 *  tempos até decisão fixados manualmente: Q3=2h, Q4=4h, Q5=6h -> média = 4h exatas
 *  avgQuoteValueCents      = 225000/6 = 37500 (R$375,00)
 */
beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;

  const customer = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Indicadores" });
  const vehicle = await createVehicleService(actorUserId, { customerId: customer.id, plate: "IND-0001" });
  customerId = customer.id;
  vehicleId = vehicle.id;

  async function tokenFor(quoteId: string): Promise<string> {
    const { rows } = await pool.query(
      `SELECT qv.id FROM quote_versions qv WHERE qv."quoteId" = $1 ORDER BY qv."versionNumber" DESC LIMIT 1`,
      [quoteId],
    );
    const link = await getActiveQuoteLinkService(rows[0].id);
    return link!.token;
  }

  async function itemsOf(quoteId: string) {
    const { rows } = await pool.query(
      `SELECT id, description FROM quote_items WHERE "quoteVersionId" = (SELECT id FROM quote_versions WHERE "quoteId" = $1)`,
      [quoteId],
    );
    return rows as { id: string; description: string }[];
  }

  /** Busca o item pelo texto da descrição — nunca por posição no array.
   * `ORDER BY id`/ordem de retorno do SELECT não é garantia de ordem de
   * inserção (CUID2 mistura aleatoriedade, não é estritamente monotônico
   * em sucessão rápida) — essa foi a causa raiz real da instabilidade já
   * registrada como DT3: o teste antigo pegava `items[0]`/`items[1]` por
   * posição, e ocasionalmente a ordem vinha trocada, invertendo qual
   * item era aprovado e qual era recusado. Buscar por descrição elimina
   * a suposição de ordem por completo. */
  function findByDescription(items: { id: string; description: string }[], description: string): string {
    const found = items.find((i) => i.description === description);
    if (!found) throw new Error(`Item com descrição "${description}" não encontrado no fixture do teste.`);
    return found.id;
  }

  // Q1 — RASCUNHO, nunca enviado
  await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q1 rascunho", quantity: 1, unitPriceReais: "700,00" }],
  });

  // Q2 — ENVIADO, ainda pendente
  const q2 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q2 pendente", quantity: 1, unitPriceReais: "200,00" }],
  });
  await sendQuoteVersionService(actorUserId, q2.quote.id);

  // Q3 — APROVADO total
  const q3 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q3 aprovado total", quantity: 1, unitPriceReais: "300,00" }],
  });
  await sendQuoteVersionService(actorUserId, q3.quote.id);
  const q3Token = await tokenFor(q3.quote.id);
  const q3Items = await itemsOf(q3.quote.id);
  await submitPublicQuoteDecisionService(q3Token, {
    itemDecisions: [{ itemId: findByDescription(q3Items, "Q3 aprovado total"), decision: "APROVADO" }],
    approverName: "Aprovador Q3",
  });

  // Q4 — APROVADO_PARCIAL
  const q4 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [
      { type: "SERVICO", category: "NECESSARIO", description: "Q4 item aprovado", quantity: 1, unitPriceReais: "100,00" },
      { type: "PECA", category: "NECESSARIO", description: "Q4 item recusado", quantity: 1, unitPriceReais: "150,00" },
    ],
  });
  await sendQuoteVersionService(actorUserId, q4.quote.id);
  const q4Token = await tokenFor(q4.quote.id);
  const q4Items = await itemsOf(q4.quote.id);
  await submitPublicQuoteDecisionService(q4Token, {
    itemDecisions: [
      { itemId: findByDescription(q4Items, "Q4 item aprovado"), decision: "APROVADO" },
      { itemId: findByDescription(q4Items, "Q4 item recusado"), decision: "RECUSADO" },
    ],
    approverName: "Aprovador Q4",
  });

  // Q5 — RECUSADO total
  const q5 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q5 recusado", quantity: 1, unitPriceReais: "400,00" }],
  });
  await sendQuoteVersionService(actorUserId, q5.quote.id);
  const q5Token = await tokenFor(q5.quote.id);
  const q5Items = await itemsOf(q5.quote.id);
  await submitPublicQuoteDecisionService(q5Token, {
    itemDecisions: [{ itemId: findByDescription(q5Items, "Q5 recusado"), decision: "RECUSADO" }],
    approverName: "Aprovador Q5",
  });

  // Fixa os tempos de decisão de Q3/Q4/Q5 manualmente para média exata de 4h
  async function fixTiming(quoteId: string, hoursToDecide: number) {
    const sentAt = new Date("2026-01-01T00:00:00Z");
    const decidedAt = new Date(sentAt.getTime() + hoursToDecide * 60 * 60 * 1000);
    await pool.query(
      `UPDATE quote_versions SET "sentAt" = $2, "decidedAt" = $3 WHERE "quoteId" = $1`,
      [quoteId, sentAt, decidedAt],
    );
  }
  await fixTiming(q3.quote.id, 2);
  await fixTiming(q4.quote.id, 4);
  await fixTiming(q5.quote.id, 6);

  // Q6 — EXPIRADO (enviado, validade no passado, nunca decidido)
  const q6 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q6 expirado", quantity: 1, unitPriceReais: "500,00" }],
  });
  await sendQuoteVersionService(actorUserId, q6.quote.id);
  await pool.query(`UPDATE quote_versions SET "validUntil" = $2 WHERE "quoteId" = $1`, [
    q6.quote.id,
    new Date("2020-01-01"),
  ]);
  // Note: não chamamos nenhuma função de reconciliação aqui de propósito —
  // o indicador precisa reconhecer isso SOZINHO (expiração sob demanda,
  // sem job), exatamente o comportamento que o teste abaixo verifica.

  // Q7 — CANCELADO depois de enviado
  const q7 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q7 cancelado após envio", quantity: 1, unitPriceReais: "600,00" }],
  });
  await sendQuoteVersionService(actorUserId, q7.quote.id);
  await cancelQuoteVersionService(actorUserId, q7.quote.id);

  // Q8 — CANCELADO ainda em rascunho (nunca enviado)
  const q8 = await createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: "Q8 cancelado sem envio", quantity: 1, unitPriceReais: "700,00" }],
  });
  await cancelQuoteVersionService(actorUserId, q8.quote.id);

  // Cenário completo e comitado — a partir daqui, abrimos a transação
  // SERIALIZABLE dedicada e tiramos o snapshot que todas as asserções vão
  // usar. A primeira query dentro da transação é o que fixa o snapshot
  // (semântica do Postgres para SERIALIZABLE), então isso acontece o mais
  // cedo possível depois do último COMMIT do cenário, minimizando a janela
  // de exposição a escrita concorrente de outro arquivo a praticamente zero.
  indicatorsClient = await pool.connect();
  await indicatorsClient.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  capturedIndicators = await getQuoteIndicatorsService(indicatorsClient);
});

afterAll(async () => {
  await indicatorsClient.query("ROLLBACK");
  indicatorsClient.release();
  await cleanAll();
  await pool.end();
});

describe("getQuoteIndicatorsService — cenário controlado (8 orçamentos)", () => {
  it("indicador 1 — quantidade total de orçamentos conta TODOS, inclusive rascunho e cancelado", () => {
    expect(capturedIndicators.totalQuotes).toBe(8);
  });

  it("indicador 2 — valor total orçado soma só quem foi enviado (exclui rascunho e cancelado-sem-envio)", () => {
    expect(capturedIndicators.totalQuotedValueCents).toBe(225000);
  });

  it("indicador 3 — valor aprovado soma por item, incluindo a fatia aprovada da aprovação parcial", () => {
    expect(capturedIndicators.approvedValueCents).toBe(40000);
  });

  it("indicador 4 — valor recusado soma por item, incluindo a fatia recusada da aprovação parcial", () => {
    expect(capturedIndicators.rejectedValueCents).toBe(55000);
  });

  it("indicador 5 — taxa de conversão conta aprovação total E parcial no numerador", () => {
    expect(capturedIndicators.conversionRate).toBeCloseTo(2 / 6, 10);
  });

  it("indicador 6 — tempo médio até decisão é a média exata dos 3 orçamentos decididos (2h, 4h, 6h)", () => {
    expect(capturedIndicators.avgTimeToDecisionHours).toBeCloseTo(4, 6);
  });

  it("indicador 7 — valor médio por orçamento usa a mesma população do indicador 2 (só enviados)", () => {
    expect(capturedIndicators.avgQuoteValueCents).toBe(37500);
  });

  it("orçamento EXPIRADO é reconhecido sob demanda no cálculo, mesmo sem job e sem ninguém ter acessado essa versão ainda", async () => {
    // Confirma que o status BRUTO no banco continua "ENVIADO" (nenhuma
    // escrita/job rodou sobre essa linha) — e mesmo assim o indicador já
    // trata esse orçamento como expirado no cálculo (sob demanda, na
    // própria leitura), sem incluir seus itens em aprovado/recusado e
    // sem contá-lo como conversão, mas incluindo seu valor no total
    // orçado (foi enviado de verdade). Consulta fora da transação
    // dedicada (pool comum) — só lê o dado físico, não precisa do
    // isolamento especial.
    const rawStatus = await pool.query(
      `SELECT qv.status FROM quote_versions qv
       INNER JOIN quote_items qi ON qi."quoteVersionId" = qv.id
       WHERE qi.description = 'Q6 expirado'`,
    );
    expect(rawStatus.rows[0].status).toBe("ENVIADO"); // nunca reescrito fisicamente

    expect(capturedIndicators.totalQuotedValueCents).toBe(225000); // Q6 (50000) está incluso
    expect(capturedIndicators.approvedValueCents).toBe(40000); // Q6 não contribui (nunca decidido)
  });

  it("orçamento CANCELADO após envio conta no valor total orçado e no denominador, nunca no aprovado", () => {
    // Q7 (60000) está dentro dos 225000 do indicador 2, mas não contribui
    // para approvedValueCents (40000) nem para o numerador da conversão —
    // ambos já conferidos exatamente nos testes acima.
    expect(capturedIndicators.totalQuotedValueCents).toBeGreaterThanOrEqual(60000);
  });

  it("não escreve nada no banco ao calcular (função de leitura pura) — chamar duas vezes dá o mesmo resultado", async () => {
    // Segunda chamada usando o MESMO client/transação — mesmo snapshot,
    // prova que a leitura é determinística e sem efeito colateral.
    const second = await getQuoteIndicatorsService(indicatorsClient);
    expect(second).toEqual(capturedIndicators);
  });
});
