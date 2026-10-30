import { z } from "zod";
import {
  findCustomerById,
  findCustomersByPhone,
  searchCustomers,
  type CustomerRecord,
} from "@/lib/db/repositories/customers";
import { findVehicleById, findVehicleByPlate, listVehiclesByCustomer, type VehicleRecord } from "@/lib/db/repositories/vehicles";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createQuoteService, deleteQuoteService } from "@/lib/quotes/service";
import {
  RetroactiveServiceError,
  RetroactiveServiceIncompleteError,
  registerCompletedServiceFromQuoteService,
} from "@/lib/workOrders/retroactive";
import { computeQuoteTotals, lineTotalCents, reaisToCents } from "@/lib/money";
import { isPlausiblePhone, normalizePhone } from "@/lib/validation/phone";
import { isValidPlate, normalizePlate, formatPlate } from "@/lib/validation/plate";
import { quoteItemInputSchema } from "@/lib/validation/quote";

/** Erro de validação com mensagem já pronta para o usuário. */
export class QuickRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickRegistrationError";
  }
}

// ============================================================
// Cadastro mínimo: nome + telefone / modelo + placa
// ============================================================

/** "(62) 99999-0000" -> "62999990000"; tira o 55 do país se vier junto. */
function phoneDigits(raw: string): string {
  let d = normalizePhone(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}

export function vehicleLabel(v: Pick<VehicleRecord, "plate" | "brand" | "model">): string {
  return [v.plate ? formatPlate(v.plate) : "Sem placa", [v.brand, v.model].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" — ");
}

export interface CustomerLookup {
  customer: { id: string; name: string };
  vehicles: { id: string; label: string }[];
}

/** Procura cliente (ativo) pelo telefone/WhatsApp e já traz os veículos ativos dele. */
export async function lookupCustomerByPhoneService(rawPhone: string): Promise<CustomerLookup | null> {
  const digits = phoneDigits(rawPhone ?? "");
  if (!isPlausiblePhone(digits)) return null;
  const found = (await findCustomersByPhone(digits)).find((c) => c.status === "ATIVO");
  if (!found) return null;
  const vehicles = (await listVehiclesByCustomer(found.id)).filter((v) => v.status === "ATIVO");
  return {
    customer: { id: found.id, name: found.legalName },
    vehicles: vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) })),
  };
}

export interface CustomerSuggestion {
  id: string;
  name: string;
  phone: string | null;
}

/** Busca clientes ativos pelo nome (ou parte dele) para a Venda rápida. */
export async function searchCustomersByNameService(rawQuery: string): Promise<CustomerSuggestion[]> {
  const query = (rawQuery ?? "").trim();
  if (query.length < 2) return [];
  const { items } = await searchCustomers({ query, status: "ATIVO", limit: 6 });
  return items.map((c) => ({ id: c.id, name: c.legalName, phone: c.whatsapp || c.phone || null }));
}

/** Traz um cliente escolhido na busca por nome, com seus veículos ativos. */
export async function lookupCustomerByIdService(customerId: string): Promise<CustomerLookup | null> {
  const found = await findCustomerById(customerId);
  if (!found || found.status !== "ATIVO") return null;
  const vehicles = (await listVehiclesByCustomer(found.id)).filter((v) => v.status === "ATIVO");
  return {
    customer: { id: found.id, name: found.legalName },
    vehicles: vehicles.map((v) => ({ id: v.id, label: vehicleLabel(v) })),
  };
}

const quickCustomerSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome do cliente"),
  phone: z.string().trim().optional(),
});

export interface QuickCustomerResult {
  customer: CustomerRecord;
  /** true = já existia um cliente com esse telefone e ele foi reaproveitado. */
  reused: boolean;
}

/**
 * Cadastro mínimo de cliente (Pessoa Física): só nome e, se tiver, telefone.
 * Se já existir cliente ativo com esse telefone, reaproveita em vez de duplicar.
 * O resto do cadastro (CPF, endereço…) completa-se depois, na aba Clientes.
 */
export async function createQuickCustomerService(actorUserId: string, rawInput: unknown): Promise<QuickCustomerResult> {
  const input = quickCustomerSchema.parse(rawInput);
  const phone = input.phone ? phoneDigits(input.phone) : "";
  if (phone && !isPlausiblePhone(phone)) {
    throw new QuickRegistrationError("Telefone inválido — use DDD + número (ex.: 62 99999-0000).");
  }

  if (phone) {
    const existing = (await findCustomersByPhone(phone)).find((c) => c.status === "ATIVO");
    if (existing) return { customer: existing, reused: true };
  }

  const customer = await createCustomerService(
    actorUserId,
    {
      type: "PF",
      legalName: input.name,
      phone: phone || undefined,
      whatsapp: phone || undefined,
    },
    { preRegistration: true },
  );
  return { customer, reused: false };
}

const quickVehicleSchema = z.object({
  customerId: z.string().min(1, "Selecione o cliente"),
  model: z.string().trim().optional(),
  plate: z.string().trim().optional(),
  year: z.string().trim().optional(),
});

export interface QuickVehicleResult {
  vehicle: VehicleRecord;
  reused: boolean;
}

/**
 * Cadastro mínimo de veículo: modelo e/ou placa. Reaproveita o veículo se a
 * placa já é deste cliente, ou se o cliente já tem um com o mesmo modelo (sem
 * placa informada). Placa que já é de OUTRO cliente é recusada com aviso.
 */
export async function createQuickVehicleService(actorUserId: string, rawInput: unknown): Promise<QuickVehicleResult> {
  const input = quickVehicleSchema.parse(rawInput);
  const model = input.model?.trim() || undefined;
  const plate = input.plate?.trim() ? normalizePlate(input.plate) : undefined;

  if (!model && !plate) throw new QuickRegistrationError("Informe o modelo ou a placa do veículo.");
  if (plate && !isValidPlate(plate)) {
    throw new QuickRegistrationError("Placa inválida (use o formato ABC1234 ou ABC1D23).");
  }
  const customer = await findCustomerById(input.customerId);
  if (!customer) throw new QuickRegistrationError("Cliente não encontrado.");

  if (plate) {
    const byPlate = await findVehicleByPlate(plate);
    if (byPlate) {
      if (byPlate.customerId === customer.id) return { vehicle: byPlate, reused: true };
      const owner = await findCustomerById(byPlate.customerId);
      throw new QuickRegistrationError(
        `A placa ${formatPlate(plate)} já está cadastrada para ${owner?.legalName ?? "outro cliente"}. ` +
          `Confira a placa ou use "Transferir veículo" na aba Veículos.`,
      );
    }
  } else if (model) {
    const same = (await listVehiclesByCustomer(customer.id)).find(
      (v) => v.status === "ATIVO" && !v.plate && (v.model ?? "").trim().toLowerCase() === model.toLowerCase(),
    );
    if (same) return { vehicle: same, reused: true };
  }

  let yearModel: number | undefined;
  if (input.year) {
    const y = Number(input.year);
    if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear() + 1) {
      throw new QuickRegistrationError("Ano do modelo inválido (use 4 dígitos, ex.: 2012).");
    }
    yearModel = y;
  }
  const vehicle = await createVehicleService(actorUserId, { customerId: customer.id, plate, model, yearModel });
  return { vehicle, reused: false };
}

// ============================================================
// Venda rápida: cliente + carro + itens + pagamento numa tela só
// ============================================================

const quickSaleSchema = z.object({
  /** Cliente que já existe (vindo da busca por telefone)… */
  existingCustomerId: z.string().trim().optional(),
  /** …ou os dados mínimos para achar/criar um. */
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  existingVehicleId: z.string().trim().optional(),
  vehicleModel: z.string().trim().optional(),
  vehiclePlate: z.string().trim().optional(),
  items: z.array(quoteItemInputSchema).min(1, "Adicione pelo menos um item"),
  /** Desconto opcional: percentual (ex.: 10) ou valor fixo em reais. */
  discountType: z.enum(["PERCENTUAL", "FIXO"]).optional(),
  discountValue: z.union([z.string(), z.number()]).optional(),
  discountReason: z.string().trim().optional(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do serviço"),
  /** Horário opcional (HH:MM). Sem ele: hoje = agora; dia anterior = 12:00. */
  serviceTime: z.string().trim().optional(),
  mileageAtEntry: z.union([z.string(), z.number()]).optional(),
  executedBy: z.string().trim().min(1, "Selecione quem executou"),
  deliveryAcceptedName: z.string().trim().optional(),
  payments: z
    .array(
      z.object({
        method: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
        amountReais: z.union([z.string(), z.number()]),
      }),
    )
    .default([]),
});

export interface QuickSaleResult {
  workOrderId: string;
  workOrderNumber: string;
  quoteId: string;
  customerId: string;
  customerReused: boolean;
  vehicleReused: boolean;
  totalCents: number;
  paidCents: number;
}

/**
 * Venda rápida: acha ou cria cliente e veículo (cadastro mínimo, sem duplicar),
 * monta o orçamento e usa o MESMO fluxo do "serviço já concluído e pago" para
 * aprovar, criar a OS, executar, entregar, receber e ajustar as datas. O
 * resultado é um cadastro de verdade, igual ao caminho completo.
 *
 * Valida o que dá antes de criar o orçamento. Se o fluxo falhar antes de a OS
 * existir, o rascunho do orçamento é apagado (não fica lixo); cliente e veículo
 * criados ficam, porque são cadastros legítimos.
 */
export async function quickSaleService(actorUserId: string, rawInput: unknown): Promise<QuickSaleResult> {
  const input = quickSaleSchema.parse(rawInput);

  // Pré-validação barata: pagamentos x total (mesma conta do fechamento).
  const lines = input.items.map((i) => {
    const unit = reaisToCents(i.unitPriceReais);
    return { type: i.type, totalCents: lineTotalCents(i.quantity, unit), category: i.category };
  });
  const discountNumber =
    input.discountValue === undefined || input.discountValue === ""
      ? NaN
      : Number(String(input.discountValue).replace(",", "."));
  const hasDiscount = Boolean(input.discountType) && Number.isFinite(discountNumber) && discountNumber > 0;
  const total = computeQuoteTotals({
    items: lines.filter((l) => l.category !== "INFORMATIVO").map((l) => ({ type: l.type, totalCents: l.totalCents })),
    discountType: hasDiscount ? input.discountType! : null,
    discountValue: hasDiscount
      ? input.discountType === "PERCENTUAL"
        ? Math.round(discountNumber * 100)
        : reaisToCents(discountNumber)
      : null,
    surchargeType: null,
    surchargeValue: null,
  }).totalCents;
  const paid = input.payments.reduce((s, p) => s + reaisToCents(p.amountReais), 0);
  if (paid <= 0) throw new QuickRegistrationError("Informe o valor pago.");
  if (paid > total) throw new QuickRegistrationError("A soma dos pagamentos é maior que o total da venda.");

  // 1) Cliente
  let customer: CustomerRecord;
  let customerReused = true;
  if (input.existingCustomerId) {
    const found = await findCustomerById(input.existingCustomerId);
    if (!found || found.status !== "ATIVO") throw new QuickRegistrationError("Cliente não encontrado ou inativo.");
    customer = found;
  } else {
    if (!input.customerName) throw new QuickRegistrationError("Informe o nome do cliente.");
    const created = await createQuickCustomerService(actorUserId, {
      name: input.customerName,
      phone: input.customerPhone,
    });
    customer = created.customer;
    customerReused = created.reused;
  }

  // 2) Veículo
  let vehicle: VehicleRecord;
  let vehicleReused = true;
  if (input.existingVehicleId) {
    const found = await findVehicleById(input.existingVehicleId);
    if (!found || found.customerId !== customer.id) {
      throw new QuickRegistrationError("O veículo escolhido não pertence a este cliente.");
    }
    vehicle = found;
  } else {
    const created = await createQuickVehicleService(actorUserId, {
      customerId: customer.id,
      model: input.vehicleModel,
      plate: input.vehiclePlate,
    });
    vehicle = created.vehicle;
    vehicleReused = created.reused;
  }

  // 3) Orçamento (rascunho) com os itens
  const quote = await createQuoteService(actorUserId, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    items: input.items,
    discount: hasDiscount ? { type: input.discountType, value: discountNumber, reason: input.discountReason || undefined } : undefined,
  });

  // 4) Aprova, cria a OS, executa, entrega, recebe e ajusta as datas
  try {
    const done = await registerCompletedServiceFromQuoteService(actorUserId, quote.quote.id, {
      serviceDate: input.serviceDate,
      serviceTime: input.serviceTime || undefined,
      mileageAtEntry: input.mileageAtEntry,
      executedBy: input.executedBy,
      deliveryAcceptedName: input.deliveryAcceptedName?.trim() || customer.legalName,
      payments: input.payments,
    });
    return {
      workOrderId: done.workOrderId,
      workOrderNumber: done.workOrderNumber,
      quoteId: quote.quote.id,
      customerId: customer.id,
      customerReused,
      vehicleReused,
      totalCents: done.totalCents,
      paidCents: done.paidCents,
    };
  } catch (err) {
    // Falhou antes de existir OS (validação/estoque/executor): não deixa rascunho solto.
    if (!(err instanceof RetroactiveServiceIncompleteError)) {
      try {
        await deleteQuoteService(actorUserId, quote.quote.id);
      } catch {
        /* se não der para apagar, o rascunho fica visível em Orçamentos */
      }
    }
    if (err instanceof RetroactiveServiceError) throw new QuickRegistrationError(err.message);
    throw err;
  }
}
