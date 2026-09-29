import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  searchWorkOrdersService,
  setWorkOrderStatusService,
  updateWorkOrderExplanationService,
} from "@/lib/workOrders/service";
import { isAtVerificamosBarrier, workOrderStatusToActiveMethodStage } from "@/app/dashboard/os/statusLabels";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
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
  await pool.query(`TRUNCATE "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers" CASCADE`);
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Método" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "MET1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("mapeamento status -> etapa ativa do Método BOX 02 (função pura)", () => {
  it("ABERTA -> IDENTIFICAMOS", () => {
    expect(workOrderStatusToActiveMethodStage("ABERTA")).toBe("IDENTIFICAMOS");
  });
  it("EM_DIAGNOSTICO -> DIAGNOSTICAMOS", () => {
    expect(workOrderStatusToActiveMethodStage("EM_DIAGNOSTICO")).toBe("DIAGNOSTICAMOS");
  });
  it("EM_EXECUCAO, AGUARDANDO_PECA e TESTE_FINAL -> EXECUTAMOS", () => {
    expect(workOrderStatusToActiveMethodStage("EM_EXECUCAO")).toBe("EXECUTAMOS");
    expect(workOrderStatusToActiveMethodStage("AGUARDANDO_PECA")).toBe("EXECUTAMOS");
    expect(workOrderStatusToActiveMethodStage("TESTE_FINAL")).toBe("EXECUTAMOS");
  });
  it("PRONTA -> EXECUTAMOS (não Verificamos — barreira é selo à parte)", () => {
    expect(workOrderStatusToActiveMethodStage("PRONTA")).toBe("EXECUTAMOS");
  });
  it("ENTREGUE -> ENTREGAMOS", () => {
    expect(workOrderStatusToActiveMethodStage("ENTREGUE")).toBe("ENTREGAMOS");
  });
  it("CANCELADA -> null (nenhuma etapa ativa)", () => {
    expect(workOrderStatusToActiveMethodStage("CANCELADA")).toBeNull();
  });
  it("isAtVerificamosBarrier só é true em PRONTA", () => {
    expect(isAtVerificamosBarrier("PRONTA")).toBe(true);
    expect(isAtVerificamosBarrier("EM_EXECUCAO")).toBe(false);
    expect(isAtVerificamosBarrier("ENTREGUE")).toBe(false);
  });
});

describe("EXPLICAMOS — independente de orçamento, sem gate, sem write-once", () => {
  it("atualiza livremente, múltiplas vezes, numa OS sem orçamento", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });

    const first = await updateWorkOrderExplanationService(actorUserId, os.workOrder.id, {
      diagnosisExplanationNotes: "Expliquei o problema da suspensão",
    });
    expect(first.diagnosisExplanationNotes).toBe("Expliquei o problema da suspensão");

    const second = await updateWorkOrderExplanationService(actorUserId, os.workOrder.id, {
      diagnosisExplanationNotes: "Atualizei a explicação depois de nova inspeção",
    });
    expect(second.diagnosisExplanationNotes).toBe("Atualizei a explicação depois de nova inspeção");
  });

  it("continua editável mesmo depois do aceite de recepção (sem gate, diferente do Termo)", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });

    const updated = await updateWorkOrderExplanationService(actorUserId, os.workOrder.id, {
      diagnosisExplanationNotes: "Explicação registrada depois do aceite",
    });
    expect(updated.diagnosisExplanationNotes).toBe("Explicação registrada depois do aceite");
  });
});

describe("listagem de OS — indicador de aceite pendente (UX-11)", () => {
  it("searchWorkOrdersService retorna receptionAcceptedAt corretamente", async () => {
    const osA = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, osA.workOrder.id, { receptionAcceptedName: "Cliente A" });

    const c2 = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Método 2" });
    const v2 = await createVehicleService(actorUserId, { customerId: c2.id, plate: "MET1002" });
    const osB = await createWorkOrderWithoutQuoteService(actorUserId, { customerId: c2.id, vehicleId: v2.id, mileageAtEntry: 2000 });

    const { items } = await searchWorkOrdersService({ limit: 20 });
    const foundA = items.find((i) => i.id === osA.workOrder.id)!;
    const foundB = items.find((i) => i.id === osB.workOrder.id)!;

    expect(foundA.receptionAcceptedAt).not.toBeNull();
    expect(foundB.receptionAcceptedAt).toBeNull();
  });
});

describe("regressão — gate de EM_EXECUCAO e comportamentos do Ciclo F continuam intocados", () => {
  it("EM_EXECUCAO continua exigindo aceite de recepção", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow();
  });
});
