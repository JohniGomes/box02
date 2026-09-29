"use server";

import { headers } from "next/headers";
import { ZodError } from "zod";
import { submitAdditionalItemDecisionService } from "@/lib/workOrders/service";
import {
  AdditionalItemAccessTokenNotFoundError,
  AdditionalItemAlreadyDecidedError,
} from "@/lib/workOrders/errors";

export interface SubmitDecisionResult {
  success: boolean;
  error?: string;
}

/**
 * Ação pública — deliberadamente SEM `auth()`, mesmo padrão do orçamento.
 * A única credencial exigida é o próprio `token`.
 */
export async function submitAdditionalItemDecisionAction(
  token: string,
  input: {
    decision: "APROVADO" | "RECUSADO";
    approverName: string;
    approverDocument?: string;
    notes?: string;
  },
): Promise<SubmitDecisionResult> {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      undefined;

    await submitAdditionalItemDecisionService(token, { ...input, ipAddress });
    return { success: true };
  } catch (err) {
    if (err instanceof ZodError) {
      const firstIssue = err.issues[0];
      const message =
        firstIssue?.path?.[0] === "approverDocument"
          ? "CPF/CNPJ informado é inválido. Confira os números ou deixe em branco."
          : "Dados inválidos. Confira as informações e tente novamente.";
      return { success: false, error: message };
    }
    if (err instanceof AdditionalItemAccessTokenNotFoundError || err instanceof AdditionalItemAlreadyDecidedError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar sua decisão. Tente novamente." };
  }
}
