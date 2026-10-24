import { withTransaction } from "@/lib/db/transaction";
import { recordAuditLog } from "@/lib/db/repositories/auditLog";
import { createExpense, markExpenseAsPaid } from "@/lib/db/repositories/expenses";
import {
  createPart,
  findPartByIdForUpdate,
  findPartByName,
  setPartCost,
} from "@/lib/db/repositories/parts";
import { createPurchase, listRecentPurchases, type PurchaseRecord } from "@/lib/db/repositories/purchases";
import { createStockMovement } from "@/lib/db/repositories/stockMovements";
import {
  createSupplier,
  findSupplierById,
  findSupplierByName,
  listSuppliers,
  setSupplierStatus,
  type SupplierRecord,
} from "@/lib/db/repositories/suppliers";
import { noonInBrasilia, todayInBrasilia } from "@/lib/expenses/dates";
import { DuplicatePartNameError, PartNotActiveError, PartNotFoundError } from "@/lib/inventory/errors";
import { resolveEventInstant } from "@/lib/dateBr";
import { markupPercentForPrice, reaisToCents } from "@/lib/money";
import { registerPurchaseSchema } from "@/lib/validation/purchase";
import { InvalidPurchaseError, SupplierNotFoundError } from "./errors";

/** Soma `months` meses a uma data AAAA-MM-DD mantendo o dia original (31/01 + 1 = 28/02, + 2 = 31/03). */
export function addMonthsKeepingDay(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Divide `total` em `n` parcelas inteiras; a sobra de centavos vai para a primeira. */
export function splitInstallments(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + remainder : base));
}

export interface PurchaseResult {
  purchase: PurchaseRecord;
  itemCount: number;
  expenseCount: number;
  /** Ids das peças de cada item, na ordem em que foram informados. */
  partIds: string[];
}

/**
 * Registra uma compra de peças/insumos: dá a ENTRADA de cada item no estoque
 * (criando a peça se for nova e atualizando o custo), e cria a(s) despesa(s)
 * de Fornecedores/Peças ligadas à compra, conforme o pagamento escolhido.
 * Tudo numa transação só — se algo falhar, nada é gravado.
 */
export async function registerPurchaseService(actorUserId: string, rawInput: unknown): Promise<PurchaseResult> {
  const input = registerPurchaseSchema.parse(rawInput);
  const today = todayInBrasilia();
  if (input.purchaseDate > today) throw new InvalidPurchaseError("A data da compra não pode ser no futuro.");

  const prepared = input.items.map((item) => {
    const totalCents = reaisToCents(item.totalReais);
    if (!(totalCents > 0)) throw new InvalidPurchaseError("Informe quanto foi pago em cada item (maior que zero).");
    return { item, totalCents, unitCostCents: Math.max(1, Math.round(totalCents / item.quantity)) };
  });
  const itemsTotalCents = prepared.reduce((sum, p) => sum + p.totalCents, 0);

  const adjustmentCents =
    input.adjustmentReais === undefined || String(input.adjustmentReais).trim() === ""
      ? 0
      : reaisToCents(input.adjustmentReais);
  const totalCents = itemsTotalCents + adjustmentCents;
  if (totalCents <= 0) throw new InvalidPurchaseError("O total da compra precisa ser maior que zero.");

  const { payment } = input;
  if (payment.mode === "PAGO") {
    if (!payment.method) throw new InvalidPurchaseError("Escolha a forma de pagamento.");
    if (payment.paidOn && payment.paidOn > today) throw new InvalidPurchaseError("A data do pagamento não pode ser no futuro.");
  }
  if (payment.mode === "DEPOIS" && !payment.dueDate) {
    throw new InvalidPurchaseError("Informe o vencimento (da primeira parcela).");
  }

  return withTransaction(async (client) => {
    // Fornecedor
    let supplier: SupplierRecord | null = null;
    if (input.supplierId) {
      supplier = await findSupplierById(input.supplierId, client);
      if (!supplier || supplier.status !== "ATIVO") throw new SupplierNotFoundError();
    } else if (input.newSupplierName) {
      supplier =
        (await findSupplierByName(input.newSupplierName, client)) ??
        (await createSupplier(input.newSupplierName, client));
    }

    const purchase = await createPurchase(
      {
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        purchaseDate: input.purchaseDate,
        itemsTotalCents,
        adjustmentCents,
        totalCents,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
      },
      client,
    );

    // Itens -> peças + entradas de estoque
    const names: string[] = [];
    const partIds: string[] = [];
    for (const { item, unitCostCents } of prepared) {
      let partId: string;
      let partName: string;
      if (item.partId) {
        const part = await findPartByIdForUpdate(item.partId, client);
        if (!part) throw new PartNotFoundError(item.partId);
        if (part.status !== "ATIVO") throw new PartNotActiveError();
        await setPartCost(part.id, unitCostCents, client);
        partId = part.id;
        partName = part.name;
      } else {
        const name = item.newPartName as string;
        if (name.length < 2) throw new InvalidPurchaseError("Informe o nome da peça nova.");
        if (await findPartByName(name, client)) throw new DuplicatePartNameError(name);
        let markupPercent: number | null = null;
        const priceRaw = item.newPartPriceReais;
        if (priceRaw !== undefined && String(priceRaw).trim() !== "") {
          const m = markupPercentForPrice(unitCostCents, reaisToCents(priceRaw));
          if (m === null || m < 0) throw new InvalidPurchaseError(`O preço de venda de "${name}" não pode ser menor que o custo.`);
          markupPercent = m;
        }
        const part = await createPart(
          {
            name,
            costCents: unitCostCents,
            markupPercent,
            unit: "un",
            isConsumable: Boolean(item.newPartIsConsumable),
          },
          client,
        );
        partId = part.id;
        partName = part.name;
      }
      await createStockMovement(
        {
          partId,
          type: "ENTRADA",
          quantity: item.quantity,
          reason: `Compra${supplier ? ` — ${supplier.name}` : ""}`,
          purchaseId: purchase.id,
          createdByUserId: actorUserId,
        },
        client,
      );
      names.push(partName);
      partIds.push(partId);
    }

    // Despesa(s)
    const summary = names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}`;
    const baseDescription = `Compra${supplier ? ` em ${supplier.name}` : ""}: ${summary}`;
    let expenseCount = 0;

    if (payment.mode === "PAGO") {
      const paidOn = payment.paidOn ?? input.purchaseDate;
      const expense = await createExpense(
        {
          category: "FORNECEDORES",
          description: baseDescription,
          supplierName: supplier?.name ?? null,
          amountCents: totalCents,
          dueDate: paidOn,
          notes: input.notes ?? null,
          purchaseId: purchase.id,
          createdByUserId: actorUserId,
        },
        client,
      );
      await markExpenseAsPaid(
        expense.id,
        { paidAt: resolveEventInstant(paidOn), paymentMethod: payment.method! },
        client,
      );
      expenseCount = 1;
    } else if (payment.mode === "DEPOIS") {
      const n = payment.installments;
      const parts = splitInstallments(totalCents, n);
      for (let i = 0; i < n; i++) {
        await createExpense(
          {
            category: "FORNECEDORES",
            description: n > 1 ? `${baseDescription} (parcela ${i + 1}/${n})` : baseDescription,
            supplierName: supplier?.name ?? null,
            amountCents: parts[i],
            dueDate: addMonthsKeepingDay(payment.dueDate as string, i),
            notes: input.notes ?? null,
            purchaseId: purchase.id,
            createdByUserId: actorUserId,
          },
          client,
        );
      }
      expenseCount = n;
    }

    await recordAuditLog({
      userId: actorUserId,
      action: "PURCHASE_REGISTERED",
      entityType: "purchase",
      entityId: purchase.id,
      metadata: {
        supplierName: supplier?.name ?? null,
        totalCents,
        itemCount: prepared.length,
        paymentMode: payment.mode,
        expenseCount,
      },
    });

    return { purchase, itemCount: prepared.length, expenseCount, partIds };
  });
}

export async function listSuppliersService(onlyActive = true): Promise<SupplierRecord[]> {
  return listSuppliers(onlyActive);
}

export async function createSupplierService(rawName: string): Promise<SupplierRecord> {
  const name = (rawName ?? "").trim();
  if (name.length < 2) throw new InvalidPurchaseError("Informe o nome do fornecedor.");
  const existing = await findSupplierByName(name);
  if (existing) {
    if (existing.status === "INATIVO") return (await setSupplierStatus(existing.id, "ATIVO")) ?? existing;
    return existing;
  }
  return createSupplier(name);
}

export async function setSupplierStatusService(id: string, status: "ATIVO" | "INATIVO"): Promise<SupplierRecord> {
  const updated = await setSupplierStatus(id, status);
  if (!updated) throw new SupplierNotFoundError();
  return updated;
}

export async function listRecentPurchasesService(limit = 20) {
  return listRecentPurchases(limit);
}
