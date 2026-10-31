import { findVehicleByPublicToken, listPublicHistory, type PublicHistoryEntry, type PublicVehicle } from "@/lib/db/repositories/vehicleQr";
import { listLastServicesForVehicle } from "@/lib/db/repositories/serviceIntervals";
import { computeNextDue, type NextServiceDue } from "./nextService";

export interface PublicVehicleView {
  vehicle: PublicVehicle;
  history: PublicHistoryEntry[];
  /** Próximas trocas (só serviços com intervalo), a mais próxima primeiro. */
  due: NextServiceDue[];
}

/** O que a página pública do QR mostra. Nada de dados do cliente nem de valores. */
export async function getPublicVehicleViewService(token: string, now: Date = new Date()): Promise<PublicVehicleView | null> {
  const vehicle = await findVehicleByPublicToken(token);
  if (!vehicle) return null;
  const [history, lastServices] = await Promise.all([listPublicHistory(vehicle.id), listLastServicesForVehicle(vehicle.id)]);
  const due = lastServices
    .map((row) => computeNextDue(row, vehicle.mileage, now))
    .filter((d): d is NextServiceDue => d !== null)
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  return { vehicle, history, due };
}
