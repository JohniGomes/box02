import type { Pool, PoolClient } from "pg";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export interface QuoteIndicatorsRawRow1 {
  total_quotes: string;
  sent_count: string;
  total_quoted_cents: string;
  approved_count: string;
  decided_count: string;
  decision_seconds_sum: string;
}

export interface QuoteIndicatorsRawRow2 {
  approved_value_cents: string;
  rejected_value_cents: string;
}

/**
 * Consulta agregada principal: quantidade, valor total orçado, taxa de
 * conversão e tempo até decisão — tudo a partir da VERSÃO VIGENTE de cada
 * orçamento (join por `quotes."currentVersionNumber"`), nunca somando
 * versões antigas já substituídas (evitaria contar o mesmo orçamento mais
 * de uma vez).
 *
 * `effective_status`: uma versão ENVIADO cujo prazo já passou é tratada
 * como EXPIRADO no cálculo mesmo que ninguém tenha "acessado" essa versão
 * ainda para gravar isso no banco (K5 é sob demanda, sem job — mas os
 * indicadores não podem ficar errados só porque ninguém abriu aquele
 * orçamento específico). Isto é só para fins de leitura/relatório: não
 * escreve nada no banco.
 *
 * `db` (opcional, padrão o pool compartilhado): mesmo padrão já usado em
 * todo o resto da camada de repositório — permite passar um `PoolClient`
 * dedicado (ex.: dentro de uma transação `SERIALIZABLE`) sem mudar em
 * nada o comportamento de quem não passa nada. Adicionado só para
 * permitir isolar a leitura em testes (DT3) — nenhuma fórmula muda.
 */
export async function fetchQuoteIndicatorsCore(db: Queryable = pool): Promise<QuoteIndicatorsRawRow1> {
  const result = await db.query<QuoteIndicatorsRawRow1>(
    `WITH current_versions AS (
       SELECT
         qv."sentAt",
         qv."decidedAt",
         qv."totalCents",
         CASE
           WHEN qv.status = 'ENVIADO' AND qv."validUntil" < NOW() THEN 'EXPIRADO'
           ELSE qv.status
         END AS effective_status
       FROM quotes q
       INNER JOIN quote_versions qv
         ON qv."quoteId" = q.id AND qv."versionNumber" = q."currentVersionNumber"
     )
     SELECT
       (SELECT COUNT(*)::text FROM quotes) AS total_quotes,
       COUNT(*) FILTER (WHERE cv."sentAt" IS NOT NULL)::text AS sent_count,
       COALESCE(SUM(cv."totalCents") FILTER (WHERE cv."sentAt" IS NOT NULL), 0)::text AS total_quoted_cents,
       COUNT(*) FILTER (
         WHERE cv."sentAt" IS NOT NULL
           AND cv.effective_status IN ('APROVADO', 'APROVADO_PARCIAL')
       )::text AS approved_count,
       COUNT(*) FILTER (WHERE cv."decidedAt" IS NOT NULL)::text AS decided_count,
       COALESCE(
         SUM(EXTRACT(EPOCH FROM (cv."decidedAt" - cv."sentAt"))) FILTER (WHERE cv."decidedAt" IS NOT NULL),
         0
       )::text AS decision_seconds_sum
     FROM current_versions cv`,
  );
  return result.rows[0];
}

/**
 * Valor aprovado/recusado: soma por ITEM (não por versão), sempre da
 * versão vigente de cada orçamento. `clientDecision` já é PENDENTE por
 * padrão, então itens de orçamentos ainda não decididos (ou expirados/
 * cancelados sem decisão) simplesmente não entram em nenhuma das duas
 * somas — não precisa filtrar status separadamente aqui.
 *
 * `db` opcional — ver nota acima em `fetchQuoteIndicatorsCore`.
 */
export async function fetchQuoteIndicatorsItemValues(db: Queryable = pool): Promise<QuoteIndicatorsRawRow2> {
  const result = await db.query<QuoteIndicatorsRawRow2>(
    `SELECT
       COALESCE(SUM(qi."totalCents") FILTER (WHERE qi."clientDecision" = 'APROVADO'), 0)::text AS approved_value_cents,
       COALESCE(SUM(qi."totalCents") FILTER (WHERE qi."clientDecision" = 'RECUSADO'), 0)::text AS rejected_value_cents
     FROM quotes q
     INNER JOIN quote_versions qv
       ON qv."quoteId" = q.id AND qv."versionNumber" = q."currentVersionNumber"
     INNER JOIN quote_items qi ON qi."quoteVersionId" = qv.id`,
  );
  return result.rows[0];
}
