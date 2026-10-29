import { pool } from "../pool";
import type { LastServiceRow } from "@/lib/vehicles/nextService";

/** Última vez que cada serviço COM intervalo foi executado e entregue neste veículo. */
export async function listLastServicesForVehicle(vehicleId: string): Promise<LastServiceRow[]> {
  const r = await pool.query<LastServiceRow>(
    `SELECT DISTINCT ON (s.id)
       s.id AS "serviceId", s.name AS "serviceName", s."intervalMonths", s."intervalKm",
       w."deliveredAt" AS "lastAt", w."mileageAtEntry" AS "lastKm"
     FROM work_order_items i
     JOIN work_orders w ON w.id = i."workOrderId"
     JOIN services s ON s.id = i."serviceId"
     WHERE w."vehicleId" = $1 AND w.status = 'ENTREGUE' AND i.status = 'EXECUTADO'
       AND w."deliveredAt" IS NOT NULL
       AND (s."intervalMonths" IS NOT NULL OR s."intervalKm" IS NOT NULL)
     ORDER BY s.id, w."deliveredAt" DESC`,
    [vehicleId],
  );
  return r.rows;
}

export interface DueRowForMessages extends LastServiceRow {
  vehicleId: string;
  vehicleMileage: number | null;
  vehicleLabel: string | null;
  customerName: string;
  customerPhone: string | null;
}

/** Para a central de mensagens: última execução de cada serviço com intervalo, por veículo ativo. */
export async function listLastServicesForMessages(): Promise<DueRowForMessages[]> {
  const r = await pool.query<DueRowForMessages>(
    `SELECT DISTINCT ON (v.id, s.id)
       v.id AS "vehicleId", v.mileage AS "vehicleMileage",
       NULLIF(TRIM(CONCAT(v.brand, ' ', v.model)), '') AS "vehicleLabel",
       c."legalName" AS "customerName",
       COALESCE(NULLIF(c.whatsapp, ''), NULLIF(c.phone, '')) AS "customerPhone",
       s.id AS "serviceId", s.name AS "serviceName", s."intervalMonths", s."intervalKm",
       w."deliveredAt" AS "lastAt", w."mileageAtEntry" AS "lastKm"
     FROM work_order_items i
     JOIN work_orders w ON w.id = i."workOrderId"
     JOIN services s ON s.id = i."serviceId"
     JOIN vehicles v ON v.id = w."vehicleId"
     JOIN customers c ON c.id = v."customerId"
     WHERE w.status = 'ENTREGUE' AND i.status = 'EXECUTADO' AND w."deliveredAt" IS NOT NULL
       AND v.status = 'ATIVO' AND c.status = 'ATIVO'
       AND (s."intervalMonths" IS NOT NULL OR s."intervalKm" IS NOT NULL)
     ORDER BY v.id, s.id, w."deliveredAt" DESC`,
  );
  return r.rows;
}
