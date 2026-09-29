import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type VehicleStatus = "ATIVO" | "INATIVO";

export interface VehicleRecord {
  id: string;
  status: VehicleStatus;
  customerId: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  version: string | null;
  yearManufacture: number | null;
  yearModel: number | null;
  color: string | null;
  fuelType: string | null;
  mileage: number | null;
  chassis: string | null;
  renavam: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VEHICLE_COLUMNS = `
  id, status, "customerId", plate, brand, model, version,
  "yearManufacture", "yearModel", color, "fuelType", mileage,
  chassis, renavam, notes, "createdAt", "updatedAt"
`;

export interface CreateVehicleInput {
  customerId: string;
  plate?: string;
  brand?: string;
  model?: string;
  version?: string;
  yearManufacture?: number;
  yearModel?: number;
  color?: string;
  fuelType?: string;
  mileage?: number;
  chassis?: string;
  renavam?: string;
  notes?: string;
}

export async function createVehicle(input: CreateVehicleInput): Promise<VehicleRecord> {
  const id = createId();
  const result = await pool.query<VehicleRecord>(
    `INSERT INTO vehicles (
      id, status, "customerId", plate, brand, model, version,
      "yearManufacture", "yearModel", color, "fuelType", mileage,
      chassis, renavam, notes, "updatedAt"
    ) VALUES (
      $1, 'ATIVO', $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11,
      $12, $13, $14, NOW()
    ) RETURNING ${VEHICLE_COLUMNS}`,
    [
      id,
      input.customerId,
      input.plate ?? null,
      input.brand ?? null,
      input.model ?? null,
      input.version ?? null,
      input.yearManufacture ?? null,
      input.yearModel ?? null,
      input.color ?? null,
      input.fuelType ?? null,
      input.mileage ?? null,
      input.chassis ?? null,
      input.renavam ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0];
}

export type UpdateVehicleInput = Partial<Omit<CreateVehicleInput, "customerId">>;

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput,
): Promise<VehicleRecord | null> {
  const result = await pool.query<VehicleRecord>(
    `UPDATE vehicles SET
      plate = $2,
      brand = $3,
      model = $4,
      version = $5,
      "yearManufacture" = $6,
      "yearModel" = $7,
      color = $8,
      "fuelType" = $9,
      mileage = $10,
      chassis = $11,
      renavam = $12,
      notes = $13,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${VEHICLE_COLUMNS}`,
    [
      id,
      input.plate ?? null,
      input.brand ?? null,
      input.model ?? null,
      input.version ?? null,
      input.yearManufacture ?? null,
      input.yearModel ?? null,
      input.color ?? null,
      input.fuelType ?? null,
      input.mileage ?? null,
      input.chassis ?? null,
      input.renavam ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setVehicleStatus(
  id: string,
  status: VehicleStatus,
): Promise<VehicleRecord | null> {
  const result = await pool.query<VehicleRecord>(
    `UPDATE vehicles SET status = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${VEHICLE_COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function setVehicleCustomer(
  id: string,
  customerId: string,
): Promise<VehicleRecord | null> {
  const result = await pool.query<VehicleRecord>(
    `UPDATE vehicles SET "customerId" = $2, "updatedAt" = NOW() WHERE id = $1 RETURNING ${VEHICLE_COLUMNS}`,
    [id, customerId],
  );
  return result.rows[0] ?? null;
}

export async function findVehicleById(id: string): Promise<VehicleRecord | null> {
  const result = await pool.query<VehicleRecord>(
    `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findVehicleByPlate(plate: string): Promise<VehicleRecord | null> {
  const result = await pool.query<VehicleRecord>(
    `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE plate = $1 LIMIT 1`,
    [plate],
  );
  return result.rows[0] ?? null;
}

export async function listVehiclesByCustomer(customerId: string): Promise<VehicleRecord[]> {
  const result = await pool.query<VehicleRecord>(
    `SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE "customerId" = $1 ORDER BY "createdAt" DESC`,
    [customerId],
  );
  return result.rows;
}

export interface SearchVehiclesFilters {
  query?: string;
  status?: VehicleStatus;
  customerId?: string;
  limit?: number;
  offset?: number;
}

export interface VehicleWithCustomerName extends VehicleRecord {
  customerName: string;
}

export interface SearchVehiclesResult {
  items: VehicleWithCustomerName[];
  total: number;
}

export async function searchVehicles(
  filters: SearchVehiclesFilters,
): Promise<SearchVehiclesResult> {
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
      `(v.plate LIKE $${plateIdx} OR v.brand ILIKE $${textIdx} OR v.model ILIKE $${textIdx} OR c."legalName" ILIKE $${textIdx})`,
    );
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`v.status = $${params.length}`);
  }

  if (filters.customerId) {
    params.push(filters.customerId);
    conditions.push(`v."customerId" = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const itemsResult = await pool.query<VehicleWithCustomerName>(
    `SELECT v.id, v.status, v."customerId", v.plate, v.brand, v.model, v.version,
            v."yearManufacture", v."yearModel", v.color, v."fuelType", v.mileage,
            v.chassis, v.renavam, v.notes, v."createdAt", v."updatedAt",
            c."legalName" as "customerName"
     FROM vehicles v
     INNER JOIN customers c ON c.id = v."customerId"
     ${whereClause}
     ORDER BY v."createdAt" DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM vehicles v INNER JOIN customers c ON c.id = v."customerId" ${whereClause}`,
    params.slice(0, params.length - 2),
  );

  return {
    items: itemsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
