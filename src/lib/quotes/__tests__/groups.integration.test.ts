import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import {
  createNewQuoteVersionService,
  createQuoteService,
  getActiveQuoteLinkService,
  getQuoteService,
  resolveQuoteAccessTokenService,
  sendQuoteVersionService,
  submitPublicQuoteDecisionService,
  updateQuoteVersionService,
} from "../service";

let actorUserId: string;
let customerId: string;
let vehicleId: string;

async function cleanAll() {
  await pool.query(
    `TRUNCATE "quote_approvals", "quote_access_links", "quote_items", "quote_versions", "quotes",
      "vehicles", "customers", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`,
  );
  await pool.query(`DELETE FROM app_settings WHERE key = 'quote_number_seq'`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "gr@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
  customerId = (await createCustomerService(actorUserId, { type: "PF", legalName: "Cliente Blocos" })).id;
  vehicleId = (await createVehicleService(actorUserId, { customerId, plate: "GRP1A23" })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

const items = [
  { type: "SERVICO" as const, category: "NECESSARIO" as const, description: "Troca de pastilhas", quantity: 1, unitPriceReais: "100,00", groupKey: "g1" },
  { type: "PECA" as const, category: "NECESSARIO" as const, description: "Jogo de pastilhas", quantity: 1, unitPriceReais: "200,00", groupKey: "g1" },
  { type: "MAO_DE_OBRA" as const, category: "NECESSARIO" as const, description: "Mão de obra dos freios", quantity: 1, unitPriceReais: "80,00", groupKey: "g1" },
  { type: "SERVICO" as const, category: "RECOMENDADO" as const, description: "Alinhamento", quantity: 1, unitPriceReais: "90,00" },
];

describe("blocos do orçamento (serviço + peças + mão de obra)", () => {
  it("guarda o bloco, copia para a nova versão e a decisão do bloco vale para cada item", async () => {
    const created = await createQuoteService(actorUserId, { customerId, vehicleId, items });
    const stored = created.items;
    expect(stored.filter((i) => i.groupKey === "g1")).toHaveLength(3);
    expect(stored.find((i) => i.description === "Alinhamento")!.groupKey).toBeNull();

    // editar o rascunho mantém os blocos
    const edited = await updateQuoteVersionService(actorUserId, created.quote.id, { customerId, vehicleId, items });
    expect(edited.items.filter((i) => i.groupKey === "g1")).toHaveLength(3);

    await sendQuoteVersionService(actorUserId, created.quote.id);
    const full = await getQuoteService(created.quote.id);
    const link = await getActiveQuoteLinkService(full!.version.id);
    const resolution = await resolveQuoteAccessTokenService(link!.token);
    expect(resolution.kind).toBe("pending");

    // O cliente aprova o bloco inteiro e recusa o alinhamento: uma decisão por item, como sempre.
    const decisions = full!.items.map((i) => ({ itemId: i.id, decision: i.groupKey === "g1" ? ("APROVADO" as const) : ("RECUSADO" as const) }));
    const decided = await submitPublicQuoteDecisionService(link!.token, { itemDecisions: decisions, approverName: "Cliente Blocos" });
    expect(decided.status).toBe("APROVADO_PARCIAL");

    const after = await getQuoteService(created.quote.id);
    expect(after!.items.filter((i) => i.clientDecision === "APROVADO")).toHaveLength(3);
    expect(after!.items.filter((i) => i.clientDecision === "RECUSADO")).toHaveLength(1);

    // nova versão preserva os blocos
    const newer = await createNewQuoteVersionService(actorUserId, created.quote.id);
    expect(newer.items.filter((i) => i.groupKey === "g1")).toHaveLength(3);
  });
});
