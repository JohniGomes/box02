import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { setRemindersConsent } from "@/lib/db/repositories/customers";
import { createVehicleService } from "@/lib/vehicles/service";
import { createServiceService, updateServiceService } from "@/lib/services/service";
import { listLastServicesForVehicle } from "@/lib/db/repositories/serviceIntervals";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { acceptReceptionForTest } from "@/lib/workOrders/__tests__/acceptHelper";
import { getMessageCenterService, markMessageService } from "@/lib/messages/service";
import { addMonths, computeNextDue, type LastServiceRow } from "../nextService";

describe("cálculo da próxima troca", () => {
  const base: LastServiceRow = {
    serviceId: "s1",
    serviceName: "Troca de óleo",
    intervalMonths: 6,
    intervalKm: 10000,
    lastAt: new Date("2026-01-31T12:00:00.000Z"),
    lastKm: 50000,
  };

  it("soma meses sem estourar o fim do mês", () => {
    expect(addMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("sem intervalo ou só KM sem a KM da última OS: não calcula", () => {
    expect(computeNextDue({ ...base, intervalMonths: null, intervalKm: null }, 50000)).toBeNull();
    expect(computeNextDue({ ...base, intervalMonths: null, lastKm: null }, 50000)).toBeNull();
  });

  it("vale o que vencer primeiro: data ou KM", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    expect(computeNextDue(base, 52000, now)!.status).toBe("EM_DIA");
    expect(computeNextDue(base, 60000, now)!.status).toBe("VENCIDA"); // KM estourou antes da data
    expect(computeNextDue(base, 52000, new Date("2026-07-31T12:00:00.000Z"))!.status).toBe("VENCIDA"); // data passou
    expect(computeNextDue(base, 52000, new Date("2026-07-15T12:00:00.000Z"))!.status).toBe("PROXIMA"); // faltam <30 dias
    expect(computeNextDue(base, 59500, now)!.status).toBe("PROXIMA"); // faltam 500 km
  });

  it("sem KM atual do veículo, decide só pela data", () => {
    expect(computeNextDue(base, null, new Date("2026-03-01T12:00:00.000Z"))!.status).toBe("EM_DIA");
  });
});

let actorUserId: string;
let customerId: string;
let vehicleId: string;
let oilId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "message_log", "work_order_closures", "work_order_items", "work_orders", "services", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

async function deliver(km: number, serviceId: string) {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: km,
    items: [{ type: "SERVICO", description: "Troca de óleo", quantity: 1, unitPriceReais: "150,00", serviceId }],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, {
    receptionAcceptedName: "Ana",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
  await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Ana" });
  return os.workOrder.id;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ni@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Ana Souza", phone: "62999997777", whatsapp: "62999997777" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "NXT1A23", brand: "Fiat", model: "Uno", mileage: 80000 })).id;
  oilId = (await createServiceService(actorUserId, { name: "Troca de óleo", defaultPriceReais: "150,00", intervalMonths: "6", intervalKm: "10.000" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("intervalo no serviço e lembrete de troca", () => {
  it("guarda o intervalo (aceita 10.000) e deixa limpar", async () => {
    const rows = await pool.query(`SELECT "intervalMonths", "intervalKm" FROM services WHERE id = $1`, [oilId]);
    expect(rows.rows[0]).toEqual({ intervalMonths: 6, intervalKm: 10000 });
    await updateServiceService(actorUserId, oilId, { name: "Troca de óleo", defaultPriceReais: "150,00", intervalMonths: "", intervalKm: "10000" });
    const after = await pool.query(`SELECT "intervalMonths", "intervalKm" FROM services WHERE id = $1`, [oilId]);
    expect(after.rows[0]).toEqual({ intervalMonths: null, intervalKm: 10000 });
    await updateServiceService(actorUserId, oilId, { name: "Troca de óleo", defaultPriceReais: "150,00", intervalMonths: "6", intervalKm: "10000" });
  });

  it("só conta OS entregue com item executado e sugere uma mensagem por ciclo", async () => {
    expect(await listLastServicesForVehicle(vehicleId)).toHaveLength(0);
    await deliver(70000, oilId);

    const last = await listLastServicesForVehicle(vehicleId);
    expect(last).toHaveLength(1);
    expect(last[0]).toMatchObject({ serviceName: "Troca de óleo", lastKm: 70000 });

    // Sem permissão do cliente: não sugere a troca, sugere pedir a permissão.
    const semPermissao = await getMessageCenterService();
    expect(semPermissao.trocas).toHaveLength(0);
    expect(semPermissao.permissions.map((m) => m.refId)).toEqual([customerId]);

    // Quem não quer receber não aparece em nada.
    await setRemindersConsent(customerId, "NAO");
    const recusou = await getMessageCenterService();
    expect(recusou.trocas).toHaveLength(0);
    expect(recusou.permissions).toHaveLength(0);

    // veículo está com 80.000 km: vence em 80.000 km -> vencida pelo KM
    await setRemindersConsent(customerId, "SIM");
    const center = await getMessageCenterService();
    expect(center.permissions).toHaveLength(0);
    expect(center.trocas).toHaveLength(1);
    expect(center.trocas[0].text).toContain("Olá, Ana!");
    expect(center.trocas[0].text).toContain("troca de óleo");
    expect(center.trocas[0].whatsappUrl).toContain("https://wa.me/5562999997777?text=");

    await markMessageService(actorUserId, { kind: "TROCA", refId: center.trocas[0].refId, action: "ENVIADA" });
    expect((await getMessageCenterService()).trocas).toHaveLength(0);
  });

  it("serviço sem intervalo não gera lembrete", async () => {
    const plain = (await createServiceService(actorUserId, { name: "Alinhamento", defaultPriceReais: "80,00" })).id;
    await deliver(81000, plain);
    const center = await getMessageCenterService();
    expect(center.trocas).toHaveLength(0);
  });
});
