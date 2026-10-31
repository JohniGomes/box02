import { randomBytes } from "node:crypto";
import { findVehicleById } from "@/lib/db/repositories/vehicles";
import { getVehiclePublicToken, setVehiclePublicToken } from "@/lib/db/repositories/vehicleQr";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { VehicleNotFoundError } from "./errors";

/** Código aleatório de 128 bits (22 letras/números): não dá para adivinhar nem deduzir da placa. */
export function newVehicleToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Gera o QR do veículo (ou troca o código: o link antigo deixa de funcionar). */
export async function generateVehicleQrService(actorUserId: string, vehicleId: string): Promise<string> {
  const vehicle = await findVehicleById(vehicleId);
  if (!vehicle) throw new VehicleNotFoundError(vehicleId);
  const hadToken = (await getVehiclePublicToken(vehicleId)) !== null;
  const token = newVehicleToken();
  await setVehiclePublicToken(vehicleId, token);
  await recordAuditLog({
    userId: actorUserId,
    action: hadToken ? "VEHICLE_QR_REGENERATED" : "VEHICLE_QR_GENERATED",
    entityType: "vehicle",
    entityId: vehicleId,
  });
  return token;
}

/** Desativa o QR: o link para de funcionar até gerar de novo. */
export async function revokeVehicleQrService(actorUserId: string, vehicleId: string): Promise<void> {
  const vehicle = await findVehicleById(vehicleId);
  if (!vehicle) throw new VehicleNotFoundError(vehicleId);
  await setVehiclePublicToken(vehicleId, null);
  await recordAuditLog({
    userId: actorUserId,
    action: "VEHICLE_QR_REVOKED",
    entityType: "vehicle",
    entityId: vehicleId,
  });
}

export async function getVehicleQrTokenService(vehicleId: string): Promise<string | null> {
  return getVehiclePublicToken(vehicleId);
}
