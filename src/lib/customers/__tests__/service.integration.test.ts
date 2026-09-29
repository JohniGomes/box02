import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import {
  createCustomerService,
  getCustomerService,
  inactivateCustomerService,
  reactivateCustomerService,
  searchCustomersService,
  updateCustomerService,
} from "../service";
import { DuplicateCustomerDocumentError, CustomerNotFoundError } from "../errors";

async function cleanDatabase() {
  await pool.query(
    'TRUNCATE "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE',
  );
}

let actorUserId: string;

beforeAll(async () => {
  await cleanDatabase();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query('TRUNCATE "customers" CASCADE');
});

afterAll(async () => {
  await cleanDatabase();
  await pool.end();
});

describe("createCustomerService", () => {
  it("cria cliente PF com dados válidos", async () => {
    const customer = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "João da Silva",
      document: "529.982.247-25",
      phone: "(62) 99448-2763",
    });

    expect(customer.type).toBe("PF");
    expect(customer.status).toBe("ATIVO");
    expect(customer.document).toBe("52998224725"); // normalizado
    expect(customer.phone).toBe("62994482763");
  });

  it("cria cliente PJ com dados válidos", async () => {
    const customer = await createCustomerService(actorUserId, {
      type: "PJ",
      legalName: "Auto Peças Anápolis LTDA",
      tradeName: "Auto Peças Anápolis",
      contactName: "Carlos Souza",
      document: "11.222.333/0001-81",
    });

    expect(customer.type).toBe("PJ");
    expect(customer.tradeName).toBe("Auto Peças Anápolis");
    expect(customer.contactName).toBe("Carlos Souza");
    expect(customer.document).toBe("11222333000181");
  });

  it("permite cadastrar sem documento", async () => {
    const customer = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente Sem Documento",
    });
    expect(customer.document).toBeNull();
  });

  it("rejeita CPF inválido", async () => {
    await expect(
      createCustomerService(actorUserId, {
        type: "PF",
        legalName: "Documento Ruim",
        document: "111.111.111-11",
      }),
    ).rejects.toThrow();
  });

  it("impede duplicidade de documento (mesmo CPF já cadastrado)", async () => {
    await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Primeiro Cliente",
      document: "529.982.247-25",
    });

    await expect(
      createCustomerService(actorUserId, {
        type: "PF",
        legalName: "Segundo Cliente (documento repetido)",
        document: "529.982.247-25",
      }),
    ).rejects.toThrow(DuplicateCustomerDocumentError);
  });

  it("permite dois clientes sem documento (não força unicidade quando ausente)", async () => {
    await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente A" });
    const b = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente B" });
    expect(b).toBeTruthy();
  });

  it("grava auditoria ao criar cliente", async () => {
    const customer = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente Auditado",
    });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'CUSTOMER_CREATED'`,
      [customer.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("updateCustomerService", () => {
  it("edita os dados de um cliente existente", async () => {
    const created = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Nome Original",
      phone: "(62) 99999-0000",
    });

    const updated = await updateCustomerService(actorUserId, created.id, {
      type: "PF",
      legalName: "Nome Corrigido",
      phone: "(62) 98888-1111",
    });

    expect(updated.legalName).toBe("Nome Corrigido");
    expect(updated.phone).toBe("62988881111");
  });

  it("lança erro ao editar cliente inexistente", async () => {
    await expect(
      updateCustomerService(actorUserId, "id-que-nao-existe", {
        type: "PF",
        legalName: "Qualquer",
      }),
    ).rejects.toThrow(CustomerNotFoundError);
  });

  it("impede alterar documento para um já usado por outro cliente", async () => {
    await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Dono do Documento",
      document: "529.982.247-25",
    });
    const other = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Outro Cliente",
    });

    await expect(
      updateCustomerService(actorUserId, other.id, {
        type: "PF",
        legalName: "Outro Cliente",
        document: "529.982.247-25",
      }),
    ).rejects.toThrow(DuplicateCustomerDocumentError);
  });

  it("grava auditoria ao editar cliente", async () => {
    const created = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Antes da Edição",
    });
    await updateCustomerService(actorUserId, created.id, {
      type: "PF",
      legalName: "Depois da Edição",
    });

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'CUSTOMER_UPDATED'`,
      [created.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("inativação preserva histórico", () => {
  it("inativa sem apagar o registro nem seus dados", async () => {
    const created = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente a Inativar",
      document: "529.982.247-25",
    });

    await inactivateCustomerService(actorUserId, created.id);

    const stillThere = await getCustomerService(created.id);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.status).toBe("INATIVO");
    expect(stillThere?.legalName).toBe("Cliente a Inativar");
    expect(stillThere?.document).toBe("52998224725");
  });

  it("reativa um cliente inativo", async () => {
    const created = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente a Reativar",
    });
    await inactivateCustomerService(actorUserId, created.id);

    const reactivated = await reactivateCustomerService(actorUserId, created.id);
    expect(reactivated.status).toBe("ATIVO");
  });

  it("grava auditoria ao inativar", async () => {
    const created = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente Auditoria Inativação",
    });
    await inactivateCustomerService(actorUserId, created.id);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'CUSTOMER_INACTIVATED'`,
      [created.id],
    );
    expect(logs.rowCount).toBe(1);
  });
});

describe("busca de clientes", () => {
  beforeEach(async () => {
    await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Maria Oliveira",
      phone: "(62) 99111-2222",
    });
    await createCustomerService(actorUserId, {
      type: "PJ",
      legalName: "Oficina Parceira LTDA",
      document: "11.222.333/0001-81",
    });
    const inactiveCustomer = await createCustomerService(actorUserId, {
      type: "PF",
      legalName: "Cliente Inativo Teste",
    });
    await inactivateCustomerService(actorUserId, inactiveCustomer.id);
  });

  it("encontra cliente por parte do nome", async () => {
    const result = await searchCustomersService({ query: "Maria" });
    expect(result.items.some((c) => c.legalName === "Maria Oliveira")).toBe(true);
  });

  it("encontra cliente por documento", async () => {
    const result = await searchCustomersService({ query: "11222333000181" });
    expect(result.items.some((c) => c.legalName === "Oficina Parceira LTDA")).toBe(true);
  });

  it("filtra por tipo PJ", async () => {
    const result = await searchCustomersService({ type: "PJ" });
    expect(result.items.every((c) => c.type === "PJ")).toBe(true);
  });

  it("por padrão (status ATIVO) não retorna clientes inativos", async () => {
    const result = await searchCustomersService({ status: "ATIVO" });
    expect(result.items.some((c) => c.legalName === "Cliente Inativo Teste")).toBe(false);
  });

  it("retorna clientes inativos quando filtrado explicitamente", async () => {
    const result = await searchCustomersService({ status: "INATIVO" });
    expect(result.items.some((c) => c.legalName === "Cliente Inativo Teste")).toBe(true);
  });
});
