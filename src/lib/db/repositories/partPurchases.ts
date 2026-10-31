import { pool } from "../pool";

export interface PartSupplierRow {
  supplierName: string | null;
  purchaseDate: Date;
  quantity: number;
}

/** Últimas compras de uma peça (fornecedor, data e quantidade), da mais recente para a mais antiga. */
export async function listLastSuppliersForPart(partId: string, limit = 3): Promise<PartSupplierRow[]> {
  const result = await pool.query<PartSupplierRow>(
    `SELECT COALESCE(s.name, pu."supplierName") AS "supplierName", pu."purchaseDate", sm.quantity
     FROM stock_movements sm
     JOIN purchases pu ON pu.id = sm."purchaseId"
     LEFT JOIN suppliers s ON s.id = pu."supplierId"
     WHERE sm."partId" = $1 AND sm.type = 'ENTRADA'
     ORDER BY pu."purchaseDate" DESC, sm."createdAt" DESC
     LIMIT $2`,
    [partId, limit],
  );
  return result.rows;
}
