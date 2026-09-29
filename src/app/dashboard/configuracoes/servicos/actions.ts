"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { auth } from "@/auth";
import {
  createServiceService,
  getSuggestedPriceForService,
  inactivateServiceService,
  listActiveServicesService,
  reactivateServiceService,
  searchServicesService,
  setServiceProcedureAndChecklistService,
  updateServiceService,
} from "@/lib/services/service";
import { centsToReais } from "@/lib/money";
import { ServiceNotFoundError } from "@/lib/services/errors";
import { listActiveProceduresService } from "@/lib/checklists/procedureService";
import { searchChecklistsService } from "@/lib/checklists/checklistService";
import type { ServiceRecord } from "@/lib/db/repositories/services";

export interface ServiceActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  serviceId?: string;
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

function friendlyError(err: unknown, fallback: string): ServiceActionResult {
  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { success: false, error: "Existem campos inválidos.", fieldErrors };
  }
  if (err instanceof ServiceNotFoundError) {
    return { success: false, error: err.message };
  }
  return { success: false, error: fallback };
}

export async function createServiceAction(input: unknown): Promise<ServiceActionResult> {
  try {
    const userId = await requireUserId();
    const service = await createServiceService(userId, input);
    revalidatePath("/dashboard/configuracoes/servicos");
    return { success: true, serviceId: service.id };
  } catch (err) {
    return friendlyError(err, "Não foi possível criar o serviço.");
  }
}

export async function updateServiceAction(serviceId: string, input: unknown): Promise<ServiceActionResult> {
  try {
    const userId = await requireUserId();
    await updateServiceService(userId, serviceId, input);
    revalidatePath("/dashboard/configuracoes/servicos");
    revalidatePath(`/dashboard/configuracoes/servicos/${serviceId}`);
    return { success: true, serviceId };
  } catch (err) {
    return friendlyError(err, "Não foi possível atualizar o serviço.");
  }
}

export async function inactivateServiceAction(serviceId: string): Promise<ServiceActionResult> {
  try {
    const userId = await requireUserId();
    await inactivateServiceService(userId, serviceId);
    revalidatePath("/dashboard/configuracoes/servicos");
    revalidatePath(`/dashboard/configuracoes/servicos/${serviceId}`);
    return { success: true, serviceId };
  } catch (err) {
    return friendlyError(err, "Não foi possível inativar o serviço.");
  }
}

export async function reactivateServiceAction(serviceId: string): Promise<ServiceActionResult> {
  try {
    const userId = await requireUserId();
    await reactivateServiceService(userId, serviceId);
    revalidatePath("/dashboard/configuracoes/servicos");
    revalidatePath(`/dashboard/configuracoes/servicos/${serviceId}`);
    return { success: true, serviceId };
  } catch (err) {
    return friendlyError(err, "Não foi possível reativar o serviço.");
  }
}

/** Ciclo B — seletor de serviço reutilizável (orçamento/OS/adicional).
 * Só serviços ATIVOS — mesma garantia já dada por `listActiveServicesService`,
 * aqui só formatada para o componente de seleção. A validação real (que
 * impede um serviceId inativo de ser gravado) acontece no SERVIDOR, na
 * camada de serviço de orçamento/OS — esta busca é só conveniência de UI. */
export interface ServicePickerOption {
  id: string;
  label: string;
  category: string | null;
  defaultPriceReais: string | null;
  /** Ciclo H — preço sugerido efetivo (já aplicando a precedência
   * manual > calculado), e sua fonte, para exibição transparente no
   * seletor. `null`/`null` quando não há sugestão disponível (nem
   * preço manual, nem custo+markup) — comportamento idêntico ao
   * "Variável" já existente antes deste ciclo. */
  suggestedPriceReais: string | null;
  suggestedPriceSource: "manual" | "calculado" | null;
}

async function toPickerOption(s: ServiceRecord): Promise<ServicePickerOption> {
  const suggested = await getSuggestedPriceForService(s);
  return {
    id: s.id,
    label: s.name,
    category: s.category,
    defaultPriceReais: s.defaultPriceCents !== null ? centsToReais(s.defaultPriceCents) : null,
    suggestedPriceReais: suggested ? centsToReais(suggested.cents) : null,
    suggestedPriceSource: suggested ? suggested.source : null,
  };
}

export async function searchActiveServicesForPickerAction(query: string): Promise<ServicePickerOption[]> {
  await requireUserId();
  const { items } = await searchServicesService({ query, status: "ATIVO", limit: 20 });
  return Promise.all(items.map(toPickerOption));
}

/** Lista todos os ATIVOS sem filtro de busca — usada para exibir a lista
 * completa quando o seletor abre, antes do usuário digitar algo. */
export async function listActiveServicesForPickerAction(): Promise<ServicePickerOption[]> {
  await requireUserId();
  const services = await listActiveServicesService();
  return Promise.all(services.map(toPickerOption));
}

// ============================================================
// Ciclo D — associação de procedimento e checklist de execução
// ============================================================

export async function setServiceProcedureAndChecklistAction(
  serviceId: string,
  input: { procedureId?: string | null; executionChecklistId?: string | null },
): Promise<ServiceActionResult> {
  try {
    const userId = await requireUserId();
    await setServiceProcedureAndChecklistService(userId, serviceId, input);
    revalidatePath(`/dashboard/configuracoes/servicos/${serviceId}`);
    return { success: true, serviceId };
  } catch (err) {
    return friendlyError(err, "Não foi possível associar.");
  }
}

export async function listAssociationOptionsAction(): Promise<{
  procedures: { id: string; label: string }[];
  checklists: { id: string; label: string }[];
}> {
  await requireUserId();
  const [procedures, checklists] = await Promise.all([
    listActiveProceduresService(),
    searchChecklistsService({ type: "EXECUCAO", status: "ATIVO", limit: 100 }),
  ]);
  return {
    procedures: procedures.map((p) => ({ id: p.id, label: `${p.code} — ${p.title}` })),
    checklists: checklists.items.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` })),
  };
}
