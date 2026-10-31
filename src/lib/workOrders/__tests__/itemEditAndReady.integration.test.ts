import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  closeWorkOrderService,
  correctWorkOrderItemService,
  createWorkOrderWithoutQuoteService,
  getWorkOrderService,
  listWorkOrderCorrectionsService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import { InvalidWorkOrderTransitionError } from "../errors";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_payments", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key IN ('rule_detailed_stages', 'work_order_number_seq')`);
}

async function newOs() {
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [
      { type: "SERVICO", description: "Troca do cilindro", quantity: 2, unitPriceReais: "100,00" },
      { type: "SERVICO", description: "Alinhamento", quantity: 1, unitPriceReais: "80,00" },
    ],
  });
  await acceptReceptionForTest(actorUserId, os.workOrder.id, {
    receptionAcceptedName: "Cliente",
    receptionAwareness1: true,
    receptionAwareness2: true,
    receptionAwareness3: true,
  });
  return os;
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ie@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Edição" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "EDT1A23", brand: "Fiat", model: "Uno" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("corrigir descrição e valor de item da OS", () => {
  it("corrige a descrição, fica no histórico e vale na leitura da OS", async () => {
    const os = await newOs();
    const updated = await correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[0].id, { description: "Troca dos cilindros traseiros" });
    expect(updated.description).toBe("Troca dos cilindros traseiros");
    expect(updated.totalCents).toBe(20000);

    const again = await getWorkOrderService(os.workOrder.id);
    expect(again?.items.find((i) => i.id === os.items[0].id)?.description).toBe("Troca dos cilindros traseiros");

    const history = await listWorkOrderCorrectionsService(os.workOrder.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "ITEM", from: expect.stringContaining("Troca do cilindro"), to: expect.stringContaining("cilindros traseiros") });
  });

  it("recusa quando nada mudou ou o texto é curto demais", async () => {
    const os = await newOs();
    await expect(correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[1].id, { description: "Alinhamento" })).rejects.toThrow(/Nada para corrigir/);
    await expect(correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[1].id, { description: "a" })).rejects.toThrow(/pelo menos 2/);
  });

  it("valor: pede motivo, recalcula o total da linha e registra o valor de antes", async () => {
    const os = await newOs();
    await expect(correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[0].id, { unitPriceReais: "120,00" })).rejects.toThrow(/motivo/i);

    const updated = await correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[0].id, { unitPriceReais: "120,00", reason: "Digitei o valor errado" });
    expect(updated.unitPriceCents).toBe(12000);
    expect(updated.totalCents).toBe(24000); // 2 × R$ 120,00
    expect(Number(updated.quantity)).toBe(2);

    const history = await listWorkOrderCorrectionsService(os.workOrder.id);
    expect(history[0].reason).toBe("Digitei o valor errado");
    expect(history[0].from).toContain("100,00");
    expect(history[0].to).toContain("120,00");
  });

  it("OS entregue: descrição ainda corrige, valor não (usa Reabrir OS)", async () => {
    const os = await newOs();
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[1].id, "EXECUTADO");
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });

    const fixed = await correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[1].id, { description: "Alinhamento e balanceamento" });
    expect(fixed.description).toBe("Alinhamento e balanceamento");
    await expect(
      correctWorkOrderItemService(actorUserId, os.workOrder.id, os.items[1].id, { unitPriceReais: "90,00", reason: "Ajuste" }),
    ).rejects.toThrow(/Reabrir OS/);
  });

  it("item de outra OS não é encontrado", async () => {
    const a = await newOs();
    const b = await newOs();
    await expect(correctWorkOrderItemService(actorUserId, a.workOrder.id, b.items[0].id, { description: "Outro texto" })).rejects.toThrow();
  });
});

describe("marcar como Pronta", () => {
  it("Em execução vai direto para Pronta, e ainda pode ser entregue", async () => {
    const os = await newOs();
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    const ready = await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA");
    expect(ready.status).toBe("PRONTA");
    expect(ready.completedAt).not.toBeNull();

    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[1].id, "EXECUTADO");
    const closed = await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    expect(closed.status).toBe("ENTREGUE");
  });

  it("Aguardando peça também vai para Pronta; Pronta pode voltar para Em execução", async () => {
    const os = await newOs();
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "AGUARDANDO_PECA");
    expect((await setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA")).status).toBe("PRONTA");
    expect((await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).status).toBe("EM_EXECUCAO");
  });

  it("OS aberta (que nem começou) não vira Pronta, e entregue não volta", async () => {
    const os = await newOs();
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "PRONTA")).rejects.toThrow(InvalidWorkOrderTransitionError);

    await setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[0].id, "EXECUTADO");
    await setWorkOrderItemStatusService(actorUserId, os.workOrder.id, os.items[1].id, "EXECUTADO");
    await closeWorkOrderService(actorUserId, os.workOrder.id, { deliveryAcceptedName: "Cliente" });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow(InvalidWorkOrderTransitionError);
  });
});
