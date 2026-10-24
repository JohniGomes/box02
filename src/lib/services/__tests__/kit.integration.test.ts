import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createServiceService } from "../service";
import { createPart } from "@/lib/db/repositories/parts";
import {
  deleteServiceKitService,
  getServiceKitToApplyService,
  listServiceKitService,
  saveServiceKitService,
} from "../kit";
import { laborToleranceWarning, blockFieldsOf } from "@/app/dashboard/orcamentos/itemBlocks";
import type { ItemDraft } from "@/app/dashboard/orcamentos/QuoteForm";

let actorUserId: string;
let serviceId: string;
let oilId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "service_kit_items", "stock_movements", "parts", "services", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "kit@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  serviceId = (await createServiceService(actorUserId, { name: "Troca de pastilhas", defaultPriceReais: "100,00" })).id;
  oilId = (await createPart({ name: "Fluido de freio DOT4", unit: "un" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("kit do serviço", () => {
  it("guarda mão de obra com valor, peça genérica fixa e peça do veículo como vaga; aplicar só lê", async () => {
    const saved = await saveServiceKitService(actorUserId, serviceId, {
      lines: [
        { type: "MAO_DE_OBRA", description: "Mão de obra dos freios", quantity: "1", unitPriceReais: "80,00" },
        { type: "PECA", description: "Fluido de freio DOT4", quantity: "1", partId: oilId, fixedPart: true },
        { type: "PECA", description: "Pastilha de freio", quantity: "1", unitPriceReais: "150,00" },
      ],
    });
    expect(saved).toBe(3);

    const lines = await getServiceKitToApplyService(serviceId);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ type: "MAO_DE_OBRA", unitPriceReais: "80,00", slot: false });
    expect(lines[1]).toMatchObject({ type: "PECA", partId: oilId, slot: false });
    // peça que depende do veículo: vaga, sem peça e sem preço guardado
    expect(lines[2]).toMatchObject({ type: "PECA", description: "Pastilha de freio", slot: true, unitPriceReais: "" });
    expect(lines[2].partId).toBeUndefined();

    // aplicar não grava nada no estoque
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_movements`)).rows[0].n).toBe(0);
  });

  it("salvar de novo substitui o kit e dá para apagar", async () => {
    await saveServiceKitService(actorUserId, serviceId, { lines: [{ type: "MAO_DE_OBRA", description: "Só mão de obra", quantity: "1", unitPriceReais: "50,00" }] });
    expect(await listServiceKitService(serviceId)).toHaveLength(1);
    await deleteServiceKitService(actorUserId, serviceId);
    expect(await listServiceKitService(serviceId)).toHaveLength(0);
  });
});

describe("aviso amarelo de mão de obra (tolerância de 20%)", () => {
  const head: ItemDraft = { key: "h", type: "SERVICO", description: "Pastilhas", quantity: "1", unitPriceReais: "100,00", category: "NECESSARIO", serviceId: "s", estimateReais: "100,00" };
  const labor = (price: string): ItemDraft => ({ key: "l", type: "MAO_DE_OBRA", description: "MO", quantity: "1", unitPriceReais: price, category: "NECESSARIO", groupKey: "h" });
  const third: ItemDraft = { key: "t", type: "SERVICO", description: "Serviço de terceiro repassado", quantity: "1", unitPriceReais: "900,00", category: "NECESSARIO", groupKey: "h" };

  it("dentro de 20% não avisa; fora avisa para mais e para menos; sem estimativa não avisa", () => {
    expect(laborToleranceWarning([head, labor("115,00")], head)).toBeNull();
    expect(laborToleranceWarning([head, labor("130,00")], head)).toMatch(/30% acima/);
    expect(laborToleranceWarning([head, labor("60,00")], head)).toMatch(/40% abaixo/);
    expect(laborToleranceWarning([{ ...head, estimateReais: undefined }, labor("500,00")], { ...head, estimateReais: undefined })).toBeNull();
  });

  it("só olha a linha de mão de obra: serviço de terceiro repassado não dispara o aviso", () => {
    expect(laborToleranceWarning([head, labor("100,00"), third], head)).toBeNull();
  });

  it("peças e mão de obra herdam a categoria do serviço e a chave do bloco", () => {
    const items: ItemDraft[] = [{ ...head, category: "RECOMENDADO" }, { ...labor("100,00"), category: "NECESSARIO" }];
    expect(blockFieldsOf(items, items[1])).toEqual({ groupKey: "h", category: "RECOMENDADO" });
    expect(blockFieldsOf(items, items[0])).toEqual({ groupKey: "h", category: "RECOMENDADO" });
  });
});
