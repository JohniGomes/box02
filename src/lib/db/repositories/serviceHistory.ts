import { pool } from "../pool";

export interface VehicleWithServiceRow {
  vehicleId: string;
  plate: string | null;
  brand: string | null;
  model: string | null;
  customerName: string;
  lastAt: Date;
  lastKm: number | null;
  /** Em quantas OS entregues apareceu. */
  times: number;
  /** Descrição do item mais recente que bateu com a busca. */
  sample: string;
}

// Tira o acento antes de baixar a caixa, para funcionar mesmo que o banco não saiba minúscula de letra acentuada (Ó, Ç…).
const NORM = (expr: string) =>
  `lower(translate(${expr}, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))`;

/**
 * Veículos que já tiveram um item (serviço ou peça) com este texto na descrição, em OS entregues.
 * Ignora acento e maiúscula. Só leitura.
 */
export async function listVehiclesByExecutedText(term: string, limit = 15): Promise<VehicleWithServiceRow[]> {
  const escaped = term.trim().replace(/[\\%_]/g, (m) => `\\${m}`);
  const r = await pool.query<VehicleWithServiceRow>(
    `SELECT v.id AS "vehicleId", v.plate, v.brand, v.model, c."legalName" AS "customerName",
            MAX(w."deliveredAt") AS "lastAt",
            (ARRAY_AGG(w."mileageAtEntry" ORDER BY w."deliveredAt" DESC))[1] AS "lastKm",
            COUNT(DISTINCT w.id)::int AS times,
            (ARRAY_AGG(i.description ORDER BY w."deliveredAt" DESC))[1] AS sample
     FROM work_order_items i
     JOIN work_orders w ON w.id = i."workOrderId"
     JOIN vehicles v ON v.id = w."vehicleId"
     JOIN customers c ON c.id = v."customerId"
     WHERE w.status = 'ENTREGUE' AND w."deliveredAt" IS NOT NULL AND i.status = 'EXECUTADO' AND i."customerSupplied" = FALSE
       AND ${NORM("i.description")} LIKE '%' || ${NORM("$1::text")} || '%'
     GROUP BY v.id, c."legalName"
     ORDER BY MAX(w."deliveredAt") DESC
     LIMIT $2`,
    [escaped, limit],
  );
  return r.rows;
}
