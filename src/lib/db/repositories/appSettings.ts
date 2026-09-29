import { pool } from "../pool";

export async function getSetting(key: string): Promise<string | null> {
  const result = await pool.query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [key],
  );
  return result.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, "updatedAt") VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = NOW()`,
    [key, value],
  );
}

/**
 * Incrementa atomicamente um contador guardado em app_settings e retorna o
 * novo valor. Uma única instrução SQL (INSERT ... ON CONFLICT DO UPDATE)
 * garante que duas requisições concorrentes nunca leiam o mesmo número —
 * o Postgres serializa via lock de linha, sem precisar de lógica extra no
 * lado da aplicação.
 */
export async function incrementCounter(key: string): Promise<number> {
  const result = await pool.query<{ value: string }>(
    `INSERT INTO app_settings (key, value, "updatedAt") VALUES ($1, '1', NOW())
     ON CONFLICT (key) DO UPDATE SET value = (app_settings.value::int + 1)::text, "updatedAt" = NOW()
     RETURNING value`,
    [key],
  );
  return Number(result.rows[0].value);
}
