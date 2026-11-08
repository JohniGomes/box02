import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createQuoteService } from "@/lib/quotes/service";
import { createExecutorService, setExecutorStatusService } from "@/lib/executors/service";
import { InvalidExecutorUserError } from "../errors";
import { registerCompletedServiceFromQuoteService, RetroactiveServiceError } from "../retroactive";
import { getWorkOrderPaymentsSummaryService } from "../service";

let actorUserId: string;
let customerId: string;
let vehicleId: string;
let carlosId: string;
let mateusId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "executors", "work_order_payments", "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('work_order_number_seq', 'quote_number_seq')`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "cc@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  carlosId = (await createExecutorService(actorUserId, "Carlos Eduardo")).id;
  mateusId = (await createExecutorService(actorUserId, "Mateus Cintra")).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Cartão" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "CAR1D23", brand: "Fiat", model: "Palio" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function newQuote(label: string, price = "874,00") {
  return createQuoteService(actorUserId, {
    customerId,
    vehicleId,
    items: [{ type: "SERVICO", category: "NECESSARIO", description: label, quantity: 1, unitPriceReais: price }],
  });
}

function input(extra: Record<string, unknown> = {}) {
  return {
    serviceDate: "2026-11-07",
    executedBy: `executor:${carlosId}`,
    deliveryAcceptedName: "Cliente Cartão",
    payments: [],
    ...extra,
  };
}

async function paymentsOf(workOrderId: string) {
  const r = await pool.query(
    `SELECT "amountCents", method, "cardFeeCents", installments FROM work_order_payments WHERE "workOrderId" = $1 ORDER BY "createdAt" ASC`,
    [workOrderId],
  );
  return r.rows;
}

describe("Serviço concluído e pago — cartão com taxa e parcelas", () => {
  it("cartão em 10x com taxa repassada grava a taxa e as parcelas e quita a OS", async () => {
    const quote = await newQuote("Serviço cartão 10x");
    const result = await registerCompletedServiceFromQuoteService(
      actorUserId,
      quote.quote.id,
      input({ payments: [{ method: "CARTAO", amountReais: "874,00", cardFeeReais: "64,07", installments: "10" }] }),
    );
    expect(await paymentsOf(result.workOrderId)).toEqual([{ amountCents: 87400, method: "CARTAO", cardFeeCents: 6407, installments: 10 }]);
    const summary = await getWorkOrderPaymentsSummaryService(result.workOrderId);
    expect(summary).toMatchObject({ paidCents: 87400, remainingCents: 0, status: "QUITADO" });
  });

  it("cartão sem taxa informada: taxa fica em branco e as parcelas valem", async () => {
    const quote = await newQuote("Serviço cartão sem taxa");
    const result = await registerCompletedServiceFromQuoteService(
      actorUserId,
      quote.quote.id,
      input({ payments: [{ method: "CARTAO", amountReais: "874,00", installments: "10" }] }),
    );
    expect(await paymentsOf(result.workOrderId)).toEqual([{ amountCents: 87400, method: "CARTAO", cardFeeCents: null, installments: 10 }]);
  });

  it("taxa ou parcelas em outra forma de pagamento são recusadas antes de criar a OS", async () => {
    const quote = await newQuote("Serviço pix com taxa");
    const before = (await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders`)).rows[0].n;
    await expect(
      registerCompletedServiceFromQuoteService(
        actorUserId,
        quote.quote.id,
        input({ payments: [{ method: "PIX", amountReais: "874,00", installments: "3" }] }),
      ),
    ).rejects.toThrow(RetroactiveServiceError);
    expect((await pool.query(`SELECT COUNT(*)::int AS n FROM work_orders`)).rows[0].n).toBe(before);
  });

  it("parcelas fora de 1 a 24 são recusadas", async () => {
    const quote = await newQuote("Serviço parcelas inválidas");
    await expect(
      registerCompletedServiceFromQuoteService(
        actorUserId,
        quote.quote.id,
        input({ payments: [{ method: "CARTAO", amountReais: "874,00", installments: "30" }] }),
      ),
    ).rejects.toThrow(RetroactiveServiceError);
  });

  it("pagamento parcial: o que falta fica em aberto", async () => {
    const quote = await newQuote("Serviço parcial");
    const result = await registerCompletedServiceFromQuoteService(
      actorUserId,
      quote.quote.id,
      input({ payments: [{ method: "PIX", amountReais: "500,00" }] }),
    );
    const summary = await getWorkOrderPaymentsSummaryService(result.workOrderId);
    expect(summary).toMatchObject({ paidCents: 50000, remainingCents: 37400, status: "PARCIALMENTE_PAGO" });
  });

  it("pagamento a mais que o total continua recusado", async () => {
    const quote = await newQuote("Serviço a mais");
    await expect(
      registerCompletedServiceFromQuoteService(
        actorUserId,
        quote.quote.id,
        input({ payments: [{ method: "PIX", amountReais: "900,00" }] }),
      ),
    ).rejects.toThrow(RetroactiveServiceError);
  });
});

describe("Serviço concluído e pago — mais de um executor", () => {
  it("dois executores viram um nome só nos itens executados", async () => {
    const quote = await newQuote("Serviço dois executores");
    const result = await registerCompletedServiceFromQuoteService(
      actorUserId,
      quote.quote.id,
      input({ executedBy: `executor:${carlosId},executor:${mateusId}`, payments: [{ method: "PIX", amountReais: "874,00" }] }),
    );
    const items = await pool.query(`SELECT "executedByName" FROM work_order_items WHERE "workOrderId" = $1`, [result.workOrderId]);
    expect(items.rows.every((r) => r.executedByName === "Carlos Eduardo e Mateus Cintra")).toBe(true);
  });

  it("um executor inativo no meio da lista é recusado antes de criar a OS", async () => {
    await setExecutorStatusService(actorUserId, mateusId, "INATIVO");
    const quote = await newQuote("Serviço executor inativo");
    await expect(
      registerCompletedServiceFromQuoteService(
        actorUserId,
        quote.quote.id,
        input({ executedBy: `executor:${carlosId},executor:${mateusId}` }),
      ),
    ).rejects.toThrow(InvalidExecutorUserError);
    await setExecutorStatusService(actorUserId, mateusId, "ATIVO");
  });
});
