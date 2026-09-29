import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import {
  createServiceService,
  getServiceService,
  inactivateServiceService,
  listActiveServicesService,
  reactivateServiceService,
  searchServicesService,
  updateServiceService,
} from "../service";
import { ServiceNotFoundError } from "../errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "services", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

let actorUserId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(`TRUNCATE "services" CASCADE`);
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("criação de serviço", () => {
  it("cria com nome, categoria e preço padrão", async () => {
    const service = await createServiceService(actorUserId, {
      name: "Alinhamento",
      category: "Suspensão",
      defaultPriceReais: "120,00",
    });
    expect(service.name).toBe("Alinhamento");
    expect(service.category).toBe("Suspensão");
    expect(service.defaultPriceCents).toBe(12000);
    expect(service.status).toBe("ATIVO");
  });

  it("cria sem categoria e sem preço padrão (ambos opcionais)", async () => {
    const service = await createServiceService(actorUserId, { name: "Diagnóstico eletrônico" });
    expect(service.category).toBeNull();
    expect(service.defaultPriceCents).toBeNull();
  });

  it("rejeita nome vazio", async () => {
    await expect(createServiceService(actorUserId, { name: "" })).rejects.toThrow();
  });

  it("grava auditoria de criação", async () => {
    const service = await createServiceService(actorUserId, { name: "Balanceamento" });
    const logs = await pool.query(`SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'SERVICE_CREATED'`, [
      service.id,
    ]);
    expect(logs.rowCount).toBe(1);
  });
});

describe("edição de serviço", () => {
  it("atualiza nome/categoria/preço", async () => {
    const service = await createServiceService(actorUserId, { name: "Troca de óleo", defaultPriceReais: "80,00" });
    const updated = await updateServiceService(actorUserId, service.id, {
      name: "Troca de óleo sintético",
      category: "Motor",
      defaultPriceReais: "95,00",
    });
    expect(updated.name).toBe("Troca de óleo sintético");
    expect(updated.category).toBe("Motor");
    expect(updated.defaultPriceCents).toBe(9500);
  });

  it("rejeita editar serviço inexistente", async () => {
    await expect(updateServiceService(actorUserId, "id-que-nao-existe", { name: "X" })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });
});

describe("inativação e reativação — nunca apaga fisicamente", () => {
  it("inativa sem remover a linha do banco", async () => {
    const service = await createServiceService(actorUserId, { name: "Revisão de suspensão" });
    await inactivateServiceService(actorUserId, service.id);

    const row = await pool.query(`SELECT status FROM services WHERE id = $1`, [service.id]);
    expect(row.rowCount).toBe(1); // continua existindo
    expect(row.rows[0].status).toBe("INATIVO");
  });

  it("reativação restaura a MESMA linha, sem criar um serviço novo", async () => {
    const service = await createServiceService(actorUserId, { name: "Troca de amortecedores" });
    await inactivateServiceService(actorUserId, service.id);
    const reactivated = await reactivateServiceService(actorUserId, service.id);

    expect(reactivated.id).toBe(service.id); // mesma linha, mesmo id
    expect(reactivated.status).toBe("ATIVO");

    const countByName = await pool.query(`SELECT count(*) FROM services WHERE name = $1`, ["Troca de amortecedores"]);
    expect(Number(countByName.rows[0].count)).toBe(1); // nunca duplicou
  });

  it("grava auditoria de inativação e reativação", async () => {
    const service = await createServiceService(actorUserId, { name: "Troca de bateria" });
    await inactivateServiceService(actorUserId, service.id);
    await reactivateServiceService(actorUserId, service.id);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action IN ('SERVICE_INACTIVATED', 'SERVICE_REACTIVATED') ORDER BY "createdAt"`,
      [service.id],
    );
    expect(logs.rows.map((r) => r.action)).toEqual(["SERVICE_INACTIVATED", "SERVICE_REACTIVATED"]);
  });
});

describe("serviço INATIVO não aparece para seleção de novos registros", () => {
  it("listActiveServicesService retorna só ATIVO", async () => {
    const active = await createServiceService(actorUserId, { name: "Serviço Ativo" });
    const toInactivate = await createServiceService(actorUserId, { name: "Serviço Inativo" });
    await inactivateServiceService(actorUserId, toInactivate.id);

    const available = await listActiveServicesService();
    const ids = available.map((s) => s.id);

    expect(ids).toContain(active.id);
    expect(ids).not.toContain(toInactivate.id);
  });

  it("um serviço volta a aparecer na lista de seleção depois de reativado", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Intermitente" });
    await inactivateServiceService(actorUserId, service.id);

    let available = await listActiveServicesService();
    expect(available.map((s) => s.id)).not.toContain(service.id);

    await reactivateServiceService(actorUserId, service.id);

    available = await listActiveServicesService();
    expect(available.map((s) => s.id)).toContain(service.id);
  });
});

describe("busca", () => {
  it("busca por nome (parcial, case-insensitive)", async () => {
    await createServiceService(actorUserId, { name: "Alinhamento de direção" });
    await createServiceService(actorUserId, { name: "Troca de óleo" });

    const result = await searchServicesService({ query: "alinha" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Alinhamento de direção");
  });

  it("busca por categoria", async () => {
    await createServiceService(actorUserId, { name: "Serviço A", category: "Freios" });
    await createServiceService(actorUserId, { name: "Serviço B", category: "Motor" });

    const result = await searchServicesService({ query: "freios" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Serviço A");
  });

  it("sem filtro retorna todos, incluindo inativos (a busca administrativa não esconde inativos)", async () => {
    const s1 = await createServiceService(actorUserId, { name: "Serviço C" });
    await inactivateServiceService(actorUserId, s1.id);
    await createServiceService(actorUserId, { name: "Serviço D" });

    const result = await searchServicesService({});
    expect(result.items).toHaveLength(2);
  });
});

describe("leitura", () => {
  it("getServiceService retorna null para id inexistente", async () => {
    const result = await getServiceService("id-inexistente");
    expect(result).toBeNull();
  });
});

describe("guarda de escopo do Ciclo A — nenhuma tabela de orçamento/OS é tocada", () => {
  it("criar/editar/inativar serviço não grava nada em quote_items nem work_order_items", async () => {
    const service = await createServiceService(actorUserId, { name: "Guarda de Escopo" });
    await updateServiceService(actorUserId, service.id, { name: "Guarda de Escopo Editado" });
    await inactivateServiceService(actorUserId, service.id);

    const quoteItems = await pool.query(`SELECT count(*) FROM quote_items`);
    const workOrderItems = await pool.query(`SELECT count(*) FROM work_order_items`);
    expect(Number(quoteItems.rows[0].count)).toBe(0);
    expect(Number(workOrderItems.rows[0].count)).toBe(0);
  });
});
