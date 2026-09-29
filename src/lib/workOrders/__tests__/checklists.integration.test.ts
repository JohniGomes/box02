import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createServiceService, setServiceProcedureAndChecklistService } from "@/lib/services/service";
import { addChecklistItemService, createChecklistService, inactivateChecklistService } from "@/lib/checklists/checklistService";
import {
  createWorkOrderWithoutQuoteService,
  setWorkOrderStatusService,
  setWorkOrderItemStatusService,
  closeWorkOrderService,
  registerWorkOrderReceptionAcceptanceService,
} from "@/lib/workOrders/service";
import {
  checkWorkOrderChecklistItemService,
  completeWorkOrderChecklistService,
  getWorkOrderChecklistsService,
  startWorkOrderChecklistService,
} from "@/lib/workOrders/checklistService";
import {
  NoChecklistTemplateAvailableError,
  WorkOrderDeliveryChecklistPendingError,
} from "@/lib/workOrders/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_checklist_items", "work_order_checklists",
      "work_order_closures", "work_order_items", "work_orders",
      "checklist_items", "checklists", "services",
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
      "checklist_items", "checklists", "services",
      "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo E" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIE1001" });
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

describe("congelamento por cópia — editar o molde depois nunca afeta a instância já criada", () => {
  it("iniciar checklist copia os itens no momento; editar o molde depois não muda nada na instância", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-E01", name: "Entrada Teste", type: "ENTRADA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item original", required: true, sortOrder: 0 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");
    expect(started.items).toHaveLength(1);
    expect(started.items[0].description).toBe("Item original");
    expect(started.checklist.code).toBe("CHK-E01");

    await addChecklistItemService(actorUserId, checklist.id, { description: "Item adicionado depois", required: true, sortOrder: 1 });
    await inactivateChecklistService(actorUserId, checklist.id);

    const instances = await getWorkOrderChecklistsService(os.workOrder.id);
    const entrada = instances.find((i) => i.checklist.type === "ENTRADA")!;
    expect(entrada.items).toHaveLength(1);
    expect(entrada.items[0].description).toBe("Item original");
  });
});

describe("iniciar checklist é idempotente (get-or-create)", () => {
  it("chamar iniciar duas vezes retorna a mesma instância, sem duplicar", async () => {
    await createChecklistService(actorUserId, { code: "CHK-E02", name: "Entrada", type: "ENTRADA" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });

    const first = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");
    const second = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");
    expect(second.checklist.id).toBe(first.checklist.id);

    const count = await pool.query(`SELECT count(*) FROM work_order_checklists WHERE "workOrderId" = $1`, [os.workOrder.id]);
    expect(Number(count.rows[0].count)).toBe(1);
  });
});

describe("checklist de execução vinculado ao serviço do item", () => {
  it("inicia usando o executionChecklistId do serviço; serviço sem checklist não tem nada para iniciar", async () => {
    const execChecklist = await createChecklistService(actorUserId, { code: "CHK-E03", name: "Execução Alinhamento", type: "EXECUCAO" });
    await addChecklistItemService(actorUserId, execChecklist.id, { description: "Calibrar pneus", required: true, sortOrder: 0 });
    const service = await createServiceService(actorUserId, { name: "Alinhamento", defaultPriceReais: "100,00" });
    await setServiceProcedureAndChecklistService(actorUserId, service.id, { executionChecklistId: execChecklist.id });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Alinhamento", quantity: 1, unitPriceReais: "100,00", serviceId: service.id }],
    });
    const item = os.items[0];

    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "EXECUCAO", item.id);
    expect(started.checklist.code).toBe("CHK-E03");
    expect(started.items[0].description).toBe("Calibrar pneus");
  });

  it("serviço sem checklist de execução: iniciar rejeita, mas o item continua executável normalmente", async () => {
    const service = await createServiceService(actorUserId, { name: "Troca de óleo simples" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Troca de óleo simples", quantity: 1, unitPriceReais: "80,00", serviceId: service.id }],
    });
    const item = os.items[0];

    await expect(startWorkOrderChecklistService(actorUserId, os.workOrder.id, "EXECUCAO", item.id)).rejects.toThrow(
      NoChecklistTemplateAvailableError,
    );

    const executed = await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, item.id, "EXECUTADO");
    expect(executed.status).toBe("EXECUTADO");
  });
});

describe("marcar/desmarcar itens e finalizar checklist", () => {
  it("marca item, desmarca, e finaliza sem exigir todos marcados", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-E04", name: "Entrada", type: "ENTRADA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Item A", required: true, sortOrder: 0 });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");
    const itemId = started.items[0].id;

    const checked = await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, itemId, true);
    expect(checked.checked).toBe(true);
    expect(checked.checkedAt).not.toBeNull();

    const unchecked = await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, itemId, false);
    expect(unchecked.checked).toBe(false);
    expect(unchecked.checkedAt).toBeNull();

    const completed = await completeWorkOrderChecklistService(actorUserId, started.checklist.id);
    expect(completed.completedAt).not.toBeNull();
  });
});

describe("REGRA CRÍTICA — bloqueio de entrega (EX-2)", () => {
  it("bloqueia fechamento quando checklist de entrega iniciado tem item obrigatório pendente", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-E05", name: "Entrega", type: "ENTREGA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Testar veículo", required: true, sortOrder: 0 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTREGA");
    await moveToPronta(os.workOrder.id);

    await expect(
      closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" }),
    ).rejects.toThrow(WorkOrderDeliveryChecklistPendingError);
  });

  it("permite fechamento quando não existe instância de checklist de entrega nesta OS (ausência nunca bloqueia)", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await moveToPronta(os.workOrder.id);

    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("permite fechamento quando todos os itens obrigatórios estão marcados (opcionais pendentes não bloqueiam)", async () => {
    const checklist = await createChecklistService(actorUserId, { code: "CHK-E06", name: "Entrega", type: "ENTREGA" });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Obrigatório", required: true, sortOrder: 0 });
    await addChecklistItemService(actorUserId, checklist.id, { description: "Opcional", required: false, sortOrder: 1 });

    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const started = await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTREGA");
    const obrigatorio = started.items.find((i) => i.required)!;

    await checkWorkOrderChecklistItemService(actorUserId, started.checklist.id, obrigatorio.id, true);
    await moveToPronta(os.workOrder.id);

    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Teste" });
    expect(closed.status).toBe("ENTREGUE");
  });
});

describe("preservação dos dados já existentes da OS — nenhum campo tocado", () => {
  it("diagnóstico, queixa, itens e preços permanecem intactos depois de usar checklists", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      customerComplaint: "Barulho na suspensão",
      items: [{ type: "SERVICO", description: "Diagnóstico", quantity: 1, unitPriceReais: "50,00" }],
    });

    await createChecklistService(actorUserId, { code: "CHK-E07", name: "Entrada", type: "ENTRADA" });
    await startWorkOrderChecklistService(actorUserId, os.workOrder.id, "ENTRADA");

    const refetched = await pool.query(`SELECT "customerComplaint" FROM work_orders WHERE id = $1`, [os.workOrder.id]);
    expect(refetched.rows[0].customerComplaint).toBe("Barulho na suspensão");

    const itemRefetched = await pool.query(`SELECT description, "unitPriceCents" FROM work_order_items WHERE id = $1`, [
      os.items[0].id,
    ]);
    expect(itemRefetched.rows[0].description).toBe("Diagnóstico");
    expect(itemRefetched.rows[0].unitPriceCents).toBe(5000);
  });
});

describe("regressão — suíte já existente não afetada", () => {
  it("criar e fechar uma OS sem nenhum checklist envolvido continua funcionando como antes", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Serviço simples", quantity: 1, unitPriceReais: "60,00" }],
    });
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await moveToPronta(os.workOrder.id);
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente Regressão" });
    expect(closed.status).toBe("ENTREGUE");
  });
});
