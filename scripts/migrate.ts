/**
 * Mecanismo de migração — tabela de controle `_migrations`.
 *
 * Aplica as migrações de prisma/migrations/ em ordem alfabética (que
 * bate com a ordem numérica, dado o padding de 4 dígitos em todas as
 * pastas — confirmado no diagnóstico). Cada migração roda dentro da
 * sua própria transação; o INSERT em `_migrations` acontece na MESMA
 * transação da aplicação do SQL, então é atomicamente impossível
 * "aplicar mas não registrar" ou vice-versa. Falha para o processo
 * inteiro, nunca continua silenciosamente para a próxima.
 *
 * Uso:
 *   npx tsx scripts/migrate.ts            -> aplica as pendentes
 *   npx tsx scripts/migrate.ts --status    -> só lista, não aplica nada
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

async function ensureControlTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_migrations" (
      "name"      TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function listMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function getAppliedNames(client: Client): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(`SELECT "name" FROM "_migrations"`);
  return new Set(result.rows.map((r) => r.name));
}

async function runStatus(client: Client): Promise<void> {
  const all = listMigrationNames();
  const applied = await getAppliedNames(client);
  console.log("Estado das migrações:\n");
  for (const name of all) {
    console.log(`  [${applied.has(name) ? "x" : " "}] ${name}`);
  }
  const pendingCount = all.filter((n) => !applied.has(n)).length;
  console.log(`\n${applied.size} aplicada(s), ${pendingCount} pendente(s).`);
}

async function runMigrations(client: Client): Promise<void> {
  const all = listMigrationNames();
  const applied = await getAppliedNames(client);
  const pending = all.filter((n) => !applied.has(n));

  if (pending.length === 0) {
    console.log("Nenhuma migração pendente.");
    return;
  }

  for (const name of pending) {
    const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
    const sql = readFileSync(sqlPath, "utf-8");

    console.log(`Aplicando ${name}...`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(`INSERT INTO "_migrations" ("name") VALUES ($1)`, [name]);
      await client.query("COMMIT");
      console.log(`  OK`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`\nFALHA em ${name}:`);
      console.error(err instanceof Error ? err.message : err);
      console.error("\nProcesso interrompido. Nenhuma migração seguinte foi tentada.");
      process.exitCode = 1;
      return;
    }
  }

  console.log(`\n${pending.length} migração(ões) aplicada(s) com sucesso.`);
}

async function main() {
  const statusOnly = process.argv.includes("--status");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await ensureControlTable(client);
    if (statusOnly) {
      await runStatus(client);
    } else {
      await runMigrations(client);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
