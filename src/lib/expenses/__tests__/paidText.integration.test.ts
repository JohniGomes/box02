import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { correctPaidExpenseTextService, createExpenseService, markExpenseAsPaidService } from "../service";
import { ExpenseNotPaidForTextEditError } from "../errors";

let actorUserId: string;

async function cleanAll() {
  await pool.query(`TRUNCATE "expenses", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "pt@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("corrigir texto de despesa paga", () => {
  it("muda descrição e observação sem mexer em valor, data, forma e categoria", async () => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const e = await createExpenseService(actorUserId, {
      category: "FORNECEDORES",
      description: "Compra em GT Distribuidora: CORREIA POLY-V 6PK2130",
      amountReais: "149,00",
      dueDate: today,
    });
    const paid = await markExpenseAsPaidService(actorUserId, e.id, { paymentMethod: "PIX" });

    const fixed = await correctPaidExpenseTextService(actorUserId, e.id, {
      description: "Compra em GT Distribuidora: CORREIA POLY-V 6PK2120",
      notes: "Corrigido o código",
    });

    expect(fixed.description).toContain("6PK2120");
    expect(fixed.notes).toBe("Corrigido o código");
    expect(fixed.amountCents).toBe(14900);
    expect(fixed.category).toBe("FORNECEDORES");
    expect(fixed.paymentMethod).toBe("PIX");
    expect(new Date(fixed.paidAt!).getTime()).toBe(new Date(paid.paidAt!).getTime());
    expect(fixed.status).toBe("PAGA");

    const audit = await pool.query(`SELECT metadata FROM audit_logs WHERE action = 'EXPENSE_TEXT_CORRECTED' AND "entityId" = $1`, [e.id]);
    expect(audit.rows[0].metadata.previous.description).toContain("6PK2130");
  });

  it("recusa descrição vazia e despesa que ainda não foi paga", async () => {
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const open = await createExpenseService(actorUserId, { category: "OUTROS", amountReais: "10,00", dueDate: today });
    await expect(correctPaidExpenseTextService(actorUserId, open.id, { description: "x" })).rejects.toThrow(ExpenseNotPaidForTextEditError);

    const paid = await markExpenseAsPaidService(actorUserId, open.id, { paymentMethod: "DINHEIRO" });
    await expect(correctPaidExpenseTextService(actorUserId, paid.id, { description: "  " })).rejects.toThrow();
  });
});
