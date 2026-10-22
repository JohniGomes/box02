"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import { registerPurchaseService } from "@/lib/purchases/service";
import { InvalidPurchaseError, SupplierNotFoundError } from "@/lib/purchases/errors";
import { DuplicatePartNameError, PartNotActiveError, PartNotFoundError } from "@/lib/inventory/errors";

export interface PurchaseActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  summary?: { totalCents: number; itemCount: number; expenseCount: number };
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export async function registerPurchaseAction(input: unknown): Promise<PurchaseActionResult> {
  try {
    const userId = await requireUserId();
    const result = await registerPurchaseService(userId, input);
    revalidatePath("/dashboard/estoque");
    revalidatePath("/dashboard/despesas");
    revalidatePath("/dashboard");
    return {
      success: true,
      summary: {
        totalCents: result.purchase.totalCents,
        itemCount: result.itemCount,
        expenseCount: result.expenseCount,
      },
    };
  } catch (err) {
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_root";
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      const first = Object.values(fieldErrors)[0];
      return { success: false, error: first ?? "Existem campos inválidos.", fieldErrors };
    }
    if (
      err instanceof InvalidPurchaseError ||
      err instanceof SupplierNotFoundError ||
      err instanceof DuplicatePartNameError ||
      err instanceof PartNotFoundError ||
      err instanceof PartNotActiveError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar a compra." };
  }
}
