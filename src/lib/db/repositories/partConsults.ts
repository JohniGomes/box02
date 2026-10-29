import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export interface PartConsultRecord {
  cacheKey: string;
  result: unknown;
  createdAt: Date;
}

/** Consulta guardada, se ainda estiver dentro da validade (em dias). */
export async function findFreshPartConsult(cacheKey: string, maxAgeDays: number): Promise<PartConsultRecord | null> {
  const r = await pool.query<PartConsultRecord>(
    `SELECT "cacheKey", result, "createdAt" FROM part_consults
     WHERE "cacheKey" = $1 AND "createdAt" > NOW() - ($2::int * INTERVAL '1 day')`,
    [cacheKey, maxAgeDays],
  );
  return r.rows[0] ?? null;
}

/** Guarda (ou renova) o resultado da consulta. */
export async function savePartConsult(input: {
  cacheKey: string;
  vehicleLabel: string;
  partLabel: string;
  result: unknown;
  createdByUserId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO part_consults (id, "cacheKey", "vehicleLabel", "partLabel", result, "createdByUserId")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT ("cacheKey") DO UPDATE SET result = $5::jsonb, "createdAt" = NOW(), "createdByUserId" = $6`,
    [createId(), input.cacheKey, input.vehicleLabel, input.partLabel, JSON.stringify(input.result), input.createdByUserId],
  );
}
