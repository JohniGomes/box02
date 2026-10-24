"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createSupplierService,
  setSupplierStatusService,
  updateSupplierService,
} from "@/lib/purchases/service";
import { InvalidPurchaseError, SupplierNotFoundError } from "@/lib/purchases/errors";

export interface SupplierActionResult {
  success: boolean;
  error?: string;
}

async function requireUser(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
}

function friendly(err: unknown, fallback: string): SupplierActionResult {
  if (err instanceof InvalidPurchaseError || err instanceof SupplierNotFoundError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

function done(): SupplierActionResult {
  revalidatePath("/dashboard/configuracoes/fornecedores");
  revalidatePath("/dashboard/estoque/compra");
  revalidatePath("/dashboard/despesas");
  return { success: true };
}

export async function createSupplierAction(input: { name: string; phone?: string; notes?: string }): Promise<SupplierActionResult> {
  try {
    await requireUser();
    await createSupplierService(input.name, { phone: input.phone, notes: input.notes });
    return done();
  } catch (err) {
    return friendly(err, "Não foi possível cadastrar o fornecedor.");
  }
}

export async function updateSupplierAction(
  id: string,
  input: { name: string; phone?: string; notes?: string },
): Promise<SupplierActionResult> {
  try {
    await requireUser();
    await updateSupplierService(id, input);
    return done();
  } catch (err) {
    return friendly(err, "Não foi possível salvar o fornecedor.");
  }
}

export async function setSupplierStatusAction(id: string, status: "ATIVO" | "INATIVO"): Promise<SupplierActionResult> {
  try {
    await requireUser();
    await setSupplierStatusService(id, status);
    return done();
  } catch (err) {
    return friendly(err, "Não foi possível alterar o fornecedor.");
  }
}
