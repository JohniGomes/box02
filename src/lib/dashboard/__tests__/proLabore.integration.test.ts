import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createExpenseService, markExpenseAsPaidService } from "@/lib/expenses/service";
import { getDashboardMetrics } from "@/lib/db/repositories/dashboardMetrics";

let actorUserId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "expenses", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "pl@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("resultado do mês antes e depois do pró-labore (Etapa 4.6)", () => {
  it("separa o pró-labore pago e não muda o resultado do mês", async () => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const before = await getDashboardMetrics();

    const prolabore = await createExpenseService(actorUserId, { category: "SALARIOS", amountReais: "1000,00", dueDate: today });
    await markExpenseAsPaidService(actorUserId, prolabore.id, { paymentMethod: "PIX" });
    const luz = await createExpenseService(actorUserId, { category: "UTILIDADES", amountReais: "200,00", dueDate: today });
    await markExpenseAsPaidService(actorUserId, luz.id, { paymentMethod: "PIX" });
    // pró-labore ainda não pago não conta
    await createExpenseService(actorUserId, { category: "SALARIOS", amountReais: "500,00", dueDate: today });

    const after = await getDashboardMetrics();
    expect(after.proLaboreCents - before.proLaboreCents).toBe(100000);
    expect(after.monthlyExpensesCents - before.monthlyExpensesCents).toBe(120000);
    expect(after.netResultCents - before.netResultCents).toBe(-120000);
    expect(after.resultBeforeProLaboreCents - before.resultBeforeProLaboreCents).toBe(-20000);
  });
});
