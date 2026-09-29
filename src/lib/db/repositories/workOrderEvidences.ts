import type { Pool, PoolClient } from "pg";
import { pool } from "../pool";

type Queryable = Pool | PoolClient;

export type WorkOrderEvidenceType = "GERAL" | "AVARIA";

export interface WorkOrderEvidenceRecord {
  id: string;
  workOrderId: string;
  type: WorkOrderEvidenceType;
  description: string | null;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  createdByUserId: string;
  createdAt: Date;
}

const COLUMNS = `
  id, "workOrderId", type, description, "storageKey", "mimeType", "fileSize",
  "createdByUserId", "createdAt"
`;

/**
 * Ciclo J — grava uma evidência. O `id` é gerado por quem chama (não
 * aqui) porque a `storageKey` do objeto no R2 precisa do id *antes* do
 * upload acontecer — a ordem é: gerar id -> montar storageKey -> subir
 * pro R2 -> só então inserir esta linha, com tudo já resolvido.
 */
export async function createWorkOrderEvidence(
  input: {
    id: string;
    workOrderId: string;
    type: WorkOrderEvidenceType;
    description?: string | null;
    storageKey: string;
    mimeType: string;
    fileSize: number;
    createdByUserId: string;
  },
  db: Queryable = pool,
): Promise<WorkOrderEvidenceRecord> {
  const result = await db.query<WorkOrderEvidenceRecord>(
    `INSERT INTO work_order_evidences
       (id, "workOrderId", type, description, "storageKey", "mimeType", "fileSize", "createdByUserId")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.workOrderId,
      input.type,
      input.description ?? null,
      input.storageKey,
      input.mimeType,
      input.fileSize,
      input.createdByUserId,
    ],
  );
  return result.rows[0];
}

export async function listWorkOrderEvidences(
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderEvidenceRecord[]> {
  const result = await db.query<WorkOrderEvidenceRecord>(
    `SELECT ${COLUMNS} FROM work_order_evidences WHERE "workOrderId" = $1 ORDER BY "createdAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

/** Sempre filtrado por workOrderId também — nunca só por id — para uma
 * evidência de outra OS nunca ser encontrada trocando o id na URL. */
export async function findWorkOrderEvidenceById(
  id: string,
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderEvidenceRecord | null> {
  const result = await db.query<WorkOrderEvidenceRecord>(
    `SELECT ${COLUMNS} FROM work_order_evidences WHERE id = $1 AND "workOrderId" = $2`,
    [id, workOrderId],
  );
  return result.rows[0] ?? null;
}

/** Só chamada pela camada de serviço depois de confirmar
 * `receptionAcceptedAt IS NULL` — o gate de mutabilidade (DEC-J5) não
 * vive aqui, vive em workOrders/service.ts, mesmo padrão já usado em
 * updateWorkOrderReceptionInfoService. Sem função de update — DEC-J5
 * final: substituição é excluir + criar, nunca editar em cima. */
export async function deleteWorkOrderEvidence(id: string, db: Queryable = pool): Promise<void> {
  await db.query(`DELETE FROM work_order_evidences WHERE id = $1`, [id]);
}
