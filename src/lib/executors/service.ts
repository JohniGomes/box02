import { z } from "zod";
import {
  createExecutor,
  findExecutorById,
  findExecutorByName,
  listExecutors,
  setExecutorStatus,
  type ExecutorRecord,
  type ExecutorStatus,
} from "@/lib/db/repositories/executors";
import { listActiveUsers } from "@/lib/db/repositories/users";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";

import { EXECUTOR_VALUE_PREFIX, type ExecutorOption } from "./value";

/**
 * "Quem executou": lista simples de nomes (sem login). Se não houver nenhum
 * executor ativo, os seletores caem de volta na lista de usuários — nada quebra.
 * (As funções puras do valor do seletor ficam em ./value.)
 */

export class ExecutorNameTakenError extends Error {
  constructor(name: string) {
    super(`Já existe um executor chamado "${name}".`);
    this.name = "ExecutorNameTakenError";
  }
}

export class ExecutorNotFoundError extends Error {
  constructor() {
    super("Executor não encontrado.");
    this.name = "ExecutorNotFoundError";
  }
}

export async function listExecutorOptionsService(): Promise<ExecutorOption[]> {
  const executors = await listExecutors(true);
  if (executors.length > 0) {
    return executors.map((e) => ({ id: `${EXECUTOR_VALUE_PREFIX}${e.id}`, name: e.name }));
  }
  const users = await listActiveUsers();
  return users.map((u) => ({ id: u.id, name: u.name }));
}

export async function listAllExecutorsService(): Promise<ExecutorRecord[]> {
  return listExecutors(false);
}

const nameSchema = z.string().trim().min(2, "Informe o nome do executor").max(80, "Nome muito longo");

export async function createExecutorService(actorUserId: string, rawName: unknown): Promise<ExecutorRecord> {
  const name = nameSchema.parse(rawName);
  if (await findExecutorByName(name)) throw new ExecutorNameTakenError(name);

  const created = await createExecutor(name);
  await recordAuditLog({
    userId: actorUserId,
    action: "EXECUTOR_CREATED",
    entityType: "executor",
    entityId: created.id,
    metadata: { name },
  });
  return created;
}

export async function setExecutorStatusService(
  actorUserId: string,
  executorId: string,
  status: ExecutorStatus,
): Promise<ExecutorRecord> {
  if (!(await findExecutorById(executorId))) throw new ExecutorNotFoundError();
  const updated = await setExecutorStatus(executorId, status);
  if (!updated) throw new ExecutorNotFoundError();
  await recordAuditLog({
    userId: actorUserId,
    action: status === "ATIVO" ? "EXECUTOR_REACTIVATED" : "EXECUTOR_DEACTIVATED",
    entityType: "executor",
    entityId: executorId,
  });
  return updated;
}
