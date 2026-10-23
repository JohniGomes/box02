import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createQuoteService,
  getQuoteService,
  registerInternalQuoteDecisionService,
  updateQuoteCheckInService,
} from "../service";
import { createWorkOrderFromQuoteService } from "@/lib/workOrders/service";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_items", "work_orders", "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'quote_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ck@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente CK" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CKA1B23", brand: "Fiat", model: "Palio", mileage: 90000 })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function approve(quoteId: string) {
  const full = await getQuoteService(quoteId);
  await registerInternalQuoteDecisionService(actorUserId, quoteId, {
    itemDecisions: full!.items.filter((i) => i.category !== "INFORMATIVO").map((i) => ({ itemId: i.id, decision: "APROVADO" as const })),
    approverName: "Cliente CK",
  });
}

const items = [{ type: "SERVICO" as const, category: "NECESSARIO" as const, description: "Revisão", quantity: 1, unitPriceReais: "100,00" }];

describe("queixa e KM no orçamento", () => {
  it("grava ao criar e passam sozinhos para a OS (sem digitar de novo)", async () => {
    const quote = await createQuoteService(actorUserId, { customerId, vehicleId, items, customerComplaint: "Barulho na frente", mileageAtEntry: "98000" });
    expect(quote.quote.customerComplaint).toBe("Barulho na frente");
    expect(quote.quote.mileageAtEntry).toBe(98000);

    await approve(quote.quote.id);
    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, {});
    expect(os.workOrder.customerComplaint).toBe("Barulho na frente");
    expect(os.workOrder.mileageAtEntry).toBe(98000);

    // o KM maior atualiza o veículo, sem apagar placa/marca/modelo
    const v = await pool.query(`SELECT plate, brand, model, mileage FROM vehicles WHERE id = $1`, [vehicleId]);
    expect(v.rows[0]).toMatchObject({ plate: "CKA1B23", brand: "Fiat", model: "Palio", mileage: 98000 });
  });

  it("o que for digitado ao criar a OS vale mais que o do orçamento", async () => {
    const quote = await createQuoteService(actorUserId, { customerId, vehicleId, items, customerComplaint: "Antiga", mileageAtEntry: "99000" });
    await approve(quote.quote.id);
    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { customerComplaint: "Nova queixa", mileageAtEntry: "99500" });
    expect(os.workOrder.customerComplaint).toBe("Nova queixa");
    expect(os.workOrder.mileageAtEntry).toBe(99500);
  });

  it("corrige queixa e KM do orçamento depois de criado", async () => {
    const quote = await createQuoteService(actorUserId, { customerId, vehicleId, items });
    expect(quote.quote.customerComplaint).toBeNull();
    const fixed = await updateQuoteCheckInService(actorUserId, quote.quote.id, { customerComplaint: "Luz acesa", mileageAtEntry: "101000" });
    expect(fixed.customerComplaint).toBe("Luz acesa");
    expect(fixed.mileageAtEntry).toBe(101000);
  });

  it("sem queixa nem KM em lugar nenhum, a OS continua nascendo vazia (como antes)", async () => {
    const quote = await createQuoteService(actorUserId, { customerId, vehicleId, items });
    await approve(quote.quote.id);
    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, {});
    expect(os.workOrder.customerComplaint).toBeNull();
    expect(os.workOrder.mileageAtEntry).toBeNull();
  });
});
