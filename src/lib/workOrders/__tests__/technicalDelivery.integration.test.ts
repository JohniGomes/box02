import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createChecklistService, addChecklistItemService } from "@/lib/checklists/checklistService";
import { checkWorkOrderChecklistItemService, startWorkOrderChecklistService } from "@/lib/workOrders/checklistService";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
  updateWorkOrderTechnicalNotesService,
} from "@/lib/workOrders/service";
import { WorkOrderDeliveryChecklistPendingError, WorkOrderReceptionNotAcceptedError } from "@/lib/workOrders/errors";

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
let customerId: string;
let vehicleId: string;

beforeAll(async () => {
  await cleanAll();
  const hash = await hashPassword("senhaTeste123");
  const user = await createUser({ name: "Testador", email: "testador@teste.com", passwordHash: hash });
  actorUserId = user.id;
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE "work_order_checklist_items", "work_order_checklists",
      "work_order_closures", "work_order_items", "work_orders",
      "checklist_items", "checklists",
      "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo G" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIG1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

async function moveToPronta(workOrderId: string) {
  await registerWorkOrderReceptionAcceptanceService(actorUserId, workOrderId, { receptionAcceptedName: "Aceite Teste" });
  await setWorkOrderStatusService(actorUserId, workOrderId, "EM_EXECUCAO");
  await setWorkOrderStatusService(actorUserId, workOrderId, "TESTE_FINAL");
  await setWorkOrderStatusService(actorUserId, workOrderId, "PRONTA");
}

describe("technicalNotes — criar/editar a partir de PRONTA, sem gate, sem write-once", () => {
  it("cria e edita o registro técnico quando a OS está PRONTA", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);

    const first = await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, {
      technicalNotes: "Veículo testado, sem ruídos.",
    });
    expect(first.technicalNotes).toBe("Veículo testado, sem ruídos.");

    const second = await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, {
      technicalNotes: "Atualizado: recomendamos revisar o óleo em 3 meses.",
    });
    expect(second.technicalNotes).toBe("Atualizado: recomendamos revisar o óleo em 3 meses.");
  });

  it("continua editável depois de ENTREGUE", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });

    const updated = await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, {
      technicalNotes: "Registro feito depois da entrega.",
    });
    expect(updated.technicalNotes).toBe("Registro feito depois da entrega.");
  });

  it("grava auditoria WORK_ORDER_TECHNICAL_NOTES_UPDATED", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);
    await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, { technicalNotes: "Nota qualquer" });

    const log = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 AND action = 'WORK_ORDER_TECHNICAL_NOTES_UPDATED'`,
      [os.workOrder.id],
    );
    expect(log.rows.length).toBeGreaterThan(0);
  });

  it("não altera status nem interfere no fechamento", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);
    const updated = await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, { technicalNotes: "Nota" });
    expect(updated.status).toBe("PRONTA");
  });
});

describe("regressão explícita — nenhum gate dos Ciclos D/E/F foi alterado", () => {
  it("gate de checklist de entrega continua bloqueando com item obrigatório pendente", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-G01", name: "Entrega Teste", type: "ENTREGA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item obrigatório", required: true, sortOrder: 0 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);
    await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTREGA");

    await expect(
      closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" }),
    ).rejects.toThrow(WorkOrderDeliveryChecklistPendingError);
  });

  it("gate de checklist de entrega continua liberando quando tudo obrigatório está marcado", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-G02", name: "Entrega Teste 2", type: "ENTREGA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item obrigatório", required: true, sortOrder: 0 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTREGA");
    await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, started.items[0].id, true);

    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("gate de aceite de recepção continua bloqueando EM_EXECUCAO sem aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow(
      WorkOrderReceptionNotAcceptedError,
    );
  });

  it("máquina de estados continua rejeitando transições inválidas", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "CANCELADA");
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow();
  });
});

describe("consolidação de dados para a Entrega Técnica — só o que já existe, sem duplicar", () => {
  it("itens EXECUTADO, PLANEJADO e CANCELADO ficam corretamente distinguíveis", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [
        { type: "SERVICO", description: "Executado de fato", quantity: 1, unitPriceReais: "50,00" },
        { type: "SERVICO", description: "Vai ficar planejado", quantity: 1, unitPriceReais: "30,00" },
      ],
    });
    await moveToPronta(os.workOrder.id);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[1].id, "CANCELADO", { reason: "Cliente não autorizou" });

    const refetched = await pool.query(
      `SELECT description, status FROM work_order_items WHERE "workOrderId" = $1 ORDER BY "createdAt"`,
      [os.workOrder.id],
    );
    expect(refetched.rows.find((r) => r.description === "Executado de fato")?.status).toBe("EXECUTADO");
    expect(refetched.rows.find((r) => r.description === "Vai ficar planejado")?.status).toBe("CANCELADO");
  });

  it("nenhuma alteração em totalCents/preço causada por technicalNotes", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Item com preço", quantity: 1, unitPriceReais: "100,00" }],
    });
    await moveToPronta(os.workOrder.id);
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
    const totalBefore = closed.totalCents;

    await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, { technicalNotes: "Nota qualquer" });

    const refetched = await pool.query(`SELECT "totalCents" FROM work_orders WHERE id = $1`, [os.workOrder.id]);
    expect(refetched.rows[0].totalCents).toBe(totalBefore);
  });
});
