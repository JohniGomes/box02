import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createChecklistService, addChecklistItemService } from "@/lib/checklists/checklistService";
import { checkWorkOrderChecklistItemService, startWorkOrderChecklistService } from "@/lib/workOrders/checklistService";
import {
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderStatusService,
  updateWorkOrderReceptionInfoService,
} from "@/lib/workOrders/service";
import {
  WorkOrderReceptionAlreadyAcceptedError,
  WorkOrderReceptionNotAcceptedError,
} from "@/lib/workOrders/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_checklist_items", "work_order_checklists",
      "work_order_closures", "work_order_items", "work_orders",
      "checklist_items", "checklists",
      "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

let actorUserId: string;
let secondUserId: string;
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
  const user2 = await createUser({ name: "Recepcionista", email: "recepcionista@teste.com", passwordHash: hash });
  secondUserId = user2.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_checklist_items", "work_order_checklists",
      "work_order_closures", "work_order_items", "work_orders",
      "checklist_items", "checklists",
      "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo F" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIF1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("informações de recepção (avarias) — livres antes do aceite", () => {
  it("atualiza avarias livremente, mais de uma vez, antes do aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const first = await updateWorkOrderReceptionInfoService(actorUserId, os.workOrder.id, {
      preExistingDamagesDescription: "Risco na porta",
    });
    expect(first.preExistingDamagesDescription).toBe("Risco na porta");

    const second = await updateWorkOrderReceptionInfoService(actorUserId, os.workOrder.id, {
      preExistingDamagesDescription: "Risco na porta e amassado no capô",
    });
    expect(second.preExistingDamagesDescription).toBe("Risco na porta e amassado no capô");
  });

  it("rejeita atualizar avarias depois do aceite já registrado", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
    });

    await expect(
      updateWorkOrderReceptionInfoService(actorUserId, os.workOrder.id, { preExistingDamagesDescription: "Tentando editar" }),
    ).rejects.toThrow(WorkOrderReceptionAlreadyAcceptedError);
  });
});

describe("aceite de recepção — write-once", () => {
  it("registra aceite com receivedByUserId independente de createdByUserId", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    expect(os.workOrder.createdByUserId).toBe(actorUserId);

    const accepted = await registerWorkOrderReceptionAcceptanceService(secondUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
      receptionAcceptedDocument: "52998224725",
    });

    expect(accepted.receivedByUserId).toBe(secondUserId);
    expect(accepted.receivedByUserId).not.toBe(accepted.createdByUserId);
    expect(accepted.receptionAcceptedName).toBe("Cliente Teste");
    expect(accepted.receptionAcceptedAt).not.toBeNull();
  });

  it("rejeita CPF inválido no aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(
      registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
        receptionAcceptedName: "Cliente Teste",
        receptionAcceptedDocument: "11111111111",
      }),
    ).rejects.toThrow();
  });

  it("segunda tentativa de aceite é rejeitada, nenhum campo é sobrescrito", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Primeiro Aceite",
    });

    await expect(
      registerWorkOrderReceptionAcceptanceService(secondUserId, os.workOrder.id, {
        receptionAcceptedName: "Segundo Aceite (não deveria substituir)",
      }),
    ).rejects.toThrow(WorkOrderReceptionAlreadyAcceptedError);

    const row = await pool.query(`SELECT "receptionAcceptedName" FROM work_orders WHERE id = $1`, [os.workOrder.id]);
    expect(row.rows[0].receptionAcceptedName).toBe("Primeiro Aceite");
  });
});

describe("congelamento (DEC-7) — queixa e avarias", () => {
  it("congela queixa e avarias no momento do aceite; edição direta no banco depois não afeta o snapshot", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      customerComplaint: "Barulho no motor",
    });
    await updateWorkOrderReceptionInfoService(actorUserId, os.workOrder.id, {
      preExistingDamagesDescription: "Amassado no paralama",
    });

    const accepted = await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
    });
    expect(accepted.receptionComplaintSnapshot).toBe("Barulho no motor");
    expect(accepted.receptionDamagesSnapshot).toBe("Amassado no paralama");

    await pool.query(`UPDATE work_orders SET "customerComplaint" = 'MUDOU' WHERE id = $1`, [os.workOrder.id]);
    const refetched = await pool.query(`SELECT "receptionComplaintSnapshot" FROM work_orders WHERE id = $1`, [os.workOrder.id]);
    expect(refetched.rows[0].receptionComplaintSnapshot).toBe("Barulho no motor");
  });
});

describe("snapshot do CHK-001 — menor arquitetura, autossuficiente", () => {
  it("com checklist de entrada iniciado e parcialmente marcado: aceite captura o estado exato", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-F01", name: "Entrada Teste", type: "ENTRADA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item 1", required: true, sortOrder: 0 });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item 2", required: false, sortOrder: 1 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");
    const item1 = started.items.find((i) => i.description === "Item 1")!;
    await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, item1.id, true);

    const accepted = await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
    });

    expect(accepted.receptionChecklistSnapshot).not.toBeNull();
    expect(accepted.receptionChecklistSnapshot!.code).toBe("CHK-F01");
    expect(accepted.receptionChecklistSnapshot!.items).toHaveLength(2);
    const snapItem1 = accepted.receptionChecklistSnapshot!.items.find((i) => i.description === "Item 1")!;
    expect(snapItem1.checked).toBe(true);
    expect(snapItem1.required).toBe(true);
    const snapItem2 = accepted.receptionChecklistSnapshot!.items.find((i) => i.description === "Item 2")!;
    expect(snapItem2.checked).toBe(false);
  });

  it("marcar mais itens DEPOIS do aceite não altera o snapshot já congelado; checklist operacional continua funcionando", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-F02", name: "Entrada Teste 2", type: "ENTRADA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item A", required: true, sortOrder: 0 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");

    const accepted = await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
    });
    expect(accepted.receptionChecklistSnapshot!.items[0].checked).toBe(false);

    const itemA = started.items[0];
    const checkedAfter = await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, itemA.id, true);
    expect(checkedAfter.checked).toBe(true);

    const refetched = await pool.query(`SELECT "receptionChecklistSnapshot" FROM work_orders WHERE id = $1`, [os.workOrder.id]);
    expect(refetched.rows[0].receptionChecklistSnapshot.items[0].checked).toBe(false);
  });

  it("sem checklist de entrada iniciado: aceite funciona normalmente, snapshot fica null", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const accepted = await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente Teste",
    });
    expect(accepted.receptionChecklistSnapshot).toBeNull();
  });
});

describe("GATE — transição para EM_EXECUCAO exige aceite (DEC-1)", () => {
  it("bloqueia EM_EXECUCAO sem aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow(
      WorkOrderReceptionNotAcceptedError,
    );
  });

  it("permite EM_DIAGNOSTICO sem aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const updated = await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_DIAGNOSTICO");
    expect(updated.status).toBe("EM_DIAGNOSTICO");
  });

  it("permite CANCELADA sem aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const updated = await setWorkOrderStatusService(actorUserId, os.workOrder.id, "CANCELADA");
    expect(updated.status).toBe("CANCELADA");
  });

  it("permite EM_EXECUCAO depois de registrar o aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });
    const updated = await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    expect(updated.status).toBe("EM_EXECUCAO");
  });

  it("EM_DIAGNOSTICO -> EM_EXECUCAO ainda exige aceite (não é liberado só por já ter passado pelo diagnóstico)", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_DIAGNOSTICO");
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow(
      WorkOrderReceptionNotAcceptedError,
    );
  });
});

describe("regressão — criação de OS continua sem exigir aceite nem avarias", () => {
  it("cria OS normalmente, sem nenhum campo do Ciclo F preenchido", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    expect(os.workOrder.receptionAcceptedAt).toBeNull();
    expect(os.workOrder.preExistingDamagesDescription).toBeNull();
    expect(os.workOrder.status).toBe("ABERTA");
  });
});
