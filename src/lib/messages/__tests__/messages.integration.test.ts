import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { setRemindersConsent } from "@/lib/db/repositories/customers";
import { createVehicleService } from "@/lib/vehicles/service";
import { createAppointmentService } from "@/lib/appointments/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  registerWorkOrderPaymentsService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { acceptReceptionForTest } from "@/lib/workOrders/__tests__/acceptHelper";
import { getMessageCenterService, markMessageService, setGoogleReviewLink } from "../service";
import { confirmationMessage, firstName } from "../templates";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "message_log", "appointments", "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('google_review_link', 'work_order_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ms@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Maria da Silva", phone: "62999998888", whatsapp: "62999998888" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "MSG1A23", brand: "Fiat", model: "Celta" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("textos", () => {
  it("usa o primeiro nome e a hora como digitada", () => {
    expect(firstName("Maria da Silva")).toBe("Maria");
    const msg = confirmationMessage({
      customerName: "Maria da Silva",
      scheduledAt: new Date("2026-11-02T09:30:00.000Z"),
      vehicleDescription: "Fiat Celta",
      description: "Freios",
    });
    expect(msg).toContain("Olá, Maria!");
    expect(msg).toContain("segunda-feira, 02/11, às 09:30");
    expect(msg).toContain("Fiat Celta");
  });
});

describe("central de mensagens", () => {
  it("lembra agendamentos de hoje/amanhã, confirma os futuros e some depois de marcar", async () => {
    const now = new Date();
    const todayBr = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const tomorrowBr = new Date(now.getTime() + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const later = new Date(`${todayBr}T00:00:00.000Z`).getTime() + 10 * 86400000;
    const laterStr = new Date(later).toISOString().slice(0, 10);

    const hoje = await createAppointmentService(actorUserId, { customerId, vehicleId, scheduledAt: `${todayBr}T15:00`, description: "Freios" });
    const amanha = await createAppointmentService(actorUserId, { customerId, scheduledAt: `${tomorrowBr}T09:00` });
    const longe = await createAppointmentService(actorUserId, { customerId, scheduledAt: `${laterStr}T09:00` });

    let center = await getMessageCenterService(now);
    expect(center.reminders.map((m) => m.refId).sort()).toEqual([hoje.id, amanha.id].sort());
    expect(center.confirmations.map((m) => m.refId).sort()).toEqual([hoje.id, amanha.id, longe.id].sort());
    expect(center.reminders.find((m) => m.refId === hoje.id)!.whatsappUrl).toContain("https://wa.me/5562999998888?text=");

    await markMessageService(actorUserId, { kind: "LEMBRETE", refId: hoje.id, action: "ENVIADA" });
    await markMessageService(actorUserId, { kind: "CONFIRMACAO", refId: longe.id, action: "PULADA" });
    center = await getMessageCenterService(now);
    expect(center.reminders.map((m) => m.refId)).toEqual([amanha.id]);
    expect(center.confirmations.map((m) => m.refId).sort()).toEqual([hoje.id, amanha.id].sort());
  });

  it("avaliação só com o link cadastrado e saldo só depois de 2 dias", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Revisão", quantity: 1, unitPriceReais: "200,00" }],
    });
    await acceptReceptionForTest(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Maria",
      receptionAwareness1: true,
      receptionAwareness2: true,
      receptionAwareness3: true,
    });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Maria" });
    await registerWorkOrderPaymentsService(actorUserId, os.workOrder.id, { payments: [{ amountReais: "150,00", method: "PIX" }] });

    let center = await getMessageCenterService();
    expect(center.reviewLinkConfigured).toBe(false);
    expect(center.reviews).toHaveLength(0);
    expect(center.balances).toHaveLength(0); // entregue agora: ainda não cobra

    await setGoogleReviewLink("https://g.page/r/teste");

    // Cliente ainda não perguntado: não recebe pedido de avaliação, aparece o pedido de permissão.
    center = await getMessageCenterService();
    expect(center.reviews).toHaveLength(0);
    expect(center.permissions.map((m) => m.refId)).toEqual([customerId]);
    expect(center.permissions[0].state).toBe("PEDIR");
    expect(center.permissions[0].text).toContain("Posso te avisar");
    expect(center.permissions[0].whatsappUrl).toContain("https://wa.me/5562999998888?text=");

    // "Já pedi" → aguardando resposta; "Agora não" → some.
    await markMessageService(actorUserId, { kind: "PERMISSAO", refId: customerId, action: "ENVIADA" });
    center = await getMessageCenterService();
    expect(center.permissions.map((m) => m.state)).toEqual(["AGUARDANDO"]);
    await markMessageService(actorUserId, { kind: "PERMISSAO", refId: customerId, action: "PULADA" });
    expect((await getMessageCenterService()).permissions).toHaveLength(0);

    // Quem não quer nunca aparece; quem autorizou passa a receber o pedido de avaliação.
    await setRemindersConsent(customerId, "NAO");
    center = await getMessageCenterService();
    expect(center.reviews).toHaveLength(0);
    expect(center.permissions).toHaveLength(0);

    await setRemindersConsent(customerId, "SIM");
    center = await getMessageCenterService();
    expect(center.permissions).toHaveLength(0);
    expect(center.reviews.map((m) => m.refId)).toEqual([os.workOrder.id]);
    expect(center.reviews[0].text).toContain("https://g.page/r/teste");

    const inThreeDays = new Date(Date.now() + 3 * 86400000);
    center = await getMessageCenterService(inThreeDays);
    expect(center.balances.map((m) => m.refId)).toEqual([os.workOrder.id]);
    expect(center.balances[0].context).toContain("50,00");

    await markMessageService(actorUserId, { kind: "COBRANCA", refId: os.workOrder.id, action: "ENVIADA" });
    expect((await getMessageCenterService(inThreeDays)).balances).toHaveLength(0);
  });

  it("recusa link de avaliação sem http", async () => {
    await expect(setGoogleReviewLink("g.page/r/teste")).rejects.toThrow(/http/);
  });
});
