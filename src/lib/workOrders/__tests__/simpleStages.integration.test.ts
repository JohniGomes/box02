import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { setDetailedStagesEnabled, setReceptionRequiredForExecution, isDetailedStagesEnabled } from "@/lib/settings/service";
import {
  closeWorkOrderService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
  updateWorkOrderTechnicalNotesService,
  getWorkOrderService,
} from "../service";
import { InvalidWorkOrderTransitionError, WorkOrderReceptionNotAcceptedError } from "../errors";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('rule_detailed_stages', 'rule_reception_required_for_execution', 'work_order_number_seq')`);
}

async function newOs(opts: { accept: boolean }) {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [{ type: "SERVICO", description: "Revisão", quantity: 1, unitPriceReais: "100,00" }],
  });
  if (opts.accept) {
    await acceptReceptionForTest(actorUserId, os.workOrder.id, {
      receptionAcceptedName: "Cliente",
      receptionAwareness1: true,
      receptionAwareness2: true,
      receptionAwareness3: true,
    });
  }
  return os;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ss@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Simples" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "SMP1A23", brand: "Fiat", model: "Uno" })).id;
});

beforeEach(async () => {
  await pool.query(`DELETE FROM app_settings WHERE key IN ('rule_detailed_stages', 'rule_reception_required_for_execution')`);
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("etapas simples da OS", () => {
  it("o padrão é o modo simples", async () => {
    expect(await isDetailedStagesEnabled()).toBe(false);
  });

  it("modo simples: entrega direto de 'Em execução' (sem passar por Teste final e Pronta)", async () => {
    const os = await newOs({ accept: true });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    expect(closed.status).toBe("ENTREGUE");
    expect(closed.totalCents).toBe(10000);
  });

  it("modo simples: entrega direto de 'Aberta' quando o Termo já foi aceito", async () => {
    const os = await newOs({ accept: true });
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("modo simples: de 'Aberta' sem o Termo aceito segue a regra da recepção (ligada: pede o termo; desligada: entrega)", async () => {
    const semTermo = await newOs({ accept: false });
    await setWorkOrderItemStatusService(actorUserId, semTermo.workOrder.id, semTermo.items[0].id, "EXECUTADO");
    await expect(closeWorkOrderService(actorUserId, semTermo.workOrder.id, { deliveryAcceptedName: "Cliente" })).rejects.toThrow(
      WorkOrderReceptionNotAcceptedError,
    );

    await setReceptionRequiredForExecution(false);
    const closed = await closeWorkOrderService(actorUserId, semTermo.workOrder.id, { deliveryAcceptedName: "Cliente" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("item planejado continua impedindo a entrega (regra que protege os números)", async () => {
    const os = await newOs({ accept: true });
    await expect(closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" })).rejects.toThrow();
  });

  it("etapas detalhadas ligadas: só a OS 'Pronta' entrega, como antes", async () => {
    await setDetailedStagesEnabled(true);
    const os = await newOs({ accept: true });
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await expect(closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" })).rejects.toThrow(
      InvalidWorkOrderTransitionError,
    );
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "TESTE_FINAL");
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("registro técnico pode ser escrito em qualquer etapa (já na OS aberta)", async () => {
    const os = await newOs({ accept: false });
    await updateWorkOrderTechnicalNotesService(actorUserId, os.workOrder.id, { technicalNotes: "Testado, sem ruídos." });
    const again = await getWorkOrderService(os.workOrder.id);
    expect(again?.workOrder.technicalNotes).toBe("Testado, sem ruídos.");
  });
});
