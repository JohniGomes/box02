import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import type { QuoteItemType } from "./quoteItems";

type Queryable = Pool | PoolClient;

export type WorkOrderItemOrigin = "DO_ORCAMENTO" | "ADICIONAL_DURANTE_EXECUCAO" | "SEM_ORCAMENTO";
export type WorkOrderItemStatus = "PLANEJADO" | "EXECUTADO" | "CANCELADO";
export type WorkOrderAuthorizationChannel = "TELEFONE" | "PRESENCIAL" | "WHATSAPP" | "LINK";
export type WorkOrderItemClientDecision = "PENDENTE" | "APROVADO" | "RECUSADO";

export interface WorkOrderItemRecord {
  id: string;
  workOrderId: string;
  type: QuoteItemType;
  description: string;
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
  origin: WorkOrderItemOrigin;
  sourceQuoteItemId: string | null;
  status: WorkOrderItemStatus;
  executedAt: Date | null;
  executedByUserId: string | null;
  clientAuthorizedBy: string | null;
  clientAuthorizedAt: Date | null;
  authorizationChannel: WorkOrderAuthorizationChannel | null;
  authorizationNotes: string | null;
  authorizationIpAddress: string | null;
  clientDecision: WorkOrderItemClientDecision;
  createdByUserId: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  accessTokenRevokedAt: Date | null;
  supersedesItemId: string | null;
  catalogItemType: string | null;
  catalogItemId: string | null;
  serviceId: string | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = `
  id, "workOrderId", type, description, quantity, "unitPriceCents", "totalCents",
  origin, "sourceQuoteItemId", status, "executedAt", "executedByUserId",
  "clientAuthorizedBy", "clientAuthorizedAt", "authorizationChannel", "authorizationNotes", "authorizationIpAddress",
  "clientDecision", "createdByUserId", "accessToken", "accessTokenExpiresAt", "accessTokenRevokedAt",
  "supersedesItemId", "catalogItemType", "catalogItemId", "serviceId", "cancelReason", "createdAt", "updatedAt"
`;

export interface InsertWorkOrderItemInput {
  workOrderId: string;
  type: QuoteItemType;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  origin: WorkOrderItemOrigin;
  sourceQuoteItemId?: string | null;
  catalogItemType?: string | null;
  catalogItemId?: string | null;
  serviceId?: string | null;
  createdByUserId?: string | null;
  supersedesItemId?: string | null;
}

export async function insertWorkOrderItems(
  items: InsertWorkOrderItemInput[],
  db: Queryable = pool,
): Promise<WorkOrderItemRecord[]> {
  const inserted: WorkOrderItemRecord[] = [];
  for (const item of items) {
    const id = createId();
    const result = await db.query<WorkOrderItemRecord>(
      `INSERT INTO work_order_items (
        id, "workOrderId", type, description, quantity, "unitPriceCents", "totalCents",
        origin, "sourceQuoteItemId", status, "catalogItemType", "catalogItemId", "serviceId",
        "createdByUserId", "supersedesItemId", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PLANEJADO', $10, $11, $12, $13, $14, NOW())
      RETURNING ${COLUMNS}`,
      [
        id,
        item.workOrderId,
        item.type,
        item.description,
        item.quantity,
        item.unitPriceCents,
        item.totalCents,
        item.origin,
        item.sourceQuoteItemId ?? null,
        item.catalogItemType ?? null,
        item.catalogItemId ?? null,
        item.serviceId ?? null,
        item.createdByUserId ?? null,
        item.supersedesItemId ?? null,
      ],
    );
    inserted.push(result.rows[0]);
  }
  return inserted;
}

export async function listWorkOrderItemsByWorkOrder(
  workOrderId: string,
  db: Queryable = pool,
): Promise<WorkOrderItemRecord[]> {
  const result = await db.query<WorkOrderItemRecord>(
    `SELECT ${COLUMNS} FROM work_order_items WHERE "workOrderId" = $1 ORDER BY "createdAt" ASC`,
    [workOrderId],
  );
  return result.rows;
}

export async function findWorkOrderItemById(
  id: string,
  db: Queryable = pool,
): Promise<WorkOrderItemRecord | null> {
  const result = await db.query<WorkOrderItemRecord>(
    `SELECT ${COLUMNS} FROM work_order_items WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Mesmo padrão de `lockWorkOrderById` (orçamento/OS): trava a linha até o
 * fim da transação. Corrige a ausência de trava identificada como risco na
 * especificação da Sub-etapa 2 — usada tanto na execução/cancelamento de
 * item quanto na submissão de decisão de adicional via link. */
export async function lockWorkOrderItemById(
  id: string,
  client: PoolClient,
): Promise<WorkOrderItemRecord | null> {
  const result = await client.query<WorkOrderItemRecord>(
    `SELECT ${COLUMNS} FROM work_order_items WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findWorkOrderItemByAccessToken(
  token: string,
  db: Queryable = pool,
): Promise<WorkOrderItemRecord | null> {
  const result = await db.query<WorkOrderItemRecord>(
    `SELECT ${COLUMNS} FROM work_order_items WHERE "accessToken" = $1 LIMIT 1`,
    [token],
  );
  return result.rows[0] ?? null;
}

export async function setWorkOrderItemStatus(
  id: string,
  status: WorkOrderItemStatus,
  extra: { executedAt?: Date; executedByUserId?: string; cancelReason?: string } = {},
  db: Queryable = pool,
): Promise<WorkOrderItemRecord | null> {
  const result = await db.query<WorkOrderItemRecord>(
    `UPDATE work_order_items SET
      status = $2,
      "executedAt" = COALESCE($3, "executedAt"),
      "executedByUserId" = COALESCE($4, "executedByUserId"),
      "cancelReason" = COALESCE($5, "cancelReason"),
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [id, status, extra.executedAt ?? null, extra.executedByUserId ?? null, extra.cancelReason ?? null],
  );
  return result.rows[0] ?? null;
}

/** Grava o link de acesso público de um adicional (token + validade). */
export async function setWorkOrderItemAccessToken(
  id: string,
  token: string,
  expiresAt: Date,
  db: Queryable = pool,
): Promise<WorkOrderItemRecord | null> {
  const result = await db.query<WorkOrderItemRecord>(
    `UPDATE work_order_items SET
      "accessToken" = $2, "accessTokenExpiresAt" = $3, "accessTokenRevokedAt" = NULL, "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [id, token, expiresAt],
  );
  return result.rows[0] ?? null;
}

export async function revokeWorkOrderItemAccessToken(
  id: string,
  db: Queryable = pool,
): Promise<void> {
  await db.query(`UPDATE work_order_items SET "accessTokenRevokedAt" = NOW() WHERE id = $1`, [id]);
}

/** Grava a decisão do cliente (aprovação/recusa) e os dados de quem
 * autorizou — usada tanto pela decisão via link quanto pela autorização
 * direta (presencial/telefone). */
export async function setWorkOrderItemClientDecision(
  id: string,
  input: {
    clientDecision: WorkOrderItemClientDecision;
    clientAuthorizedBy: string;
    authorizationChannel: WorkOrderAuthorizationChannel;
    authorizationNotes?: string | null;
    authorizationIpAddress?: string | null;
  },
  db: Queryable = pool,
): Promise<WorkOrderItemRecord | null> {
  const result = await db.query<WorkOrderItemRecord>(
    `UPDATE work_order_items SET
      "clientDecision" = $2,
      "clientAuthorizedBy" = $3,
      "clientAuthorizedAt" = NOW(),
      "authorizationChannel" = $4,
      "authorizationNotes" = $5,
      "authorizationIpAddress" = $6,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.clientDecision,
      input.clientAuthorizedBy,
      input.authorizationChannel,
      input.authorizationNotes ?? null,
      input.authorizationIpAddress ?? null,
    ],
  );
  return result.rows[0] ?? null;
}
