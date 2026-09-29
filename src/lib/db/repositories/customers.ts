import { createId } from "@paralleldrive/cuid2";
import { pool } from "../pool";

export type CustomerType = "PF" | "PJ";
export type CustomerStatus = "ATIVO" | "INATIVO";

export interface CustomerRecord {
  id: string;
  type: CustomerType;
  status: CustomerStatus;
  legalName: string;
  tradeName: string | null;
  contactName: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZipCode: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CUSTOMER_COLUMNS = `
  id, type, status, "legalName", "tradeName", "contactName", document,
  phone, whatsapp, email,
  "addressStreet", "addressNumber", "addressComplement", "addressNeighborhood",
  "addressCity", "addressState", "addressZipCode",
  notes, "createdAt", "updatedAt"
`;

export interface CreateCustomerInput {
  type: CustomerType;
  legalName: string;
  tradeName?: string;
  contactName?: string;
  document?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
  notes?: string;
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
  const id = createId();
  const result = await pool.query<CustomerRecord>(
    `INSERT INTO customers (
      id, type, status, "legalName", "tradeName", "contactName", document,
      phone, whatsapp, email,
      "addressStreet", "addressNumber", "addressComplement", "addressNeighborhood",
      "addressCity", "addressState", "addressZipCode",
      notes, "updatedAt"
    ) VALUES (
      $1, $2, 'ATIVO', $3, $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12, $13,
      $14, $15, $16,
      $17, NOW()
    ) RETURNING ${CUSTOMER_COLUMNS}`,
    [
      id,
      input.type,
      input.legalName,
      input.tradeName ?? null,
      input.contactName ?? null,
      input.document ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
      input.email ?? null,
      input.addressStreet ?? null,
      input.addressNumber ?? null,
      input.addressComplement ?? null,
      input.addressNeighborhood ?? null,
      input.addressCity ?? null,
      input.addressState ?? null,
      input.addressZipCode ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0];
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
): Promise<CustomerRecord | null> {
  const result = await pool.query<CustomerRecord>(
    `UPDATE customers SET
      "legalName" = COALESCE($2, "legalName"),
      "tradeName" = $3,
      "contactName" = $4,
      document = $5,
      phone = $6,
      whatsapp = $7,
      email = $8,
      "addressStreet" = $9,
      "addressNumber" = $10,
      "addressComplement" = $11,
      "addressNeighborhood" = $12,
      "addressCity" = $13,
      "addressState" = $14,
      "addressZipCode" = $15,
      notes = $16,
      "updatedAt" = NOW()
    WHERE id = $1
    RETURNING ${CUSTOMER_COLUMNS}`,
    [
      id,
      input.legalName ?? null,
      input.tradeName ?? null,
      input.contactName ?? null,
      input.document ?? null,
      input.phone ?? null,
      input.whatsapp ?? null,
      input.email ?? null,
      input.addressStreet ?? null,
      input.addressNumber ?? null,
      input.addressComplement ?? null,
      input.addressNeighborhood ?? null,
      input.addressCity ?? null,
      input.addressState ?? null,
      input.addressZipCode ?? null,
      input.notes ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function setCustomerStatus(
  id: string,
  status: CustomerStatus,
): Promise<CustomerRecord | null> {
  const result = await pool.query<CustomerRecord>(
    `UPDATE customers SET status = $2, "updatedAt" = NOW()
     WHERE id = $1
     RETURNING ${CUSTOMER_COLUMNS}`,
    [id, status],
  );
  return result.rows[0] ?? null;
}

export async function findCustomerById(id: string): Promise<CustomerRecord | null> {
  const result = await pool.query<CustomerRecord>(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findCustomerByDocument(document: string): Promise<CustomerRecord | null> {
  const result = await pool.query<CustomerRecord>(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers WHERE document = $1 LIMIT 1`,
    [document],
  );
  return result.rows[0] ?? null;
}

export interface SearchCustomersFilters {
  query?: string;
  type?: CustomerType;
  status?: CustomerStatus;
  limit?: number;
  offset?: number;
}

export interface SearchCustomersResult {
  items: CustomerRecord[];
  total: number;
}

export async function searchCustomers(
  filters: SearchCustomersFilters,
): Promise<SearchCustomersResult> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.query && filters.query.trim() !== "") {
    params.push(`%${filters.query.trim()}%`);
    const idx = params.length;
    conditions.push(
      `("legalName" ILIKE $${idx} OR "tradeName" ILIKE $${idx} OR document LIKE $${idx} OR phone LIKE $${idx} OR whatsapp LIKE $${idx} OR email ILIKE $${idx})`,
    );
  }

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const itemsResult = await pool.query<CustomerRecord>(
    `SELECT ${CUSTOMER_COLUMNS} FROM customers
     ${whereClause}
     ORDER BY "legalName" ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM customers ${whereClause}`,
    params.slice(0, params.length - 2),
  );

  return {
    items: itemsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
