import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createServiceService } from "@/lib/services/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { acceptReceptionForTest } from "@/lib/workOrders/__tests__/acceptHelper";
import { setShopWhatsapp, getShopWhatsapp } from "@/lib/settings/service";
import { generateVehicleQrService, getVehicleQrTokenService, newVehicleToken, revokeVehicleQrService } from "../qr";
import { getPublicVehicleViewService } from "../qrPublic";

let actorUserId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "services", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('shop_whatsapp', 'work_order_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "qr@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  const customerId = (
    await createCustomerService(actorUserId, { type: "PF", legalName: "Dona Secreta da Silva", document: "529.982.247-25", phone: "62999990000" })
  ).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "QRC1A23", brand: "Honda", model: "HR-V", yearModel: 2017, color: "Prata" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("QR Car", () => {
  it("o código é aleatório e longo, e o veículo nasce sem QR", async () => {
    const a = newVehicleToken();
    const b = newVehicleToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await getVehicleQrTokenService(vehicleId)).toBeNull();
    expect(await getPublicVehicleViewService("qualquer-coisa")).toBeNull();
    expect(await getPublicVehicleViewService("")).toBeNull();
  });

  it("gera o QR; a página pública mostra o carro e o histórico, sem dados do cliente nem valores", async () => {
    const token = await generateVehicleQrService(actorUserId, vehicleId);
    expect(await getVehicleQrTokenService(vehicleId)).toBe(token);

    const oil = (await createServiceService(actorUserId, { name: "Troca de óleo", defaultPriceReais: "150,00", intervalMonths: 6 })).id;
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId: (await pool.query<{ customerId: string }>(`SELECT "customerId" FROM vehicles WHERE id = $1`, [vehicleId])).rows[0].customerId,
      vehicleId,
      mileageAtEntry: 70000,
      items: [{ type: "SERVICO", description: "Troca de óleo", quantity: 1, unitPriceReais: "150,00", serviceId: oil }],
    });
    await acceptReceptionForTest(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente",
      receptionAwareness1: true,
      receptionAwareness2: true,
      receptionAwareness3: true,
    });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });

    const view = await getPublicVehicleViewService(token);
    expect(view?.vehicle).toMatchObject({ brand: "Honda", model: "HR-V", color: "Prata" });
    expect(view?.history).toHaveLength(1);
    expect(view?.history[0].items).toEqual(["Troca de óleo"]);
    expect(view?.history[0].mileageAtEntry).toBe(70000);
    expect(view?.due.map((d) => d.serviceName)).toEqual(["Troca de óleo"]);

    // Privacidade: nada do cliente nem dinheiro no que a página recebe.
    const json = JSON.stringify(view);
    for (const secret of ["Dona Secreta", "52998224725", "529.982.247-25", "62999990000", "customerId", "totalCents", "unitPrice", "15000"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("gerar de novo troca o código e o antigo para de funcionar; desativar também", async () => {
    const old = (await getVehicleQrTokenService(vehicleId))!;
    const fresh = await generateVehicleQrService(actorUserId, vehicleId);
    expect(fresh).not.toBe(old);
    expect(await getPublicVehicleViewService(old)).toBeNull();
    expect(await getPublicVehicleViewService(fresh)).not.toBeNull();

    await revokeVehicleQrService(actorUserId, vehicleId);
    expect(await getVehicleQrTokenService(vehicleId)).toBeNull();
    expect(await getPublicVehicleViewService(fresh)).toBeNull();
  });

  it("editar o veículo não apaga o QR", async () => {
    const token = await generateVehicleQrService(actorUserId, vehicleId);
    await pool.query(`UPDATE vehicles SET color = 'Preta' WHERE id = $1`, [vehicleId]);
    expect(await getVehicleQrTokenService(vehicleId)).toBe(token);
  });

  it("WhatsApp da oficina: guarda só dígitos, valida e apaga", async () => {
    expect(await getShopWhatsapp()).toBeNull();
    await setShopWhatsapp("(62) 99999-0000");
    expect(await getShopWhatsapp()).toBe("62999990000");
    await expect(setShopWhatsapp("123")).rejects.toThrow(/DDD/);
    await setShopWhatsapp("");
    expect(await getShopWhatsapp()).toBeNull();
  });
});
