import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createQuoteService } from "@/lib/quotes/service";
import { registerCompletedServiceFromQuoteService, RetroactiveServiceError } from "../retroactive";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'quote_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "rd@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Data" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "DAT1A11", brand: "Fiat", model: "Palio" })).id;
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanAll();
  await pool.end();
});

async function newQuote(label: string) {
  return createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: label, quantity: 1, unitPriceReais: "100,00" }],
  });
}

function input(serviceDate: string, extra: Record<string, unknown> = {}) {
  return {
    serviceDate,
    executedBy: actorUserId,
    deliveryAcceptedName: "Cliente Data",
    payments: [{ method: "PIX", amountReais: "100,00" }],
    ...extra,
  };
}

// 24/10/2026 11:30 em Brasília = 14:30 UTC (antes do meio-dia, o caso que falhava)
const NOW = new Date("2026-10-24T14:30:00Z");

describe("Registrar serviço concluído — data e hora", () => {
  it("data de HOJE antes do meio-dia grava com a hora atual, sem erro", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const quote = await newQuote("Serviço hoje");
    const result = await registerCompletedServiceFromQuoteService(actorUserId, quote.quote.id, input("2026-10-24"));
    const row = await pool.query(`SELECT "entryAt", "deliveredAt" FROM work_orders WHERE id = $1`, [result.workOrderId]);
    expect(new Date(row.rows[0].deliveredAt).getTime()).toBe(NOW.getTime());
    expect(new Date(row.rows[0].entryAt).getTime()).toBe(NOW.getTime());
  });

  it("dia anterior grava 12:00 de Brasília", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const quote = await newQuote("Serviço ontem");
    const result = await registerCompletedServiceFromQuoteService(actorUserId, quote.quote.id, input("2026-10-23"));
    const row = await pool.query(`SELECT "deliveredAt" FROM work_orders WHERE id = $1`, [result.workOrderId]);
    expect(new Date(row.rows[0].deliveredAt).getTime()).toBe(new Date("2026-10-23T15:00:00Z").getTime());
  });

  it("horário informado vale; horário no futuro é recusado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const quote = await newQuote("Serviço com hora");
    const result = await registerCompletedServiceFromQuoteService(actorUserId, quote.quote.id, input("2026-10-24", { serviceTime: "09:15" }));
    const row = await pool.query(`SELECT "deliveredAt" FROM work_orders WHERE id = $1`, [result.workOrderId]);
    expect(new Date(row.rows[0].deliveredAt).getTime()).toBe(new Date("2026-10-24T12:15:00Z").getTime());

    const quote2 = await newQuote("Serviço hora futura");
    await expect(
      registerCompletedServiceFromQuoteService(actorUserId, quote2.quote.id, input("2026-10-24", { serviceTime: "13:00" })),
    ).rejects.toThrow(RetroactiveServiceError);
  });

  it("dia depois de hoje continua sendo recusado", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const quote = await newQuote("Serviço amanhã");
    await expect(
      registerCompletedServiceFromQuoteService(actorUserId, quote.quote.id, input("2026-10-25")),
    ).rejects.toThrow(/não pode ser no futuro/);
  });
});
