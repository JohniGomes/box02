import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import {
  PRICING_DEFAULT_MARKUP_PERCENT_KEY,
  QUOTE_DEFAULT_VALIDITY_DAYS_KEY,
  getDefaultMarkupPercent,
  getQuoteDefaultValidityDays,
  setDefaultMarkupPercent,
  setQuoteDefaultValidityDays,
} from "../service";

async function resetToSeedDefault() {
  await pool.query(
    `INSERT INTO app_settings (key, value, "updatedAt") VALUES ($1, '7', NOW())
     ON CONFLICT (key) DO UPDATE SET value = '7', "updatedAt" = NOW()`,
    [QUOTE_DEFAULT_VALIDITY_DAYS_KEY],
  );
}

beforeEach(async () => {
  await resetToSeedDefault();
});

afterAll(async () => {
  await resetToSeedDefault();
  await pool.end();
});

describe("validade padrão do orçamento (K4 — configurável, não hardcoded)", () => {
  it("lê o valor seedado (7 dias)", async () => {
    const days = await getQuoteDefaultValidityDays();
    expect(days).toBe(7);
  });

  it("permite alterar o valor sem tocar em código", async () => {
    await setQuoteDefaultValidityDays(14);
    const days = await getQuoteDefaultValidityDays();
    expect(days).toBe(14);
  });

  it("rejeita valor inválido (zero ou negativo)", async () => {
    await expect(setQuoteDefaultValidityDays(0)).rejects.toThrow();
    await expect(setQuoteDefaultValidityDays(-5)).rejects.toThrow();
  });

  it("usa o fallback se a linha não existir no banco (degrada, não quebra)", async () => {
    await pool.query(`DELETE FROM app_settings WHERE key = $1`, [QUOTE_DEFAULT_VALIDITY_DAYS_KEY]);
    const days = await getQuoteDefaultValidityDays();
    expect(days).toBe(7); // fallback embutido no código
  });
});

describe("markup padrão de precificação (Ciclo H — H4-D4, SEM fallback numérico)", () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM app_settings WHERE key = $1`, [PRICING_DEFAULT_MARKUP_PERCENT_KEY]);
  });

  it("retorna null quando nunca foi configurado — nunca inventa um número", async () => {
    const percent = await getDefaultMarkupPercent();
    expect(percent).toBeNull();
  });

  it("permite configurar e depois ler o valor exato", async () => {
    await setDefaultMarkupPercent(40);
    const percent = await getDefaultMarkupPercent();
    expect(percent).toBe(40);
  });

  it("rejeita valor negativo", async () => {
    await expect(setDefaultMarkupPercent(-10)).rejects.toThrow();
  });

  it("aceita zero (markup zero é um valor válido, diferente de 'não configurado')", async () => {
    await setDefaultMarkupPercent(0);
    const percent = await getDefaultMarkupPercent();
    expect(percent).toBe(0);
  });

  it("valor inválido gravado diretamente no banco (corrupção externa) retorna null, nunca NaN", async () => {
    await pool.query(
      `INSERT INTO app_settings (key, value, "updatedAt") VALUES ($1, 'não-é-número', NOW())`,
      [PRICING_DEFAULT_MARKUP_PERCENT_KEY],
    );
    const percent = await getDefaultMarkupPercent();
    expect(percent).toBeNull();
  });
});
