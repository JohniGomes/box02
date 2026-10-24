import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  cancelQuoteVersionService,
  createQuoteService,
  getQuoteCancellationImpactService,
  getQuoteCancellationInfoService,
  getQuoteService,
  registerInternalQuoteDecisionService,
} from "../service";
import { createWorkOrderFromQuoteService } from "@/lib/workOrders/service";
import { InvalidQuoteTransitionError } from "../errors";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_items", "work_orders", "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'quote_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ca@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente CA" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CAA1B23" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

const items = [{ type: "SERVICO" as const, category: "NECESSARIO" as const, description: "Revisão", quantity: 1, unitPriceReais: "100,00" }];

async function approvedQuote() {
  const q = await createQuoteService(actorUserId, { customerId, vehicleId, items });
  const full = await getQuoteService(q.quote.id);
  await registerInternalQuoteDecisionService(actorUserId, q.quote.id, {
    itemDecisions: full!.items.map((i) => ({ itemId: i.id, decision: "APROVADO" as const })),
    approverName: "Cliente CA",
  });
  return q.quote.id;
}

describe("cancelar orçamento aprovado", () => {
  it("exige motivo, cancela e guarda quem/porquê", async () => {
    const id = await approvedQuote();
    await expect(cancelQuoteVersionService(actorUserId, id)).rejects.toThrow(InvalidQuoteTransitionError);

    const v = await cancelQuoteVersionService(actorUserId, id, { reason: "Cliente desistiu" });
    expect(v.status).toBe("CANCELADO");

    const info = await getQuoteCancellationInfoService(v.id);
    expect(info).toMatchObject({ by: "Testador", reason: "Cliente desistiu" });
  });

  it("com OS ligada, mostra o impacto e não mexe na OS", async () => {
    const id = await approvedQuote();
    const os = await createWorkOrderFromQuoteService(actorUserId, id, {});

    const impact = await getQuoteCancellationImpactService(id);
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({ number: os.workOrder.number, paidCents: 0, executedItems: 0 });

    await cancelQuoteVersionService(actorUserId, id, { reason: "Erro de lançamento" });
    const row = (await pool.query(`SELECT status FROM work_orders WHERE id = $1`, [os.workOrder.id])).rows[0];
    expect(row.status).toBe(os.workOrder.status);
  });
});
