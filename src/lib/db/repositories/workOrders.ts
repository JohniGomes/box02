import type { Pool, PoolClient } from "pg";
import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";
import type { QuoteAdjustmentType } from "./quoteVersions";

type Queryable = Pool | PoolClient;

export type WorkOrderStatus =
  | "ABERTA"
  | "EM_DIAGNOSTICO"
  | "EM_EXECUCAO"
  | "AGUARDANDO_PECA"
  | "TESTE_FINAL"
  | "PRONTA"
  | "ENTREGUE"
  | "CANCELADA";

export interface WorkOrderRecord {
  id: string;
  number: string;
  status: WorkOrderStatus;
  customerId: string;
  vehicleId: string;
  sourceQuoteVersionId: string | null;
  entryAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  mileageAtEntry: number;
  customerComplaint: string | null;
  diagnosis: string | null;
  technicalNotes: string | null;
  discountType: QuoteAdjustmentType | null;
  discountValue: number | null;
  discountTotalCents: number;
  surchargeType: QuoteAdjustmentType | null;
  surchargeValue: number | null;
  surchargeTotalCents: number;
  totalCents: number;
  customerNameSnapshot: string;
  vehiclePlateSnapshot: string | null;
  vehicleDescriptionSnapshot: string | null;
  cancelReason: string | null;
  deliveryAcceptedName: string | null;
  deliveryAcceptedDocument: string | null;
  deliveredByUserId: string | null;
  preExistingDamagesDescription: string | null;
  receptionAcceptedName: string | null;
  receptionAcceptedDocument: string | null;
  receptionAcceptedAt: Date | null;
  receivedByUserId: string | null;
  receptionComplaintSnapshot: string | null;
  receptionDamagesSnapshot: string | null;
  receptionChecklistSnapshot: ReceptionChecklistSnapshot | null;
  diagnosisExplanationNotes: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Ciclo F — congelamento autossuficiente do checklist de entrada no
 * momento do aceite. Nunca relido de work_order_checklists/items depois
 * de gravado. */
export interface ReceptionChecklistSnapshot {
  code: string;
  name: string;
  items: {
    description: string;
    required: boolean;
    sortOrder: number;
    checked: boolean;
  }[];
}

const COLUMNS = `
  id, number, status, "customerId", "vehicleId", "sourceQuoteVersionId",
  "entryAt", "startedAt", "completedAt", "deliveredAt", "cancelledAt",
  "mileageAtEntry", "customerComplaint", diagnosis, "technicalNotes",
  "discountType", "discountValue", "discountTotalCents",
  "surchargeType", "surchargeValue", "surchargeTotalCents", "totalCents",
  "customerNameSnapshot", "vehiclePlateSnapshot", "vehicleDescriptionSnapshot",
  "cancelReason", "deliveryAcceptedName", "deliveryAcceptedDocument", "deliveredByUserId",
  "preExistingDamagesDescription", "receptionAcceptedName", "receptionAcceptedDocument",
  "receptionAcceptedAt", "receivedByUserId", "receptionComplaintSnapshot",
  "receptionDamagesSnapshot", "receptionChecklistSnapshot", "diagnosisExplanationNotes",
  "createdByUserId", "createdAt", "updatedAt"
`;

export interface CreateWorkOrderInput {
  number: string;
  customerId: string;
  vehicleId: string;
  sourceQuoteVersionId?: string | null;
  mileageAtEntry: number;
  customerComplaint?: string;
  diagnosis?: string;
  discountType?: QuoteAdjustmentType | null;
  discountValue?: number | null;
  discountTotalCents?: number;
  surchargeType?: QuoteAdjustmentType | null;
  surchargeValue?: number | null;
  surchargeTotalCents?: number;
  customerNameSnapshot: string;
  vehiclePlateSnapshot?: string | null;
  vehicleDescriptionSnapshot?: string | null;
  createdByUserId: string;
}

export async function createWorkOrder(
  input: CreateWorkOrderInput,
  db: Queryable = pool,
): Promise<WorkOrderRecord> {
  const id = createId();
  const result = await db.query<WorkOrderRecord>(
    `INSERT INTO work_orders (
      id, number, status, "customerId", "vehicleId", "sourceQuoteVersionId",
      "mileageAtEntry", "customerComplaint", diagnosis,
      "discountType", "discountValue", "discountTotalCents",
      "surchargeType", "surchargeValue", "surchargeTotalCents",
      "customerNameSnapshot", "vehiclePlateSnapshot", "vehicleDescriptionSnapshot",
      "createdByUserId", "updatedAt"
    ) VALUES (
      $1, $2, 'ABERTA', $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17,
      $18, NOW()
    ) RETURNING ${COLUMNS}`,
    [
      id,
      input.number,
      input.customerId,
      input.vehicleId,
      input.sourceQuoteVersionId ?? null,
      input.mileageAtEntry,
      input.customerComplaint ?? null,
      input.diagnosis ?? null,
      input.discountType ?? null,
      input.discountValue ?? null,
      input.discountTotalCents ?? 0,
      input.surchargeType ?? null,
      input.surchargeValue ?? null,
      input.surchargeTotalCents ?? 0,
      input.customerNameSnapshot,
      input.vehiclePlateSnapshot ?? null,
      input.vehicleDescriptionSnapshot ?? null,
      input.createdByUserId,
    ],
  );
  return result.rows[0];
}

export async function findWorkOrderById(
  id: string,
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `SELECT ${COLUMNS} FROM work_orders WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function lockWorkOrderById(
  id: string,
  client: PoolClient,
): Promise<WorkOrderRecord | null> {
  const result = await client.query<WorkOrderRecord>(
    `SELECT ${COLUMNS} FROM work_orders WHERE id = $1 LIMIT 1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function setWorkOrderStatus(
  id: string,
  status: WorkOrderStatus,
  extra: {
    startedAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    cancelReason?: string;
    technicalNotes?: string;
    diagnosis?: string;
  } = {},
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET
      status = $2,
      "startedAt" = COALESCE($3, "startedAt"),
      "completedAt" = COALESCE($4, "completedAt"),
      "cancelledAt" = COALESCE($5, "cancelledAt"),
      "cancelReason" = COALESCE($6, "cancelReason"),
      "technicalNotes" = COALESCE($7, "technicalNotes"),
      diagnosis = COALESCE($8, diagnosis),
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      status,
      extra.startedAt ?? null,
      extra.completedAt ?? null,
      extra.cancelledAt ?? null,
      extra.cancelReason ?? null,
      extra.technicalNotes ?? null,
      extra.diagnosis ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function closeWorkOrder(
  id: string,
  input: {
    totalCents: number;
    deliveredAt: Date;
    deliveryAcceptedName: string;
    deliveryAcceptedDocument: string | null;
    deliveredByUserId: string;
  },
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET
      status = 'ENTREGUE',
      "totalCents" = $2,
      "deliveredAt" = $3,
      "deliveryAcceptedName" = $4,
      "deliveryAcceptedDocument" = $5,
      "deliveredByUserId" = $6,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.totalCents,
      input.deliveredAt,
      input.deliveryAcceptedName,
      input.deliveryAcceptedDocument,
      input.deliveredByUserId,
    ],
  );
  return result.rows[0] ?? null;
}

/** Ciclo F — atualiza a descrição de avarias preexistentes. Livre
 * enquanto o aceite não existir — nenhuma restrição aqui; a trava
 * write-once vive em `registerWorkOrderReceptionAcceptance`, não nesta
 * função. */
export async function updatePreExistingDamagesDescription(
  id: string,
  description: string | null,
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET "preExistingDamagesDescription" = $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, description],
  );
  return result.rows[0] ?? null;
}

/** UI do Método BOX 02 — atualiza o registro de EXPLICAMOS. Livre a
 * qualquer momento, sem gate, sem write-once — mesmo padrão de
 * `updatePreExistingDamagesDescription`. */
export async function updateDiagnosisExplanationNotes(
  id: string,
  notes: string | null,
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET "diagnosisExplanationNotes" = $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, notes],
  );
  return result.rows[0] ?? null;
}

/** Ciclo G (Entrega Técnica) — atualiza o registro técnico da entrega.
 * Livre a partir de PRONTA (a UI decide quando oferecer), continua
 * editável depois de ENTREGUE, sem gate, sem write-once. Mesmo padrão
 * exato de `updateDiagnosisExplanationNotes` — operação isolada, nunca
 * chamada de dentro de `closeWorkOrder`/`setWorkOrderStatus`. */
export async function updateWorkOrderTechnicalNotes(
  id: string,
  notes: string | null,
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET "technicalNotes" = $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, notes],
  );
  return result.rows[0] ?? null;
}

/** Ciclo F — grava o aceite de recepção e os 3 snapshots (queixa,
 * avarias, checklist de entrada) numa única escrita. Quem chama é
 * responsável por já ter confirmado (dentro da mesma transação) que
 * `receptionAcceptedAt` ainda é `NULL` — write-once garantido pela
 * camada de serviço, não redundantemente aqui. */
export async function registerWorkOrderReceptionAcceptance(
  id: string,
  input: {
    receptionAcceptedName: string;
    receptionAcceptedDocument: string | null;
    receivedByUserId: string;
    receptionComplaintSnapshot: string | null;
    receptionDamagesSnapshot: string | null;
    receptionChecklistSnapshot: ReceptionChecklistSnapshot | null;
  },
  db: Queryable = pool,
): Promise<WorkOrderRecord | null> {
  const result = await db.query<WorkOrderRecord>(
    `UPDATE work_orders SET
      "receptionAcceptedName" = $2,
      "receptionAcceptedDocument" = $3,
      "receptionAcceptedAt" = NOW(),
      "receivedByUserId" = $4,
      "receptionComplaintSnapshot" = $5,
      "receptionDamagesSnapshot" = $6,
      "receptionChecklistSnapshot" = $7::jsonb,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${COLUMNS}`,
    [
      id,
      input.receptionAcceptedName,
      input.receptionAcceptedDocument,
      input.receivedByUserId,
      input.receptionComplaintSnapshot,
      input.receptionDamagesSnapshot,
      input.receptionChecklistSnapshot ? JSON.stringify(input.receptionChecklistSnapshot) : null,
    ],
  );
  return result.rows[0] ?? null;
}

export interface WorkOrderWithNames extends WorkOrderRecord {
  customerName: string;
  vehiclePlate: string | null;
}

export interface SearchWorkOrdersFilters {
  query?: string;
  status?: WorkOrderStatus;
  limit?: number;
  offset?: number;
}

export interface SearchWorkOrdersResult {
  items: WorkOrderWithNames[];
  total: number;
}

export async function searchWorkOrders(
  filters: SearchWorkOrdersFilters,
): Promise<SearchWorkOrdersResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    const raw = filters.query.trim();
    const plateLike = `%${raw.toUpperCase().replace(/[^A-Z0-9]/g, "")}%`;
    const textLike = `%${raw}%`;
    params.push(plateLike, textLike);
    const plateIdx = params.length - 1;
    const textIdx = params.length;
    conditions.push(
      `(wo.number ILIKE $${textIdx} OR v.plate LIKE $${plateIdx} OR c."legalName" ILIKE $${textIdx})`,
    );
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`wo.status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const itemsResult = await pool.query<WorkOrderWithNames>(
    `SELECT wo.id, wo.number, wo.status, wo."customerId", wo."vehicleId", wo."sourceQuoteVersionId",
            wo."entryAt", wo."startedAt", wo."completedAt", wo."deliveredAt", wo."cancelledAt",
            wo."mileageAtEntry", wo."customerComplaint", wo.diagnosis, wo."technicalNotes",
            wo."discountType", wo."discountValue", wo."discountTotalCents",
            wo."surchargeType", wo."surchargeValue", wo."surchargeTotalCents", wo."totalCents",
            wo."customerNameSnapshot", wo."vehiclePlateSnapshot", wo."vehicleDescriptionSnapshot",
            wo."cancelReason", wo."deliveryAcceptedName", wo."deliveryAcceptedDocument", wo."deliveredByUserId",
            wo."receptionAcceptedAt",
            wo."createdByUserId", wo."createdAt", wo."updatedAt",
            c."legalName" as "customerName", v.plate as "vehiclePlate"
     FROM work_orders wo
     INNER JOIN customers c ON c.id = wo."customerId"
     INNER JOIN vehicles v ON v.id = wo."vehicleId"
     ${whereClause}
     ORDER BY wo."createdAt" DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM work_orders wo
     INNER JOIN customers c ON c.id = wo."customerId"
     INNER JOIN vehicles v ON v.id = wo."vehicleId"
     ${whereClause}`,
    params.slice(0, params.length - 2),
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0]?.count ?? 0) };
}

export interface CustomerWorkOrderHistoryRow {
  id: string;
  number: string;
  status: WorkOrderStatus;
  vehiclePlateSnapshot: string | null;
  vehicleDescriptionSnapshot: string | null;
  entryAt: Date;
  deliveredAt: Date | null;
  totalCents: number;
}

/** Ciclo O — histórico consolidado do cliente. Sem tabela nova: os
 * dados já existem em `work_orders`, só falta juntar numa consulta
 * própria (mais barato e direto que reaproveitar `searchWorkOrders`,
 * que serve outro caso de uso — busca livre, não histórico de um
 * cliente específico). */
export async function listWorkOrdersByCustomer(
  customerId: string,
  db: Queryable = pool,
): Promise<CustomerWorkOrderHistoryRow[]> {
  const result = await db.query<CustomerWorkOrderHistoryRow>(
    `SELECT id, number, status, "vehiclePlateSnapshot", "vehicleDescriptionSnapshot",
            "entryAt", "deliveredAt", "totalCents"
     FROM work_orders
     WHERE "customerId" = $1
     ORDER BY "entryAt" DESC`,
    [customerId],
  );
  return result.rows;
}
