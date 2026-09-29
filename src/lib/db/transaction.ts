import type { PoolClient } from "pg";
import { pool } from "./pool";

/**
 * Executa `fn` dentro de uma transação (BEGIN/COMMIT/ROLLBACK). Necessário
 * sempre que uma operação de negócio grava em mais de uma tabela e precisa
 * ser tudo-ou-nada (ex.: criar orçamento + versão + itens de uma vez).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
