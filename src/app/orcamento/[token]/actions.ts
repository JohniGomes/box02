"use server";

import { headers } from "next/headers";
import { ZodError } from "zod";
import { submitPublicQuoteDecisionService } from "@/lib/quotes/service";
import {
  QuoteAccessTokenNotFoundError,
  QuoteAlreadyDecidedError,
  QuoteItemsIncompleteDecisionError,
} from "@/lib/quotes/errors";

export interface SubmitDecisionResult {
  success: boolean;
  error?: string;
}

/**
 * Ação pública — deliberadamente SEM `auth()`. A única credencial exigida
 * é o próprio `token` (D2: cliente decide sem login). Ver
 * `submitPublicQuoteDecisionService` para as proteções reais (trava de
 * linha contra dupla submissão, checagem de item pendente, etc.).
 */
export async function submitQuoteDecisionAction(
  token: string,
  input: {
    itemDecisions: { itemId: string; decision: "APROVADO" | "RECUSADO" }[];
    approverName: string;
    approverDocument?: string;
    reason?: string;
    notes?: string;
  },
): Promise<SubmitDecisionResult> {
  try {
    const headerList = await headers();
    const ipAddress =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip") ??
      undefined;

    await submitPublicQuoteDecisionService(token, { ...input, ipAddress });
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
    if (
      err instanceof QuoteAccessTokenNotFoundError ||
      err instanceof QuoteAlreadyDecidedError ||
      err instanceof QuoteItemsIncompleteDecisionError
    ) {
      return { success: false, error: err.message };
    }
    return { success: false, error: "Não foi possível registrar sua decisão. Tente novamente." };
  }
}
