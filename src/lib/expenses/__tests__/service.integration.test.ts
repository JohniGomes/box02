import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import {
  createExpenseService,
  getExpenseService,
  listExpensesService,
  markExpenseAsPaidService,
  updateExpenseService,
} from "../service";
import { ExpenseAlreadyPaidError, ExpenseNotFoundError } from "../errors";

async function cleanDatabase() {
  await pool.query(
    'TRUNCATE "expenses", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
}

let actorUserId: string;

beforeAll(async () => {
  await cleanDatabase();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador Financeiro", email: "financeiro@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query('TRUNCATE "expenses" CASCADE');
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe("createExpenseService", () => {
  it("cria despesa com status PENDENTE quando o vencimento é futuro", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "ALUGUEL",
      description: "Aluguel do galpão — setembro",
      amountReais: "2500,00",
      dueDate: futureDate(10),
    });

    expect(expense.category).toBe("ALUGUEL");
    expect(expense.amountCents).toBe(250000);
    expect(expense.status).toBe("PENDENTE");
    expect(expense.paidAt).toBeNull();
  });

  it("rejeita valor zero ou negativo", async () => {
    await expect(
      createExpenseService(actorUserId, {
        category: "OUTROS",
        description: "Despesa inválida",
        amountReais: "0,00",
        dueDate: futureDate(5),
      }),
    ).rejects.toThrow();
  });

  it("permite fornecedor em texto livre, opcional", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "FORNECEDORES",
      description: "Compra de peças",
      supplierName: "Auto Peças Anápolis",
      amountReais: "890,50",
      dueDate: futureDate(15),
    });
    expect(expense.supplierName).toBe("Auto Peças Anápolis");

    const semFornecedor = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa sem fornecedor",
      amountReais: "100,00",
      dueDate: futureDate(15),
    });
    expect(semFornecedor.supplierName).toBeNull();
  });

  it("grava auditoria EXPENSE_CREATED", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "IMPOSTOS",
      description: "DAS Simples Nacional",
      amountReais: "350,00",
      dueDate: futureDate(20),
    });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'EXPENSE_CREATED'`,
      [expense.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("listExpensesService — derivação de status na leitura", () => {
  it("marca como ATRASADA uma despesa pendente com vencimento no passado", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDueDate = yesterday.toISOString().slice(0, 10);

    const expense = await createExpenseService(actorUserId, {
      category: "UTILIDADES",
      description: "Conta de energia — vencida",
      amountReais: "420,00",
      dueDate: pastDueDate,
    });

    const list = await listExpensesService();
    const found = list.find((e) => e.id === expense.id);
    expect(found?.status).toBe("ATRASADA");
  });

  it("marca como PENDENTE uma despesa com vencimento futuro", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "MARKETING",
      description: "Impulsionamento redes sociais",
      amountReais: "150,00",
      dueDate: futureDate(7),
    });

    const list = await listExpensesService();
    const found = list.find((e) => e.id === expense.id);
    expect(found?.status).toBe("PENDENTE");
  });

  it("marca como PAGA uma despesa já quitada, mesmo com vencimento no passado", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDueDate = yesterday.toISOString().slice(0, 10);

    const expense = await createExpenseService(actorUserId, {
      category: "SALARIOS",
      description: "Pró-labore — mecânico",
      amountReais: "1800,00",
      dueDate: pastDueDate,
    });
    await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "PIX" });

    const list = await listExpensesService();
    const found = list.find((e) => e.id === expense.id);
    expect(found?.status).toBe("PAGA");
  });
});

describe("updateExpenseService", () => {
  it("edita uma despesa enquanto ainda está pendente", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Descrição original",
      amountReais: "100,00",
      dueDate: futureDate(5),
    });

    const updated = await updateExpenseService(actorUserId, expense.id, {
      category: "MANUTENCAO_EQUIPAMENTOS",
      description: "Descrição corrigida",
      amountReais: "175,00",
      dueDate: futureDate(8),
    });

    expect(updated.description).toBe("Descrição corrigida");
    expect(updated.category).toBe("MANUTENCAO_EQUIPAMENTOS");
    expect(updated.amountCents).toBe(17500);
  });

  it("rejeita edição de despesa já paga", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa a pagar",
      amountReais: "50,00",
      dueDate: futureDate(3),
    });
    await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "DINHEIRO" });

    await expect(
      updateExpenseService(actorUserId, expense.id, {
        category: "OUTROS",
        description: "Tentando editar depois de paga",
        amountReais: "60,00",
        dueDate: futureDate(3),
      }),
    ).rejects.toThrow(ExpenseAlreadyPaidError);
  });

  it("lança erro ao editar despesa inexistente", async () => {
    await expect(
      updateExpenseService(actorUserId, "id-que-nao-existe", {
        category: "OUTROS",
        description: "Qualquer",
        amountReais: "10,00",
        dueDate: futureDate(1),
      }),
    ).rejects.toThrow(ExpenseNotFoundError);
  });

  it("grava auditoria EXPENSE_UPDATED", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Antes da edição",
      amountReais: "80,00",
      dueDate: futureDate(4),
    });
    await updateExpenseService(actorUserId, expense.id, {
      category: "OUTROS",
      description: "Depois da edição",
      amountReais: "90,00",
      dueDate: futureDate(4),
    });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'EXPENSE_UPDATED'`,
      [expense.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("markExpenseAsPaidService", () => {
  it("marca despesa como paga, gravando paidAt e forma de pagamento", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "FORNECEDORES",
      description: "Compra de óleo e filtros",
      amountReais: "620,00",
      dueDate: futureDate(2),
    });

    const paid = await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "CARTAO" });

    expect(paid.status).toBe("PAGA");
    expect(paid.paymentMethod).toBe("CARTAO");
    expect(paid.paidAt).not.toBeNull();
  });

  it("rejeita marcar como paga uma despesa que já está paga", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa dupla-pagamento",
      amountReais: "40,00",
      dueDate: futureDate(2),
    });
    await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "PIX" });

    await expect(
      markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "DINHEIRO" }),
    ).rejects.toThrow(ExpenseAlreadyPaidError);
  });

  it("lança erro ao pagar despesa inexistente", async () => {
    await expect(
      markExpenseAsPaidService(actorUserId, "id-que-nao-existe", { paymentMethod: "PIX" }),
    ).rejects.toThrow(ExpenseNotFoundError);
  });

  it("grava auditoria EXPENSE_PAID", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa auditada ao pagar",
      amountReais: "30,00",
      dueDate: futureDate(2),
    });
    await markExpenseAsPaidService(actorUserId, expense.id, { paymentMethod: "PIX" });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'EXPENSE_PAID'`,
      [expense.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("getExpenseService", () => {
  it("retorna null para despesa inexistente", async () => {
    const result = await getExpenseService("id-que-nao-existe");
    expect(result).toBeNull();
  });

  it("retorna a despesa com status derivado", async () => {
    const expense = await createExpenseService(actorUserId, {
      category: "OUTROS",
      description: "Despesa buscada por id",
      amountReais: "25,00",
      dueDate: futureDate(3),
    });

    const found = await getExpenseService(expense.id);
    expect(found?.id).toBe(expense.id);
    expect(found?.status).toBe("PENDENTE");
  });
});
