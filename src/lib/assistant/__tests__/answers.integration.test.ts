import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createAppointmentService } from "@/lib/appointments/service";
import { normalizeWorkOrderNumber, resolveMonth, responderPergunta } from "../answers";
import { resolveDay } from "../answersDayToDay";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "message_log", "appointments", "stock_movements", "purchases", "suppliers", "parts", "work_order_payment_refunds", "work_order_payments", "work_order_discounts", "work_order_closures", "work_order_items", "work_orders", "expenses", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

beforeAll(cleanAll);
afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("normalização das perguntas", () => {
  const now = new Date("2026-10-30T15:00:00.000Z");

  it("resolve o mês: atual, anterior, mês citado e valor estranho", () => {
    expect(resolveMonth(undefined, now)).toBe("2026-10");
    expect(resolveMonth("ATUAL", now)).toBe("2026-10");
    expect(resolveMonth("anterior", now)).toBe("2026-09");
    expect(resolveMonth("2026-03", now)).toBe("2026-03");
    expect(resolveMonth("março", now)).toBe("2026-10");
    expect(resolveMonth("ANTERIOR", new Date("2026-01-10T12:00:00.000Z"))).toBe("2025-12");
  });

  it("entende o número da OS do jeito que a pessoa fala", () => {
    expect(normalizeWorkOrderNumber("OS-20")).toBe("OS-000020");
    expect(normalizeWorkOrderNumber("os 20")).toBe("OS-000020");
    expect(normalizeWorkOrderNumber("OS-000020")).toBe("OS-000020");
    expect(normalizeWorkOrderNumber(undefined)).toBeNull();
    expect(normalizeWorkOrderNumber("sem número")).toBeNull();
  });
});

describe("dia a dia (etapa 2)", () => {
  let actorUserId: string;
  let customerId: string;

  beforeAll(async () => {
    actorUserId = (await createUser({ name: "Testador", email: "rb@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
    customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Maria Pereira", phone: "62999998888", whatsapp: "62999998888" })).id;
  });

  it("resolve o dia: hoje, amanhã, ontem, data e valor estranho", () => {
    const now = new Date("2026-10-30T15:00:00.000Z");
    expect(resolveDay(undefined, now)).toBe("2026-10-30");
    expect(resolveDay("HOJE", now)).toBe("2026-10-30");
    expect(resolveDay("amanhã", now)).toBe("2026-10-31");
    expect(resolveDay("AMANHA", now)).toBe("2026-10-31");
    expect(resolveDay("ONTEM", now)).toBe("2026-10-29");
    expect(resolveDay("2026-11-05", now)).toBe("2026-11-05");
    expect(resolveDay("semana que vem", now)).toBeNull();
    expect(resolveDay("2026-13-45", now)).toBeNull();
  });

  it("vazio: nada na oficina, nada acabando, agenda vazia, mensagens zeradas", async () => {
    expect((await responderPergunta({ consulta: "OS_ABERTAS" })).aviso).toMatch(/Nenhuma OS/);
    expect((await responderPergunta({ consulta: "PECAS_ACABANDO" })).aviso).toMatch(/Nenhuma peça/);
    expect((await responderPergunta({ consulta: "AGENDA", dia: "HOJE" })).aviso).toMatch(/Nenhum agendamento/);
    expect((await responderPergunta({ consulta: "AGENDA", dia: "talvez" })).aviso).toMatch(/Não entendi o dia/);
    expect((await responderPergunta({ consulta: "MENSAGENS" })).linhas).toHaveLength(6);
  });

  it("peça: saldo, custo e último fornecedor; acabando; nome inexistente ou curto", async () => {
    await pool.query(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Autopeças Central')`);
    await pool.query(
      `INSERT INTO purchases (id, "supplierId", "purchaseDate", "itemsTotalCents", "totalCents", "createdByUserId") VALUES ('pur1', 'sup1', '2026-10-20', 9000, 9000, $1)`,
      [actorUserId],
    );
    await pool.query(
      `INSERT INTO parts (id, name, unit, "costCents", "minStock", status, "isConsumable", "updatedAt") VALUES ('pt1', 'Filtro de óleo Fox', 'un', 3000, 5, 'ATIVO', false, NOW())`,
    );
    await pool.query(
      `INSERT INTO stock_movements (id, "partId", type, quantity, "createdByUserId", "purchaseId") VALUES ('mv1', 'pt1', 'ENTRADA', 3, $1, 'pur1')`,
      [actorUserId],
    );

    const r = await responderPergunta({ consulta: "PECA_ESTOQUE", peca: "filtro de óleo" });
    expect(r.linhas[0].rotulo).toContain("Filtro de óleo Fox");
    expect(r.linhas[0].valor).toContain("3 un");
    expect(r.linhas[0].valor).toContain("30,00");
    expect(r.linhas[1].rotulo).toContain("Autopeças Central");

    const low = await responderPergunta({ consulta: "PECAS_ACABANDO" });
    expect(low.linhas[0].rotulo).toContain("Filtro de óleo Fox (mínimo 5)");

    expect((await responderPergunta({ consulta: "PECA_ESTOQUE", peca: "pastilha" })).aviso).toMatch(/Não achei/);
    expect((await responderPergunta({ consulta: "PECA_ESTOQUE", peca: "a" })).aviso).toMatch(/Qual peça/);
  });

  it("cliente: histórico de um, aviso se não achar; agenda do dia", async () => {
    const h = await responderPergunta({ consulta: "HISTORICO_CLIENTE", cliente: "Maria" });
    expect(h.titulo).toBe("Histórico de Maria Pereira");
    expect(h.linhas.find((l) => l.rotulo === "OS no total")?.valor).toBe("0");
    expect((await responderPergunta({ consulta: "HISTORICO_CLIENTE", cliente: "Zé Ninguém" })).aviso).toMatch(/Não achei/);

    const todayBr = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    await createAppointmentService(actorUserId, { customerId, scheduledAt: `${todayBr}T15:00`, description: "Freios" });
    const a = await responderPergunta({ consulta: "AGENDA", dia: "HOJE" });
    // A hora exibida segue o relógio gravado (o servidor roda em UTC); aqui só confere o formato e o cliente.
    expect(a.linhas[0].rotulo).toMatch(/^\d{2}:\d{2} · Maria Pereira$/);
    expect(a.linhas[0].valor).toBe("Freios");
  });
});

describe("responderPergunta (só leitura)", () => {
  it("resumo do mês sem movimento mostra zeros e o link do Financeiro", async () => {
    const r = await responderPergunta({ consulta: "RESUMO_MES", mes: "2026-10" });
    expect(r.titulo).toBe("Financeiro de outubro de 2026");
    expect(r.linhas.find((l) => l.rotulo === "Entrou")?.valor).toContain("0,00");
    expect(r.links[0].href).toBe("/dashboard/financeiro?mes=2026-10");
  });

  it("a receber vazio avisa que não há saldo em aberto", async () => {
    const r = await responderPergunta({ consulta: "A_RECEBER" });
    expect(r.aviso).toMatch(/Nenhuma OS/);
  });

  it("lucro de OS: pede o número, avisa quando não acha", async () => {
    expect((await responderPergunta({ consulta: "LUCRO_OS" })).aviso).toMatch(/Qual OS/);
    expect((await responderPergunta({ consulta: "LUCRO_OS", os: "OS-999" })).aviso).toMatch(/Não achei a OS-000999/);
  });

  it("taxa de cartão usa a porcentagem das Regras e avisa que é estimativa", async () => {
    const r = await responderPergunta({ consulta: "TAXA_CARTAO", mes: "ATUAL" });
    expect(r.linhas[1].rotulo).toContain("Taxa estimada");
    expect(r.aviso).toMatch(/estimativa/);
  });

  it("pergunta fora do que sei vira 'ainda não sei', sem inventar", async () => {
    const r = await responderPergunta({ consulta: "DESCONHECIDA" });
    expect(r.titulo).toMatch(/Ainda não sei/);
    expect(r.linhas).toHaveLength(0);
    expect((await responderPergunta({ consulta: "QUALQUER_COISA" })).titulo).toMatch(/Ainda não sei/);
  });
});
