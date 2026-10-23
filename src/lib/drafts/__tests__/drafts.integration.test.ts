import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { createUser } from "@/lib/db/repositories/users";
import {
  DraftError,
  deleteDraftService,
  draftResumeHref,
  getDraftService,
  listDraftsService,
  saveDraftService,
} from "../service";

let actorUserId: string;

async function cleanAll() {
  await pool.query(`TRUNCATE "drafts", "audit_logs", "user_roles", "role_permissions", "users", "roles", "permissions" CASCADE`);
}

beforeAll(async () => {
  await cleanAll();
  actorUserId = (await createUser({ name: "Testador", email: "dr@teste.com", passwordHash: await hashPassword("senhaTeste123") })).id;
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("rascunhos (Salvar e continuar depois)", () => {
  it("cria, lê de volta o mesmo conteúdo e atualiza o mesmo rascunho", async () => {
    const payload = { customer: { id: "c1", label: "Cliente" }, items: [{ description: "Troca de óleo", quantity: "1" }], step: 2 };
    const created = await saveDraftService(actorUserId, { kind: "QUOTE", title: "Orçamento — Cliente", payload });
    expect(created.id).toBeTruthy();

    const read = await getDraftService(created.id);
    expect(read?.payload).toEqual(payload);

    const updated = await saveDraftService(actorUserId, { id: created.id, kind: "QUOTE", title: "Orçamento — Cliente (2)", payload: { ...payload, step: 3 } });
    expect(updated.id).toBe(created.id);
    expect((await getDraftService(created.id))?.payload).toMatchObject({ step: 3 });
    expect((await listDraftsService()).filter((d) => d.id === created.id)).toHaveLength(1);
  });

  it("lista os mais recentes primeiro e o link de retomada leva ao formulário certo", async () => {
    const a = await saveDraftService(actorUserId, { kind: "PURCHASE", title: "Compra A", payload: { x: 1 } });
    const list = await listDraftsService();
    expect(list[0].id).toBe(a.id);
    expect(draftResumeHref(a)).toBe(`/dashboard/estoque/compra?rascunho=${a.id}`);
  });

  it("descartar apaga o rascunho", async () => {
    const d = await saveDraftService(actorUserId, { kind: "QUICK_SALE", title: "Venda", payload: {} });
    await deleteDraftService(d.id);
    expect(await getDraftService(d.id)).toBeNull();
  });

  it("recusa tipo inválido, tipo trocado e conteúdo grande demais", async () => {
    await expect(saveDraftService(actorUserId, { kind: "OUTRO", title: "x", payload: {} })).rejects.toThrow(DraftError);
    const d = await saveDraftService(actorUserId, { kind: "WORK_ORDER", title: "OS", payload: {} });
    await expect(saveDraftService(actorUserId, { id: d.id, kind: "QUOTE", title: "x", payload: {} })).rejects.toThrow(/outro tipo/);
    await expect(
      saveDraftService(actorUserId, { kind: "QUOTE", title: "grande", payload: { texto: "a".repeat(250_000) } }),
    ).rejects.toThrow(/grande demais/);
  });

  it("rascunhos esquecidos há mais de 60 dias são apagados ao listar", async () => {
    const old = await saveDraftService(actorUserId, { kind: "QUOTE", title: "Antigo", payload: {} });
    await pool.query(`UPDATE drafts SET "updatedAt" = NOW() - interval '61 days' WHERE id = $1`, [old.id]);
    await listDraftsService();
    expect(await getDraftService(old.id)).toBeNull();
  });
});
