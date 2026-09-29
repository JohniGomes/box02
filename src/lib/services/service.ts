import {
  createService,
  findServiceById,
  listActiveServices,
  searchServices,
  setServiceProcedureAndChecklist,
  setServiceStatus,
  updateService,
  type SearchServicesFilters,
  type ServiceRecord,
} from "@/lib/db/repositories/services";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { serviceInputSchema, type ServiceInput } from "@/lib/validation/service";
import { reaisToCents } from "@/lib/money";
import { ServiceNotActiveError, ServiceNotFoundError } from "./errors";
import { getDefaultMarkupPercent } from "@/lib/settings/service";
import { calcularPrecoSugerido, type SuggestedPriceResult } from "@/lib/services/pricing";

function toDefaultPriceCents(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  return reaisToCents(value);
}

/** Ciclo H — mesmo padrão de toDefaultPriceCents, para o custo interno. */
function toCostCents(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  return reaisToCents(value);
}

export async function createServiceService(actorUserId: string, rawInput: unknown): Promise<ServiceRecord> {
  const input = serviceInputSchema.parse(rawInput) as ServiceInput;

  const service = await createService({
    name: input.name,
    category: input.category ?? null,
    defaultPriceCents: toDefaultPriceCents(input.defaultPriceReais),
    costCents: toCostCents(input.costReais),
  });

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_CREATED",
    entityType: "service",
    entityId: service.id,
    metadata: { name: service.name },
  });

  return service;
}

export async function updateServiceService(
  actorUserId: string,
  serviceId: string,
  rawInput: unknown,
): Promise<ServiceRecord> {
  const input = serviceInputSchema.parse(rawInput) as ServiceInput;

  const existing = await findServiceById(serviceId);
  if (!existing) throw new ServiceNotFoundError(serviceId);

  const updated = await updateService(serviceId, {
    name: input.name,
    category: input.category ?? null,
    defaultPriceCents: toDefaultPriceCents(input.defaultPriceReais),
    costCents: toCostCents(input.costReais),
  });
  if (!updated) throw new ServiceNotFoundError(serviceId);

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_UPDATED",
    entityType: "service",
    entityId: serviceId,
    metadata: { name: updated.name },
  });

  return updated;
}

/** Inativa — nunca apaga fisicamente. */
export async function inactivateServiceService(actorUserId: string, serviceId: string): Promise<ServiceRecord> {
  const updated = await setServiceStatus(serviceId, "INATIVO");
  if (!updated) throw new ServiceNotFoundError(serviceId);

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_INACTIVATED",
    entityType: "service",
    entityId: serviceId,
  });

  return updated;
}

/** Reativa a MESMA linha — nunca cria um serviço novo. */
export async function reactivateServiceService(actorUserId: string, serviceId: string): Promise<ServiceRecord> {
  const updated = await setServiceStatus(serviceId, "ATIVO");
  if (!updated) throw new ServiceNotFoundError(serviceId);

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_REACTIVATED",
    entityType: "service",
    entityId: serviceId,
  });

  return updated;
}

/**
 * Ciclo H — preço sugerido de um serviço, seguindo a precedência
 * aprovada (H4-D1): defaultPriceCents (manual) vence sobre o calculado
 * por custo+markup; sem nenhum dos dois, retorna null (sem sugestão).
 * Nunca grava nada — só leitura combinada para exibição/prefill.
 */
export async function getSuggestedPriceForService(service: ServiceRecord): Promise<SuggestedPriceResult | null> {
  const markupPercent = await getDefaultMarkupPercent();
  return calcularPrecoSugerido({
    defaultPriceCents: service.defaultPriceCents,
    costCents: service.costCents,
    markupPercent,
  });
}

export async function getServiceService(serviceId: string): Promise<ServiceRecord | null> {
  return findServiceById(serviceId);
}

export async function searchServicesService(filters: SearchServicesFilters) {
  return searchServices(filters);
}

/** Usada pelo seletor de serviço (Ciclo B) no orçamento/OS/adicional —
 * só serviços ATIVOS aparecem como opção para novos itens. */
export async function listActiveServicesService(): Promise<ServiceRecord[]> {
  return listActiveServices();
}

/**
 * Regra crítica do Ciclo B, validada SEMPRE no servidor (nunca confia
 * que a interface só ofereceu serviços ativos para seleção): se um item
 * de orçamento/OS/adicional referencia um `serviceId`, esse serviço
 * precisa existir e estar ATIVO no momento da criação. Retorna o
 * registro do serviço para quem chamou usar como sugestão de
 * preenchimento — nunca é usado para sobrescrever o que o usuário já
 * decidiu digitar.
 */
export async function assertServiceIsActive(serviceId: string): Promise<ServiceRecord> {
  const service = await findServiceById(serviceId);
  if (!service) throw new ServiceNotFoundError(serviceId);
  if (service.status !== "ATIVO") throw new ServiceNotActiveError();
  return service;
}

/**
 * Ciclo D — associa/desassocia procedimento e checklist de execução a um
 * serviço. Ambos opcionais, `null` desassocia explicitamente. Nenhuma
 * validação de "checklist precisa ser tipo EXECUCAO" é feita aqui de
 * propósito — a UI só oferece checklists EXECUCAO no seletor, mas
 * associar um de outro tipo não corrompe nada (o campo é só uma
 * referência opcional; o Ciclo E é quem decide o que fazer com ela).
 */
export async function setServiceProcedureAndChecklistService(
  actorUserId: string,
  serviceId: string,
  input: { procedureId?: string | null; executionChecklistId?: string | null },
): Promise<ServiceRecord> {
  const existing = await findServiceById(serviceId);
  if (!existing) throw new ServiceNotFoundError(serviceId);

  const updated = await setServiceProcedureAndChecklist(serviceId, input);
  if (!updated) throw new ServiceNotFoundError(serviceId);

  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_PROCEDURE_CHECKLIST_SET",
    entityType: "service",
    entityId: serviceId,
    metadata: input,
  });

  return updated;
}
