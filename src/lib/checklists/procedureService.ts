import {
  createProcedure,
  findProcedureByCode,
  findProcedureById,
  listActiveProcedures,
  searchProcedures,
  setProcedureStatus,
  updateProcedure,
  type ProcedureRecord,
  type SearchProceduresFilters,
} from "@/lib/db/repositories/procedures";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { procedureInputSchema, type ProcedureInput } from "@/lib/validation/checklist";
import { ProcedureCodeAlreadyExistsError, ProcedureNotFoundError } from "./errors";

async function assertCodeAvailable(code: string, ignoreId?: string): Promise<void> {
  const existing = await findProcedureByCode(code);
  if (existing && existing.id !== ignoreId) {
    throw new ProcedureCodeAlreadyExistsError(code);
  }
}

export async function createProcedureService(actorUserId: string, rawInput: unknown): Promise<ProcedureRecord> {
  const input = procedureInputSchema.parse(rawInput) as ProcedureInput;
  await assertCodeAvailable(input.code);

  const procedure = await createProcedure({
    code: input.code,
    title: input.title,
    objective: input.objective ?? null,
    prerequisites: input.prerequisites ?? null,
    steps: input.steps ?? null,
    completionCriteria: input.completionCriteria ?? null,
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "PROCEDURE_CREATED",
    entityType: "procedure",
    entityId: procedure.id,
    metadata: { code: procedure.code, title: procedure.title },
  });

  return procedure;
}

export async function updateProcedureService(
  actorUserId: string,
  procedureId: string,
  rawInput: unknown,
): Promise<ProcedureRecord> {
  const input = procedureInputSchema.parse(rawInput) as ProcedureInput;

  const existing = await findProcedureById(procedureId);
  if (!existing) throw new ProcedureNotFoundError();
  await assertCodeAvailable(input.code, procedureId);

  const updated = await updateProcedure(procedureId, {
    code: input.code,
    title: input.title,
    objective: input.objective ?? null,
    prerequisites: input.prerequisites ?? null,
    steps: input.steps ?? null,
    completionCriteria: input.completionCriteria ?? null,
  });
  if (!updated) throw new ProcedureNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "PROCEDURE_UPDATED",
    entityType: "procedure",
    entityId: procedureId,
    metadata: { code: updated.code },
  });

  return updated;
}

export async function inactivateProcedureService(actorUserId: string, procedureId: string): Promise<ProcedureRecord> {
  const updated = await setProcedureStatus(procedureId, "INATIVO");
  if (!updated) throw new ProcedureNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "PROCEDURE_INACTIVATED",
    entityType: "procedure",
    entityId: procedureId,
  });

  return updated;
}

export async function reactivateProcedureService(actorUserId: string, procedureId: string): Promise<ProcedureRecord> {
  const updated = await setProcedureStatus(procedureId, "ATIVO");
  if (!updated) throw new ProcedureNotFoundError();

  await recordAuditLog({
    userId: actorUserId,
    action: "PROCEDURE_REACTIVATED",
    entityType: "procedure",
    entityId: procedureId,
  });

  return updated;
}

export async function getProcedureService(procedureId: string): Promise<ProcedureRecord | null> {
  return findProcedureById(procedureId);
}

export async function searchProceduresService(filters: SearchProceduresFilters) {
  return searchProcedures(filters);
}

/** Usada pelo seletor de procedimento ao associar a um serviço — só
 * ATIVOS aparecem como opção para nova associação. */
export async function listActiveProceduresService(): Promise<ProcedureRecord[]> {
  return listActiveProcedures();
}
