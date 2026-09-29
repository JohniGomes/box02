/**
 * Bootstrap único da tabela de controle "_migrations", para ambientes
 * que já têm as estruturas das 17 migrações aplicadas manualmente,
 * antes do mecanismo novo (scripts/migrate.ts) existir.
 *
 * NUNCA executa o conteúdo de nenhum migration.sql — só lê os NOMES
 * das pastas (readdirSync) e registra em "_migrations". Idempotente
 * por construção: usa ON CONFLICT DO NOTHING, então rodar duas vezes
 * nunca duplica nem falha.
 *
 * Não faz parte do mecanismo aprovado em scripts/migrate.ts — é uma
 * ferramenta separada, de uso único por ambiente, para ambientes que
 * já tinham as estruturas antes da tabela de controle existir.
 *
 * Uso:
 *   npx tsx scripts/bootstrap-migrations.ts
 */
import "dotenv/config";
import { readdirSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(__dirname, "..", "prisma", "migrations");

function listMigrationNames(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_migrations" (
        "name"      TEXT PRIMARY KEY,
        "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const names = listMigrationNames();
    let inserted = 0;
    let alreadyPresent = 0;

    for (const name of names) {
      const result = await client.query(
        `INSERT INTO "_migrations" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING`,
        [name],
      );
      if (result.rowCount && result.rowCount > 0) inserted++;
      else alreadyPresent++;
    }

    console.log(`Bootstrap concluído.`);
    console.log(`  ${names.length} migração(ões) no total.`);
    console.log(`  ${inserted} registrada(s) agora.`);
    console.log(`  ${alreadyPresent} já estava(m) registrada(s) (nenhuma duplicidade).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
