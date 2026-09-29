import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createServiceService, setServiceProcedureAndChecklistService } from "@/lib/services/service";
import {
  createProcedureService,
  inactivateProcedureService,
  reactivateProcedureService,
  updateProcedureService,
} from "@/lib/checklists/procedureService";
import {
  addChecklistItemService,
  createChecklistService,
  getChecklistService,
  inactivateChecklistService,
  reactivateChecklistService,
  removeChecklistItemService,
  updateChecklistItemService,
} from "@/lib/checklists/checklistService";
import {
  ActiveChecklistOfTypeAlreadyExistsError,
  ChecklistCodeAlreadyExistsError,
  ProcedureCodeAlreadyExistsError,
} from "@/lib/checklists/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "checklist_items", "checklists", "procedures", "services",
      "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
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
  await pool.query(`TRUNCATE "checklist_items", "checklists", "procedures", "services" CASCADE`);
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("Procedimentos — code obrigatório e único", () => {
  it("cria com code único", async () => {
    const p = await createProcedureService(actorUserId, { code: "POP-100", title: "Teste" });
    expect(p.code).toBe("POP-100");
  });

  it("rejeita code duplicado na criação", async () => {
    await createProcedureService(actorUserId, { code: "POP-101", title: "Original" });
    await expect(createProcedureService(actorUserId, { code: "POP-101", title: "Duplicado" })).rejects.toThrow(
      ProcedureCodeAlreadyExistsError,
    );
  });

  it("rejeita code duplicado na edição (contra outro procedimento)", async () => {
    await createProcedureService(actorUserId, { code: "POP-102", title: "A" });
    const b = await createProcedureService(actorUserId, { code: "POP-103", title: "B" });
    await expect(updateProcedureService(actorUserId, b.id, { code: "POP-102", title: "B" })).rejects.toThrow(
      ProcedureCodeAlreadyExistsError,
    );
  });

  it("permite manter o próprio code ao editar (não conflita consigo mesmo)", async () => {
    const p = await createProcedureService(actorUserId, { code: "POP-104", title: "A" });
    const updated = await updateProcedureService(actorUserId, p.id, { code: "POP-104", title: "A editado" });
    expect(updated.title).toBe("A editado");
  });

  it("nunca apaga fisicamente — inativa e reativa preservando o registro", async () => {
    const p = await createProcedureService(actorUserId, { code: "POP-105", title: "Ciclo de vida" });
    await inactivateProcedureService(actorUserId, p.id);
    const row1 = await pool.query(`SELECT status FROM procedures WHERE id = $1`, [p.id]);
    expect(row1.rows[0].status).toBe("INATIVO");

    await reactivateProcedureService(actorUserId, p.id);
    const row2 = await pool.query(`SELECT status FROM procedures WHERE id = $1`, [p.id]);
    expect(row2.rows[0].status).toBe("ATIVO");

    const count = await pool.query(`SELECT count(*) FROM procedures WHERE code = 'POP-105'`);
    expect(Number(count.rows[0].count)).toBe(1);
  });
});

describe("Checklists — code obrigatório e único", () => {
  it("rejeita code duplicado", async () => {
    await createChecklistService(actorUserId, { code: "CHK-100", name: "A", type: "EXECUCAO" });
    await expect(
      createChecklistService(actorUserId, { code: "CHK-100", name: "B", type: "EXECUCAO" }),
    ).rejects.toThrow(ChecklistCodeAlreadyExistsError);
  });
});

describe("regra crítica — só um ATIVO por tipo ENTRADA/ENTREGA por vez", () => {
  it("rejeita criar um segundo ENTRADA já ATIVO quando já existe um ATIVO", async () => {
    await createChecklistService(actorUserId, { code: "CHK-101", name: "Entrada 1", type: "ENTRADA" });
    await expect(
      createChecklistService(actorUserId, { code: "CHK-102", name: "Entrada 2", type: "ENTRADA" }),
    ).rejects.toThrow(ActiveChecklistOfTypeAlreadyExistsError);
  });

  it("rejeita reativar um ENTREGA se já existe outro ATIVO do mesmo tipo", async () => {
    const original = await createChecklistService(actorUserId, { code: "CHK-103", name: "Entrega 1", type: "ENTREGA" });
    await inactivateChecklistService(actorUserId, original.id);
    const novo = await createChecklistService(actorUserId, { code: "CHK-104", name: "Entrega 2", type: "ENTREGA" });

    await expect(reactivateChecklistService(actorUserId, original.id)).rejects.toThrow(
      ActiveChecklistOfTypeAlreadyExistsError,
    );

    await inactivateChecklistService(actorUserId, novo.id);
    const reactivated = await reactivateChecklistService(actorUserId, original.id);
    expect(reactivated.status).toBe("ATIVO");
  });

  it("EXECUCAO nunca tem exclusividade — múltiplos ATIVOS ao mesmo tempo são permitidos", async () => {
    await createChecklistService(actorUserId, { code: "CHK-105", name: "Execução 1", type: "EXECUCAO" });
    const c2 = await createChecklistService(actorUserId, { code: "CHK-106", name: "Execução 2", type: "EXECUCAO" });
    expect(c2.status).toBe("ATIVO");
  });
});

describe("itens de checklist — CRUD livre no molde", () => {
  it("adiciona, edita e remove item sem restrição", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-110", name: "Molde", type: "EXECUCAO" });
    const item = await addChecklistItemService(actorUserId, checklist.id, { description: "Item 1", required: true, sortOrder: 0 });

    const updated = await updateChecklistItemService(actorUserId, checklist.id, item.id, {
      description: "Item 1 editado",
      required: false,
      sortOrder: 0,
    });
    expect(updated.description).toBe("Item 1 editado");
    expect(updated.required).toBe(false);

    await removeChecklistItemService(actorUserId, checklist.id, item.id);
    const result = await getChecklistService(checklist.id);
    expect(result!.items).toHaveLength(0);
  });
});

describe("associação serviço ↔ procedimento ↔ checklist", () => {
  it("associa e desassocia livremente, sem afetar nada mais do serviço", async () => {
    const service = await createServiceService(actorUserId, { name: "Alinhamento" });
    const procedure = await createProcedureService(actorUserId, { code: "POP-200", title: "Alinhar" });
    const checklist = await createChecklistService(actorUserId, { code: "CHK-200", name: "Checklist alinhamento", type: "EXECUCAO" });

    const associated = await setServiceProcedureAndChecklistService(actorUserId, service.id, {
      procedureId: procedure.id,
      executionChecklistId: checklist.id,
    });
    expect(associated.procedureId).toBe(procedure.id);
    expect(associated.executionChecklistId).toBe(checklist.id);

    const desassociated = await setServiceProcedureAndChecklistService(actorUserId, service.id, {
      procedureId: null,
      executionChecklistId: null,
    });
    expect(desassociated.procedureId).toBeNull();
    expect(desassociated.executionChecklistId).toBeNull();
  });

  it("serviço continua funcionando normalmente sem procedimento nem checklist associados", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço sem associação" });
    expect(service.procedureId).toBeNull();
    expect(service.executionChecklistId).toBeNull();
  });

  it("inativar o procedimento nunca quebra o serviço já associado (config revisável)", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Associado" });
    const procedure = await createProcedureService(actorUserId, { code: "POP-201", title: "Proc" });
    await setServiceProcedureAndChecklistService(actorUserId, service.id, { procedureId: procedure.id });

    await inactivateProcedureService(actorUserId, procedure.id);
    const row = await pool.query(`SELECT "procedureId" FROM services WHERE id = $1`, [service.id]);
    expect(row.rows[0].procedureId).toBe(procedure.id);
  });
});

describe("regressão — suíte de serviços do Ciclo A/B não afetada", () => {
  it("criar serviço continua funcionando exatamente como antes", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Regressão", defaultPriceReais: "50,00" });
    expect(service.name).toBe("Serviço Regressão");
    expect(service.status).toBe("ATIVO");
  });
});
