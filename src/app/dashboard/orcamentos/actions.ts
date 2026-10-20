"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  cancelQuoteVersionService,
  createNewQuoteVersionService,
  createQuoteService,
  deleteQuoteService,
  registerInternalQuoteDecisionService,
  sendQuoteVersionService,
  updateQuoteVersionService,
} from "@/lib/quotes/service";
import {
  InvalidQuoteTransitionError,
  QuoteItemsIncompleteDecisionError,
  QuoteNotDeletableError,
  QuoteNotFoundError,
  QuoteVersionNotEditableError,
  VehicleNotOwnedByCustomerError,
} from "@/lib/quotes/errors";
import { InsufficientStockError, PartNotActiveError, PartNotFoundError } from "@/lib/inventory/errors";
import {
  RetroactiveServiceError,
  RetroactiveServiceIncompleteError,
  registerCompletedServiceFromQuoteService,
} from "@/lib/workOrders/retroactive";
import { InvalidExecutorUserError, QuoteNotApprovedError } from "@/lib/workOrders/errors";
import { listVehiclesByCustomerService } from "@/lib/vehicles/service";
import { searchCustomersService } from "@/lib/customers/service";
import { formatPlate } from "@/lib/validation/plate";
import { formatDocument } from "@/lib/validation/document";

export interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  quoteId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Não autenticado.");
  }
  return session.user.id;
}

function toFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_root";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function mapKnownError(err: unknown, fallback: string): ActionResult {
  if (err instanceof ZodError) {
    return { success: false, error: "Existem campos inválidos.", fieldErrors: toFieldErrors(err) };
  }
  if (
    err instanceof VehicleNotOwnedByCustomerError ||
    err instanceof QuoteNotFoundError ||
    err instanceof QuoteVersionNotEditableError ||
    err instanceof InvalidQuoteTransitionError ||
    err instanceof QuoteItemsIncompleteDecisionError ||
    err instanceof QuoteNotDeletableError ||
    err instanceof PartNotActiveError ||
    err instanceof PartNotFoundError
  ) {
    return { success: false, error: err.message };
  }
  // Erro inesperado (banco, conexão…): registra no log do servidor e mostra o
  // motivo técnico, para não ficar só a mensagem genérica sem pista da causa.
  console.error(`[orcamentos] ${fallback}`, err);
  const detail = err instanceof Error && err.message ? ` (${err.message.slice(0, 200)})` : "";
  return { success: false, error: `${fallback}${detail}` };
}

export async function deleteQuoteAction(quoteId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await deleteQuoteService(userId, quoteId);
    revalidatePath("/dashboard/orcamentos");
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível excluir o orçamento.");
  }
}

export async function createQuoteAction(input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const result = await createQuoteService(userId, input);
    revalidatePath("/dashboard/orcamentos");
    return { success: true, quoteId: result.quote.id };
  } catch (err) {
    return mapKnownError(err, "Não foi possível salvar o orçamento.");
  }
}

export async function updateQuoteVersionAction(quoteId: string, input: unknown): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await updateQuoteVersionService(userId, quoteId, input);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível salvar as alterações.");
  }
}

export async function sendQuoteVersionAction(quoteId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await sendQuoteVersionService(userId, quoteId);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível enviar o orçamento.");
  }
}

/** Aprovação registrada pela oficina (presencial/telefone/serviço já feito),
 * sem depender do link público do cliente. */
export async function registerInternalQuoteDecisionAction(
  quoteId: string,
  input: unknown,
): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await registerInternalQuoteDecisionService(userId, quoteId, input);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível registrar a aprovação.");
  }
}

/** Serviço que já aconteceu e foi pago: aprova (se preciso), cria a OS,
 * executa, entrega, lança os pagamentos e ajusta as datas — tudo de uma vez. */
export async function registerCompletedServiceAction(
  quoteId: string,
  input: unknown,
): Promise<ActionResult & { workOrderId?: string }> {
  try {
    const userId = await requireUserId();
    const result = await registerCompletedServiceFromQuoteService(userId, quoteId, input);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    revalidatePath("/dashboard/os");
    return { success: true, quoteId, workOrderId: result.workOrderId };
  } catch (err) {
    if (
      err instanceof RetroactiveServiceError ||
      err instanceof RetroactiveServiceIncompleteError ||
      err instanceof QuoteNotApprovedError ||
      err instanceof InvalidExecutorUserError ||
      err instanceof InsufficientStockError
    ) {
      return { success: false, error: err.message };
    }
    return mapKnownError(err, "Não foi possível registrar o serviço concluído.");
  }
}

export async function createNewQuoteVersionAction(quoteId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await createNewQuoteVersionService(userId, quoteId);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível criar uma nova versão.");
  }
}

export async function cancelQuoteVersionAction(quoteId: string): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    await cancelQuoteVersionService(userId, quoteId);
    revalidatePath("/dashboard/orcamentos");
    revalidatePath(`/dashboard/orcamentos/${quoteId}`);
    return { success: true, quoteId };
  } catch (err) {
    return mapKnownError(err, "Não foi possível cancelar o orçamento.");
  }
}

export interface PickerOption {
  id: string;
  label: string;
}

/** Usado no passo 1 do formulário (escolher cliente). */
export async function searchCustomersForQuoteAction(query: string): Promise<PickerOption[]> {
  await requireUserId();
  const { items } = await searchCustomersService({ query, status: undefined, limit: 8 });
  return items.map((c) => ({
    id: c.id,
    label: c.document ? `${c.legalName} · ${formatDocument(c.document)}` : c.legalName,
  }));
}

export interface VehicleOption {
  id: string;
  label: string;
}

/** Usado no passo 2 do formulário (escolher veículo do cliente já selecionado). */
export async function listCustomerVehiclesAction(customerId: string): Promise<VehicleOption[]> {
  await requireUserId();
  const vehicles = await listVehiclesByCustomerService(customerId);
  return vehicles
    .filter((v) => v.status === "ATIVO")
    .map((v) => ({
      id: v.id,
      label: [
        v.plate ? formatPlate(v.plate) : "Sem placa",
        [v.brand, v.model].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(" — "),
    }));
}
