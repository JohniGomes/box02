import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/lib/db/pool";
import {
  createSupplierService,
  listSuppliersService,
  setSupplierStatusService,
  updateSupplierService,
} from "../service";
import { InvalidPurchaseError } from "../errors";

async function cleanAll() {
  await pool.query(`TRUNCATE "suppliers" CASCADE`);
}

beforeAll(async () => {
  await cleanAll();
});

afterAll(async () => {
  await cleanAll();
  await pool.end();
});

describe("cadastro de fornecedor", () => {
  it("cria com telefone e observação, edita e inativa sem sumir da lista completa", async () => {
    const s = await createSupplierService("Auto Bicos Injetores", { phone: "(62) 99999-0000", notes: "Reparo de bicos" });
    expect(s).toMatchObject({ name: "Auto Bicos Injetores", phone: "62999990000", notes: "Reparo de bicos", status: "ATIVO" });

    const edited = await updateSupplierService(s.id, { name: "Auto Bicos Injetores Ltda", phone: "6233334444", notes: "" });
    expect(edited).toMatchObject({ name: "Auto Bicos Injetores Ltda", phone: "6233334444", notes: null });

    await setSupplierStatusService(s.id, "INATIVO");
    expect((await listSuppliersService(true)).map((x) => x.id)).not.toContain(s.id);
    expect((await listSuppliersService(false)).map((x) => x.id)).toContain(s.id);
  });

  it("não duplica pelo nome, recusa nome repetido na edição e telefone inválido", async () => {
    const a = await createSupplierService("GT Distribuidora");
    const again = await createSupplierService("  gt distribuidora ");
    expect(again.id).toBe(a.id);

    const b = await createSupplierService("Loja do Zé");
    await expect(updateSupplierService(b.id, { name: "GT Distribuidora" })).rejects.toThrow(InvalidPurchaseError);
    await expect(createSupplierService("Fulano de Tal", { phone: "123" })).rejects.toThrow(/Telefone inválido/);
  });

  it("fornecedor sem telefone continua válido (telefone é opcional)", async () => {
    const s = await createSupplierService("Fornecedor sem telefone");
    expect(s.phone).toBeNull();
  });
});
