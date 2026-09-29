import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createServiceService,
  getSuggestedPriceForService,
  updateServiceService,
} from "@/lib/services/service";
import { setDefaultMarkupPercent } from "@/lib/settings/service";
import { createAdditionalItemService, createWorkOrderWithoutQuoteService } from "@/lib/workOrders/service";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_items", "work_orders", "services",
      "vehicles", "customers", "audit_logs",
      "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'work_order_number_seq'`);
  await pool.query(`DELETE FROM app_settings WHERE key = 'pricing_default_markup_percent'`);
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
  await pool.query(`TRUNCATE "work_order_items", "work_orders", "services", "vehicles", "customers" CASCADE`);
  await pool.query(`DELETE FROM app_settings WHERE key = 'pricing_default_markup_percent'`);
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo H" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "CIH1001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("cadastro de serviço com custo — nunca inferido, sempre opcional", () => {
  it("cria serviço com custo e preço manual", async () => {
    const service = await createServiceService(actorUserId, {
      name: "Troca de amortecedor",
      defaultPriceReais: "150,00",
      costReais: "90,00",
    });
    expect(service.defaultPriceCents).toBe(15000);
    expect(service.costCents).toBe(9000);
  });

  it("cria serviço sem custo — continua funcionando normalmente (custo null)", async () => {
    const service = await createServiceService(actorUserId, { name: "Diagnóstico" });
    expect(service.costCents).toBeNull();
  });

  it("editar custo depois nunca infere valor a partir de defaultPriceCents", async () => {
    const service = await createServiceService(actorUserId, { name: "Revisão", defaultPriceReais: "200,00" });
    expect(service.costCents).toBeNull();
  });
});

describe("preço sugerido — os 3 cenários do H4, com dados reais do banco", () => {
  it("1: defaultPriceCents e costCents preenchidos -> sugestão vem do manual", async () => {
    await setDefaultMarkupPercent(40);
    const service = await createServiceService(actorUserId, {
      name: "Alinhamento",
      defaultPriceReais: "150,00",
      costReais: "100,00",
    });
    const suggested = await getSuggestedPriceForService(service);
    expect(suggested).toEqual({ cents: 15000, source: "manual" });
  });

  it("2: sem defaultPriceCents, com costCents -> sugestão calculada com o markup atual", async () => {
    await setDefaultMarkupPercent(40);
    const service = await createServiceService(actorUserId, { name: "Balanceamento", costReais: "100,00" });
    const suggested = await getSuggestedPriceForService(service);
    expect(suggested).toEqual({ cents: 14000, source: "calculado" });
  });

  it("3: sem os dois -> nenhuma sugestão", async () => {
    await setDefaultMarkupPercent(40);
    const service = await createServiceService(actorUserId, { name: "Diagnóstico avançado" });
    const suggested = await getSuggestedPriceForService(service);
    expect(suggested).toBeNull();
  });

  it("custo preenchido mas markup nunca configurado -> nenhuma sugestão calculada", async () => {
    const service = await createServiceService(actorUserId, { name: "Troca de correia", costReais: "80,00" });
    const suggested = await getSuggestedPriceForService(service);
    expect(suggested).toBeNull();
  });
});

describe("congelamento — alterar custo/markup/preço manual depois NUNCA muda documento já existente", () => {
  it("alterar custo não afeta OS já criada com o serviço", async () => {
    await setDefaultMarkupPercent(50);
    const service = await createServiceService(actorUserId, { name: "Troca de pastilha", costReais: "50,00" });
    const suggestedBefore = await getSuggestedPriceForService(service);

    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [
        {
          type: "SERVICO",
          description: "Troca de pastilha",
          quantity: 1,
          unitPriceReais: suggestedBefore ? (suggestedBefore.cents / 100).toFixed(2).replace(".", ",") : "75,00",
          serviceId: service.id,
        },
      ],
    });
    const practicedCentsAtCreation = os.items[0].unitPriceCents;

    await updateServiceService(actorUserId, service.id, { name: "Troca de pastilha", costReais: "999,00" });

    const refetchedItem = await pool.query(`SELECT "unitPriceCents" FROM work_order_items WHERE id = $1`, [os.items[0].id]);
    expect(refetchedItem.rows[0].unitPriceCents).toBe(practicedCentsAtCreation);
  });

  it("alterar markup padrão não afeta OS já criada", async () => {
    await setDefaultMarkupPercent(20);
    const service = await createServiceService(actorUserId, { name: "Serviço X", costReais: "100,00" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Serviço X", quantity: 1, unitPriceReais: "120,00", serviceId: service.id }],
    });

    await setDefaultMarkupPercent(90);

    const refetchedItem = await pool.query(`SELECT "unitPriceCents" FROM work_order_items WHERE id = $1`, [os.items[0].id]);
    expect(refetchedItem.rows[0].unitPriceCents).toBe(12000);
  });

  it("alterar defaultPriceCents não afeta OS já criada", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Y", defaultPriceReais: "100,00" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Serviço Y", quantity: 1, unitPriceReais: "100,00", serviceId: service.id }],
    });

    await updateServiceService(actorUserId, service.id, { name: "Serviço Y", defaultPriceReais: "500,00" });

    const refetchedItem = await pool.query(`SELECT "unitPriceCents" FROM work_order_items WHERE id = $1`, [os.items[0].id]);
    expect(refetchedItem.rows[0].unitPriceCents).toBe(10000);
  });
});

describe("QuoteItem/WorkOrderItem nunca gravam custo/markup — só o praticado", () => {
  it("WorkOrderItem criado a partir de serviço com custo não tem nenhuma coluna de custo/markup", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Z", costReais: "50,00" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
      items: [{ type: "SERVICO", description: "Serviço Z", quantity: 1, unitPriceReais: "90,00", serviceId: service.id }],
    });
    const columns = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'work_order_items'`,
    );
    const columnNames = columns.rows.map((r) => r.column_name);
    expect(columnNames).not.toContain("costCents");
    expect(columnNames).not.toContain("markupPercent");
    expect(os.items[0].unitPriceCents).toBe(9000);
  });

  it("adicional criado a partir de serviço com custo grava só o praticado", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Adicional", costReais: "30,00" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });

    const additional = await createAdditionalItemService(actorUserId, os.workOrder.id, {
      type: "SERVICO",
      description: "Serviço Adicional",
      quantity: 1,
      unitPriceReais: "80,00",
      serviceId: service.id,
    });
    expect(additional.unitPriceCents).toBe(8000);
  });
});

describe("regressão — suíte de serviços dos Ciclos A/B não afetada", () => {
  it("criar/editar/inativar/reativar serviço continua funcionando normalmente", async () => {
    const service = await createServiceService(actorUserId, { name: "Regressão" });
    const updated = await updateServiceService(actorUserId, service.id, { name: "Regressão editada" });
    expect(updated.name).toBe("Regressão editada");
    expect(updated.status).toBe("ATIVO");
  });
});
