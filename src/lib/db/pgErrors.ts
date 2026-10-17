/** Postgres error code 23503 = foreign_key_violation. Usado pros
 * services traduzirem "tem vínculo" numa mensagem amigável, em vez de
 * deixar o erro cru do banco vazar pra UI. */
export function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23503";
}
