import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createServiceService, inactivateServiceService, reactivateServiceService } from "@/lib/services/service";
import { updateService } from "@/lib/db/repositories/services";
import {
  createQuoteService,
  updateQuoteVersionService,
  submitPublicQuoteDecisionService,
  sendQuoteVersionService,
  getActiveQuoteLinkService,
} from "@/lib/quotes/service";
import {
  createAdditionalItemService,
  createWorkOrderFromQuoteService,
  createWorkOrderWithoutQuoteService,
} from "@/lib/workOrders/service";
import { ServiceNotActiveError, ServiceNotFoundError } from "@/lib/services/errors";

async function cleanAll() {
  await pool.query(
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "services", "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key LIKE 'quote_number_seq_%' OR key = 'work_order_number_seq'`);
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
    `TRUNCATE "work_order_closures", "work_order_items", "work_orders",
      "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "services", "vehicles", "customers" CASCADE`,
  );
  const c = await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Ciclo B" });
  const v = await createVehicleService(actorUserId, { customerId: c.id, plate: "SVB-0001" });
  customerId = c.id;
  vehicleId = v.id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("regra crítica 1 — servidor valida serviceId ATIVO, nunca confia na interface", () => {
  it("rejeita item de orçamento com serviceId inexistente", async () => {
    await expect(
      createQuoteService(actorUserId, {
        customerId,
        vehicleId,
        items: [
          {
            type: "SERVICO", category: "NECESSARIO",
            description: "Qualquer",
            quantity: 1,
            unitPriceReais: "100,00",
            serviceId: "id-que-nao-existe",
          },
        ],
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it("rejeita item de orçamento com serviceId de serviço INATIVO", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Inativo Teste", defaultPriceReais: "100,00" });
    await inactivateServiceService(actorUserId, service.id);

    await expect(
      createQuoteService(actorUserId, {
        customerId,
        vehicleId,
        items: [
          { type: "SERVICO", category: "NECESSARIO", description: "Qualquer", quantity: 1, unitPriceReais: "100,00", serviceId: service.id },
        ],
      }),
    ).rejects.toThrow(ServiceNotActiveError);
  });

  it("rejeita item de OS sem orçamento com serviceId inativo", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Inativo OS" });
    await inactivateServiceService(actorUserId, service.id);

    await expect(
      createWorkOrderWithoutQuoteService(actorUserId, {
        customerId,
        vehicleId,
        mileageAtEntry: 1000,
        items: [
          { type: "SERVICO", category: "NECESSARIO", description: "Qualquer", quantity: 1, unitPriceReais: "100,00", serviceId: service.id },
        ],
      }),
    ).rejects.toThrow(ServiceNotActiveError);
  });

  it("rejeita adicional com serviceId inativo", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Inativo Adicional" });
    await inactivateServiceService(actorUserId, service.id);

    const os = await createWorkOrderWithoutQuoteService(actorUserId, {
      customerId,
      vehicleId,
      mileageAtEntry: 1000,
    });

    await expect(
      createAdditionalItemService(actorUserId, os.workOrder.id, {
        type: "PECA", category: "NECESSARIO",
        description: "Qualquer",
        quantity: 1,
        unitPriceReais: "100,00",
        serviceId: service.id,
      }),
    ).rejects.toThrow(ServiceNotActiveError);
  });

  it("aceita item sem serviceId (personalizado) normalmente, sem nenhuma checagem", async () => {
    const result = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Item personalizado", quantity: 1, unitPriceReais: "80,00" }],
    });
    expect(result.items[0].serviceId).toBeNull();
  });
});

describe("preenchimento a partir do catálogo — sempre editável, sempre congelado", () => {
  it("cria item de orçamento com serviceId, description e unitPriceCents definidos pelo que foi ENVIADO, não recalculados", async () => {
    const service = await createServiceService(actorUserId, { name: "Alinhamento", defaultPriceReais: "120,00" });

    const result = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        {
          type: "SERVICO", category: "NECESSARIO",
          description: "Alinhamento 3D + cambagem",
          quantity: 1,
          unitPriceReais: "150,00",
          serviceId: service.id,
        },
      ],
    });

    expect(result.items[0].serviceId).toBe(service.id);
    expect(result.items[0].description).toBe("Alinhamento 3D + cambagem");
    expect(result.items[0].unitPriceCents).toBe(15000);
  });

  it("serviço sem preço padrão: aceita seleção, nasce só com a descrição — preço é o que o usuário informar", async () => {
    const service = await createServiceService(actorUserId, { name: "Diagnóstico sem preço" });
    expect(service.defaultPriceCents).toBeNull();

    const result = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Diagnóstico sem preço", quantity: 1, unitPriceReais: "0", serviceId: service.id },
      ],
    });
    expect(result.items[0].serviceId).toBe(service.id);
  });
});

describe("CENÁRIO CRÍTICO — alteração do catálogo nunca afeta orçamento/OS já criados", () => {
  it("R$150 -> editar para R$170 -> catálogo muda para R$200 -> converter em OS -> OS permanece R$170", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Crítico", defaultPriceReais: "150,00" });

    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [
        { type: "SERVICO", category: "NECESSARIO", description: "Serviço Crítico", quantity: 1, unitPriceReais: "170,00", serviceId: service.id },
      ],
    });
    expect(quote.items[0].unitPriceCents).toBe(17000);

    await sendQuoteVersionService(actorUserId, quote.quote.id);
    const versionRow = (await pool.query(`SELECT id FROM quote_versions WHERE "quoteId" = $1`, [quote.quote.id])).rows[0];
    const link = await getActiveQuoteLinkService(versionRow.id);
    const quoteItemRow = (
      await pool.query(`SELECT id FROM quote_items WHERE "quoteVersionId" = $1`, [versionRow.id])
    ).rows[0];
    await submitPublicQuoteDecisionService(link!.token, {
      itemDecisions: [{ itemId: quoteItemRow.id, decision: "APROVADO" }],
      approverName: "Cliente Crítico",
    });

    await updateService(service.id, { defaultPriceCents: 20000 });

    const os = await createWorkOrderFromQuoteService(actorUserId, quote.quote.id, { mileageAtEntry: 500 });

    expect(os.items).toHaveLength(1);
    expect(os.items[0].unitPriceCents).toBe(17000);
    expect(os.items[0].serviceId).toBe(service.id);
    expect(os.items[0].description).toBe("Serviço Crítico");
  });

  it("alterar preço do catálogo depois de um item criado: item antigo mantém o preço antigo; item novo reflete o novo", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Preço Teste", defaultPriceReais: "100,00" });

    const quoteAntigo = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço Preço Teste", quantity: 1, unitPriceReais: "100,00", serviceId: service.id }],
    });

    await updateService(service.id, { defaultPriceCents: 13000 });

    const antigoRefetched = await pool.query(`SELECT "unitPriceCents" FROM quote_items WHERE id = $1`, [
      quoteAntigo.items[0].id,
    ]);
    expect(antigoRefetched.rows[0].unitPriceCents).toBe(10000);

    const quoteNovo = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço Preço Teste", quantity: 1, unitPriceReais: "130,00", serviceId: service.id }],
    });
    expect(quoteNovo.items[0].unitPriceCents).toBe(13000);
  });

  it("alterar descrição do catálogo depois de um item criado: item antigo mantém a descrição antiga; item novo reflete a nova", async () => {
    const service = await createServiceService(actorUserId, { name: "Alinhamento" });

    const quoteAntigo = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Alinhamento", quantity: 1, unitPriceReais: "100,00", serviceId: service.id }],
    });

    await updateService(service.id, { name: "Alinhamento 3D" });

    const antigoRefetched = await pool.query(`SELECT description FROM quote_items WHERE id = $1`, [
      quoteAntigo.items[0].id,
    ]);
    expect(antigoRefetched.rows[0].description).toBe("Alinhamento");

    const quoteNovo = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Alinhamento 3D", quantity: 1, unitPriceReais: "100,00", serviceId: service.id }],
    });
    expect(quoteNovo.items[0].description).toBe("Alinhamento 3D");
  });
});

describe("serviços inativos/reativados — nunca aparecem para novo lançamento, histórico intocado", () => {
  it("serviço inativado após uso: item histórico continua íntegro; novo lançamento com ele é rejeitado; reativado volta a funcionar", async () => {
    const service = await createServiceService(actorUserId, { name: "Serviço Ciclo Vida", defaultPriceReais: "90,00" });

    const quote1 = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço Ciclo Vida", quantity: 1, unitPriceReais: "90,00", serviceId: service.id }],
    });

    await inactivateServiceService(actorUserId, service.id);

    const refetched = await pool.query(`SELECT "unitPriceCents", description, "serviceId" FROM quote_items WHERE id = $1`, [
      quote1.items[0].id,
    ]);
    expect(refetched.rows[0].unitPriceCents).toBe(9000);
    expect(refetched.rows[0].serviceId).toBe(service.id);

    await expect(
      createQuoteService(actorUserId, {
        customerId,
        vehicleId,
        items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço Ciclo Vida", quantity: 1, unitPriceReais: "90,00", serviceId: service.id }],
      }),
    ).rejects.toThrow(ServiceNotActiveError);

    await reactivateServiceService(actorUserId, service.id);
    const quote2 = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Serviço Ciclo Vida", quantity: 1, unitPriceReais: "90,00", serviceId: service.id }],
    });
    expect(quote2.items[0].serviceId).toBe(service.id);
  });
});

describe("edição de orçamento em rascunho também valida serviceId", () => {
  it("rejeita editar um rascunho adicionando item com serviço inativo", async () => {
    const quote = await createQuoteService(actorUserId, {
      customerId,
      vehicleId,
      items: [{ type: "SERVICO", category: "NECESSARIO", description: "Item inicial", quantity: 1, unitPriceReais: "50,00" }],
    });

    const service = await createServiceService(actorUserId, { name: "Serviço Editado Inativo" });
    await inactivateServiceService(actorUserId, service.id);

    await expect(
      updateQuoteVersionService(actorUserId, quote.quote.id, {
        items: [
          { type: "SERVICO", category: "NECESSARIO", description: "Item inicial", quantity: 1, unitPriceReais: "50,00" },
          { type: "PECA", category: "NECESSARIO", description: "Novo item", quantity: 1, unitPriceReais: "30,00", serviceId: service.id },
        ],
      }),
    ).rejects.toThrow(ServiceNotActiveError);
  });
});

describe("adicional durante execução com serviço do catálogo", () => {
  it("cria adicional com serviceId, mantendo description/preço editáveis e congelados normalmente", async () => {
    const service = await createServiceService(actorUserId, { name: "Bucha da bandeja", defaultPriceReais: "350,00" });
    const os = await createWorkOrderWithoutQuoteService(actorUserId, { customerId, vehicleId, mileageAtEntry: 1000 });

    const item = await createAdditionalItemService(actorUserId, os.workOrder.id, {
      type: "PECA", category: "NECESSARIO",
      description: "Bucha da bandeja dianteira",
      quantity: 1,
      unitPriceReais: "380,00",
      serviceId: service.id,
    });

    expect(item.serviceId).toBe(service.id);
    expect(item.unitPriceCents).toBe(38000);
    expect(item.description).toBe("Bucha da bandeja dianteira");

    await updateService(service.id, { defaultPriceCents: 50000 });
    const refetched = await pool.query(`SELECT "unitPriceCents" FROM work_order_items WHERE id = $1`, [item.id]);
    expect(refetched.rows[0].unitPriceCents).toBe(38000);
  });
});
