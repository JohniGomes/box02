import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { generateQuoteNumber } from "../numbering";

async function cleanCounters() {
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%'`);
}

beforeEach(async () => {
  await cleanCounters();
});

afterAll(async () => {
  await cleanCounters();
  await pool.end();
});

describe("generateQuoteNumber (implementação provisória — pendente D3)", () => {
  it("gera número no formato ORC-{ano}-{6 dígitos}", async () => {
    const number = await generateQuoteNumber(new Date(2026, 2, 15));
    expect(number).toBe("ORC-2026-000001");
  });

  it("incrementa sequencialmente dentro do mesmo ano", async () => {
    const referenceDate = new Date(2026, 2, 15);
    const first = await generateQuoteNumber(referenceDate);
    const second = await generateQuoteNumber(referenceDate);
    const third = await generateQuoteNumber(referenceDate);
    expect(first).toBe("ORC-2026-000001");
    expect(second).toBe("ORC-2026-000002");
    expect(third).toBe("ORC-2026-000003");
  });

  it("usa contadores independentes para anos diferentes", async () => {
    // Construção explícita em componentes locais (ano, mês, dia) — nunca
    // via string ISO "AAAA-MM-DD" (vira UTC e pode cair no ano/dia errado
    // dependendo do fuso do processo, o mesmo bug corrigido em dateOnly.ts).
    const n2026 = await generateQuoteNumber(new Date(2026, 11, 31));
    const n2027 = await generateQuoteNumber(new Date(2027, 0, 1));
    expect(n2026).toBe("ORC-2026-000001");
    expect(n2027).toBe("ORC-2027-000001");
  });

  it("nunca gera dois números iguais em chamadas concorrentes (mesmo ano)", async () => {
    const referenceDate = new Date(2026, 5, 1);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => generateQuoteNumber(referenceDate)),
    );
    const uniqueNumbers = new Set(results);
    expect(uniqueNumbers.size).toBe(10);
  });
});
