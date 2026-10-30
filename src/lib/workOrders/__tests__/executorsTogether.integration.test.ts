import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createExecutorService, setExecutorStatusService } from "@/lib/executors/service";
import { parseExecutorValue } from "@/lib/executors/value";
import { InvalidExecutorUserError } from "@/lib/workOrders/errors";
import {
  correctWorkOrderItemExecutorService,
  createWorkOrderWithoutQuoteService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
} from "../service";
import { acceptReceptionForTest } from "./acceptHelper";

let actorUserId: string;
let osId: string;
let items: { id: string }[];
let carlosId: string;
let mateusId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "executors", "work_order_closures", "work_order_items", "work_orders", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "ex@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  carlosId = (await createExecutorService(actorUserId, "Carlos Eduardo")).id;
  mateusId = (await createExecutorService(actorUserId, "Mateus Cintra")).id;
  const customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Juntos" })).id;
  const vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "EXE1A23" })).id;
  const os = await createWorkOrderWithoutQuoteService(actorUserId, {
    customerId,
    vehicleId,
    mileageAtEntry: 1000,
    items: [
      { type: "SERVICO", description: "Alinhamento", quantity: 1, unitPriceReais: "80,00" },
      { type: "SERVICO", description: "Balanceamento", quantity: 1, unitPriceReais: "60,00" },
      { type: "SERVICO", description: "Revisão", quantity: 1, unitPriceReais: "90,00" },
    ],
  });
  osId = os.workOrder.id;
  items = os.items;
  await acceptReceptionForTest(actorUserId, osId, { receptionAcceptedName: "Ana", receptionAwareness1: true, receptionAwareness2: true, receptionAwareness3: true });
  await setWorkOrderStatusService(actorUserId, osId, "EM_EXECUCAO");
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("itens executados por mais de uma pessoa", () => {
  it("dois executores marcados viram um nome só, na ordem escolhida", async () => {
    const item = await setWorkOrderItemStatusService(actorUserId, osId, items[0].id, "EXECUTADO", parseExecutorValue(`executor:${carlosId},executor:${mateusId}`));
    expect(item).toMatchObject({ status: "EXECUTADO", executedByName: "Carlos Eduardo e Mateus Cintra", executedByUserId: null });
  });

  it("um executor só continua igual a antes", async () => {
    const item = await setWorkOrderItemStatusService(actorUserId, osId, items[1].id, "EXECUTADO", parseExecutorValue(`executor:${mateusId}`));
    expect(item).toMatchObject({ executedByName: "Mateus Cintra" });
  });

  it("corrigir o executor também aceita os dois, e o histórico guarda o anterior", async () => {
    const item = await correctWorkOrderItemExecutorService(actorUserId, osId, items[1].id, parseExecutorValue(`executor:${carlosId},executor:${mateusId}`));
    expect(item.executedByName).toBe("Carlos Eduardo e Mateus Cintra");
    const log = await pool.query(`SELECT metadata FROM audit_logs WHERE "entityId" = $1 AND action LIKE '%EXECUTOR%' ORDER BY "createdAt" DESC LIMIT 1`, [items[1].id]);
    expect(JSON.stringify(log.rows[0]?.metadata ?? {})).toMatch(/Mateus Cintra/);
  });

  it("executor inativo ou inexistente no meio da lista é recusado", async () => {
    await setExecutorStatusService(actorUserId, mateusId, "INATIVO");
    await expect(
      setWorkOrderItemStatusService(actorUserId, osId, items[2].id, "EXECUTADO", parseExecutorValue(`executor:${carlosId},executor:${mateusId}`)),
    ).rejects.toThrow(InvalidExecutorUserError);
    await expect(
      setWorkOrderItemStatusService(actorUserId, osId, items[2].id, "EXECUTADO", parseExecutorValue(`executor:${carlosId},executor:nao-existe`)),
    ).rejects.toThrow(InvalidExecutorUserError);
  });
});
