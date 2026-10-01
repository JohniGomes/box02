import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createWorkOrderEvidenceService,
  createWorkOrderWithoutQuoteService,
  deleteWorkOrderEvidenceService,
  listWorkOrderEvidencesService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderStatusService,
} from "@/lib/workOrders/service";
import { WorkOrderEvidenceLockedError, WorkOrderEvidenceNotFoundError } from "@/lib/workOrders/errors";
import type { StorageClient } from "@/lib/storage/supabase";

function createFakeStorageClient(): StorageClient & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    async putObject({ key, body }) {
      objects.set(key, body);
    },
    async getObject(key) {
      const body = objects.get(key);
      return body ? { body, contentType: "image/jpeg" } : null;
    },
    async deleteObject(key) {
      objects.delete(key);
    },
  };
}

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_evidences", "work_order_items", "work_orders",
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
    `TRUNCATE "work_order_evidences", "work_order_items", "work_orders", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo J" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIJ1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

const fakeFile = Buffer.from("conteudo-fake-de-imagem");

describe("criação de evidência — sempre permitida, aceite registrado ou não (DEC-J5)", () => {
  it("permite criar evidência antes do aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );
    expect(evidence.type).toBe("GERAL");
    expect(storage.objects.has(evidence.storageKey)).toBe(true);
  });

  it("permite criar evidência depois do aceite (adicionar nunca é bloqueado)", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });
    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "AVARIA", description: "Risco na porta", mimeType: "image/png", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );
    expect(evidence.type).toBe("AVARIA");
    expect(evidence.description).toBe("Risco na porta");
  });

  it("rejeita formato de arquivo não aceito", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    await expect(
      createWorkOrderEvidenceService(
        actorUserId,
        os.workOrder.id,
        { type: "GERAL", mimeType: "application/pdf", fileSize: 100 },
        fakeFile,
        storage,
      ),
    ).rejects.toThrow();
  });

  it("rejeita arquivo acima de 10MB", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    await expect(
      createWorkOrderEvidenceService(
        actorUserId,
        os.workOrder.id,
        { type: "GERAL", mimeType: "image/jpeg", fileSize: 11 * 1024 * 1024 },
        fakeFile,
        storage,
      ),
    ).rejects.toThrow();
  });
});

describe("mutabilidade — trava no aceite, adicionar sempre permitido (DEC-J5)", () => {
  it("permite excluir evidência antes do aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );
    await deleteWorkOrderEvidenceService(actorUserId, os.workOrder.id, evidence.id, storage);
    const remaining = await listWorkOrderEvidencesService(os.workOrder.id);
    expect(remaining).toHaveLength(0);
    expect(storage.objects.has(evidence.storageKey)).toBe(false);
  });

  it("bloqueia excluir evidência já existente depois do aceite", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });

    await expect(
      deleteWorkOrderEvidenceService(actorUserId, os.workOrder.id, evidence.id, storage),
    ).rejects.toThrow(WorkOrderEvidenceLockedError);

    const remaining = await listWorkOrderEvidencesService(os.workOrder.id);
    expect(remaining).toHaveLength(1);
    expect(storage.objects.has(evidence.storageKey)).toBe(true);
  });

  it("cenário completo do exemplo combinado: 4 fotos -> aceite -> 5ª permitida, as 4 originais intocadas", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    const original = [];
    for (let i = 0; i < 4; i++) {
      original.push(
        await createWorkOrderEvidenceService(
          actorUserId,
          os.workOrder.id,
          { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
          fakeFile,
          storage,
        ),
      );
    }
    await registerWorkOrderReceptionAcceptanceService(actorUserId, os.workOrder.id, { receptionAcceptedName: "Cliente Teste" });

    const fifth = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "GERAL", description: "Lado traseiro (esquecida antes)", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );

    const all = await listWorkOrderEvidencesService(os.workOrder.id);
    expect(all).toHaveLength(5);
    for (const ev of original) {
      expect(all.find((e) => e.id === ev.id)).toBeDefined();
    }
    expect(all.find((e) => e.id === fifth.id)?.description).toBe("Lado traseiro (esquecida antes)");
  });
});

describe("escopo — evidência de uma OS nunca aparece/afeta outra", () => {
  it("excluir com workOrderId errado não encontra a evidência", async () => {
    const osA = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const c2 = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo J 2" });
    const v2 = await createVehicleService(actorUserId, { customerId: c2.id, plate: "CIJ1002" });
    const osB = await createWorkOrderWithoutQuoteService(actorUserId, { customerId: c2.id, vehicleId: v2.id, mileageAtEntry: 2000 });

    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      osA.workOrder.id,
      { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );

    await expect(
      deleteWorkOrderEvidenceService(actorUserId, osB.workOrder.id, evidence.id, storage),
    ).rejects.toThrow(WorkOrderEvidenceNotFoundError);
  });
});

describe("auditoria", () => {
  it("grava WORK_ORDER_EVIDENCE_CREATED e WORK_ORDER_EVIDENCE_DELETED", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    const storage = createFakeStorageClient();
    const evidence = await createWorkOrderEvidenceService(
      actorUserId,
      os.workOrder.id,
      { type: "GERAL", mimeType: "image/jpeg", fileSize: fakeFile.length },
      fakeFile,
      storage,
    );
    await deleteWorkOrderEvidenceService(actorUserId, os.workOrder.id, evidence.id, storage);

    const logs = await pool.query(
      `SELECT action FROM audit_logs WHERE "entityId" = $1 ORDER BY "createdAt" ASC`,
      [os.workOrder.id],
    );
    const actions = logs.rows.map((r) => r.action);
    expect(actions).toContain("WORK_ORDER_EVIDENCE_CREATED");
    expect(actions).toContain("WORK_ORDER_EVIDENCE_DELETED");
  });
});

describe("regressão — gate de aceite de recepção e demais ciclos continuam intocados", () => {
  it("gate de EM_EXECUCAO sem aceite continua bloqueando", async () => {
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });
    await expect(setWorkOrderStatusService(actorUserId, os.workOrder.id, "EM_EXECUCAO")).rejects.toThrow();
  });
});
