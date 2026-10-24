import { z } from "zod";
import { withTransaction } from "@/lib/db/transaction";
import { deleteKitItems, insertKitItems, listKitItems } from "@/lib/db/repositories/serviceKits";
import { findServiceById } from "@/lib/db/repositories/services";
import { findPartById } from "@/lib/db/repositories/parts";
import { getPartSuggestedSalePriceService } from "@/lib/inventory/service";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { centsToReais, reaisToCents } from "@/lib/money";

export class ServiceKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceKitError";
  }
}

/** Uma linha do kit, pronta para entrar num orçamento (tudo continua editável). */
export interface KitLineToApply {
  type: "PECA" | "MAO_DE_OBRA";
  description: string;
  quantity: string;
  /** Vazio quando é "vaga a escolher do estoque". */
  unitPriceReais: string;
  partId?: string;
  /** Peça que depende do veículo: a pessoa escolhe a peça do estoque depois. */
  slot: boolean;
}

/**
 * Linhas do kit de um serviço. Só LÊ: não grava nada no orçamento e não mexe
 * no estoque. Peça genérica vem com o preço sugerido de hoje; peça que depende
 * do veículo vem como vaga sem peça nem preço.
 */
export async function getServiceKitToApplyService(serviceId: string): Promise<KitLineToApply[]> {
  const items = await listKitItems(serviceId);
  const lines: KitLineToApply[] = [];
  for (const item of items) {
    if (item.type === "MAO_DE_OBRA") {
      lines.push({
        type: "MAO_DE_OBRA",
        description: item.description,
        quantity: String(Number(item.quantity)),
        unitPriceReais: item.unitPriceCents != null ? centsToReais(item.unitPriceCents) : "",
        slot: false,
      });
      continue;
    }
    const part = item.partId ? await findPartById(item.partId) : null;
    if (part && part.status === "ATIVO") {
      const suggested = await getPartSuggestedSalePriceService(part.id);
      lines.push({
        type: "PECA",
        description: part.name,
        quantity: String(Number(item.quantity)),
        unitPriceReais: suggested ? centsToReais(suggested.cents) : "",
        partId: part.id,
        slot: false,
      });
    } else {
      // Sem peça (ou peça inativa): vaga a escolher do estoque.
      lines.push({ type: "PECA", description: item.description, quantity: String(Number(item.quantity)), unitPriceReais: "", slot: true });
    }
  }
  return lines;
}

const saveKitSchema = z.object({
  lines: z
    .array(
      z.object({
        type: z.enum(["PECA", "MAO_DE_OBRA"]),
        description: z.string().trim().min(2, "Descreva a linha do kit"),
        quantity: z.union([z.string(), z.number()]),
        unitPriceReais: z.union([z.string(), z.number()]).optional(),
        partId: z.string().trim().optional(),
        /** Peça genérica (óleo, filtro, fluido): guarda a peça. Desmarcado = vaga a escolher. */
        fixedPart: z.boolean().optional(),
      }),
    )
    .min(1, "O kit precisa de pelo menos uma linha"),
});

/** Salva (substitui) o kit de um serviço a partir das linhas de um orçamento. */
export async function saveServiceKitService(actorUserId: string, serviceId: string, rawInput: unknown): Promise<number> {
  const input = saveKitSchema.parse(rawInput);
  const service = await findServiceById(serviceId);
  if (!service) throw new ServiceKitError("Serviço não encontrado.");

  const prepared = await Promise.all(
    input.lines.map(async (l) => {
      const quantity = typeof l.quantity === "string" ? Number(l.quantity.replace(",", ".")) : l.quantity;
      if (!Number.isFinite(quantity) || quantity <= 0) throw new ServiceKitError("Quantidade inválida em uma linha do kit.");
      if (l.type === "MAO_DE_OBRA") {
        const cents = l.unitPriceReais !== undefined && l.unitPriceReais !== "" ? reaisToCents(l.unitPriceReais) : null;
        return { type: "MAO_DE_OBRA" as const, description: l.description, quantity, partId: null, unitPriceCents: cents };
      }
      const keepPart = Boolean(l.fixedPart && l.partId && (await findPartById(l.partId)));
      return { type: "PECA" as const, description: l.description, quantity, partId: keepPart ? (l.partId as string) : null, unitPriceCents: null };
    }),
  );

  await withTransaction(async (client) => {
    await deleteKitItems(serviceId, client);
    await insertKitItems(serviceId, prepared, client);
  });
  await recordAuditLog({
    userId: actorUserId,
    action: "SERVICE_KIT_SAVED",
    entityType: "service",
    entityId: serviceId,
    metadata: { lines: prepared.length },
  });
  return prepared.length;
}

export async function deleteServiceKitService(actorUserId: string, serviceId: string): Promise<void> {
  await deleteKitItems(serviceId);
  await recordAuditLog({ userId: actorUserId, action: "SERVICE_KIT_DELETED", entityType: "service", entityId: serviceId });
}

/** Kit como está salvo, para mostrar na tela do serviço. */
export async function listServiceKitService(serviceId: string) {
  const items = await listKitItems(serviceId);
  return Promise.all(
    items.map(async (i) => ({
      id: i.id,
      type: i.type,
      description: i.description,
      quantity: Number(i.quantity),
      priceCents: i.unitPriceCents,
      partName: i.partId ? ((await findPartById(i.partId))?.name ?? null) : null,
    })),
  );
}
