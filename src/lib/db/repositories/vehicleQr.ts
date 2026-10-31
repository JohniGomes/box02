import { pool } from "../pool";

/** Código do link público (QR Car) do veículo; nulo = sem QR. Nunca vem junto do VehicleRecord de propósito. */
export async function getVehiclePublicToken(vehicleId: string): Promise<string | null> {
  const r = await pool.query<{ publicToken: string | null }>(`SELECT "publicToken" FROM vehicles WHERE id = $1`, [vehicleId]);
  return r.rows[0]?.publicToken ?? null;
}

export async function setVehiclePublicToken(vehicleId: string, token: string | null): Promise<boolean> {
  const r = await pool.query(`UPDATE vehicles SET "publicToken" = $2, "updatedAt" = NOW() WHERE id = $1`, [vehicleId, token]);
  return (r.rowCount ?? 0) > 0;
}

/** Só o que a página pública pode mostrar: nada do cliente (nome, telefone, CPF) e nada de valores. */
export interface PublicVehicle {
  id: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  yearManufacture: number | null;
  yearModel: number | null;
  color: string | null;
  mileage: number | null;
}

export async function findVehicleByPublicToken(token: string): Promise<PublicVehicle | null> {
  if (!token) return null;
  const r = await pool.query<PublicVehicle>(
    `SELECT id, plate, brand, model, version, "yearManufacture", "yearModel", color, mileage
     FROM vehicles WHERE "publicToken" = $1 LIMIT 1`,
    [token],
  );
  return r.rows[0] ?? null;
}

export interface PublicHistoryEntry {
  deliveredAt: Date;
  mileageAtEntry: number | null;
  /** Descrição dos itens executados (sem valores, sem custo, sem observações). */
  items: string[];
}

/** Serviços feitos neste veículo (OS entregues), do mais recente para o mais antigo. */
export async function listPublicHistory(vehicleId: string, limit = 8): Promise<PublicHistoryEntry[]> {
  const orders = await pool.query<{ id: string; deliveredAt: Date; mileageAtEntry: number | null }>(
    `SELECT id, "deliveredAt", "mileageAtEntry" FROM work_orders
     WHERE "vehicleId" = $1 AND status = 'ENTREGUE' AND "deliveredAt" IS NOT NULL
     ORDER BY "deliveredAt" DESC LIMIT $2`,
    [vehicleId, limit],
  );
  if (orders.rows.length === 0) return [];
  const items = await pool.query<{ workOrderId: string; description: string }>(
    `SELECT "workOrderId", description FROM work_order_items
     WHERE "workOrderId" = ANY($1::text[]) AND status = 'EXECUTADO' AND "customerSupplied" = FALSE
     ORDER BY "createdAt" ASC`,
    [orders.rows.map((o) => o.id)],
  );
  const byOrder = new Map<string, string[]>();
  for (const i of items.rows) byOrder.set(i.workOrderId, [...(byOrder.get(i.workOrderId) ?? []), i.description]);
  return orders.rows.map((o) => ({
    deliveredAt: o.deliveredAt,
    mileageAtEntry: o.mileageAtEntry,
    items: byOrder.get(o.id) ?? [],
  }));
}
