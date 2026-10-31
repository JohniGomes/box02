import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { normalizeWorkOrderNumber, resolveMonth, responderPergunta } from "../answers";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payment_refunds", "work_order_payments", "work_order_discounts", "work_order_closures", "work_order_items", "work_orders", "expenses", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
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
