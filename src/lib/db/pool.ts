/**
 * Conexão com o PostgreSQL.
 *
 * NOTA DE ARQUITETURA — LER ANTES DE ALTERAR:
 * O plano de stack (DEV_PLAN.md) define Prisma como ORM. Este projeto foi
 * construído dentro de um ambiente de sandbox cuja rede bloqueia o download
 * dos binários do Prisma Engine (binaries.prisma.sh). Por isso, o Ciclo 1
 * usa `pg` diretamente como camada de acesso a dados, mantendo
 * `prisma/schema.prisma` como fonte de verdade do modelo de dados.
 *
 * Em uma máquina de desenvolvimento normal (sem esse bloqueio de rede),
 * rodar `npx prisma generate` e substituir os repositórios em
 * `src/lib/db/repositories/*` por chamadas ao Prisma Client é o próximo
 * passo natural — a migração SQL em `prisma/migrations/` já está em
 * paridade com o schema. Ver README.md, seção "Nota sobre o Prisma".
 */
import { Pool } from "pg";

const globalForPg = globalThis as unknown as { pgPool?: Pool };

/**
 * Sob Vitest, NUNCA reaproveita o pool em cache: cada arquivo de teste
 * (`*.integration.test.ts`) chama `pool.end()` no seu próprio `afterAll`,
 * e o cache em `globalThis` fazia arquivos diferentes compartilharem o
 * MESMO objeto `Pool` — um arquivo fechando o pool no meio da suíte
 * corrompia a visibilidade de dados para os arquivos seguintes (causa raiz
 * de uma instabilidade intermitente encontrada na Sub-etapa 2 da OS,
 * envolvendo `getQuoteIndicatorsService`). Fora de testes (dev/produção do
 * Next.js), o cache continua exatamente como antes — é o padrão correto
 * para evitar recriar o pool a cada hot-reload.
 */
const isTestEnv = process.env.VITEST === "true";

export const pool = isTestEnv
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 })
  : (globalForPg.pgPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    }));

if (!isTestEnv && process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pool;
}
