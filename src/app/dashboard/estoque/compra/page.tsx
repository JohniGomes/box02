import Link from "next/link";
import { listPartsWithStockService } from "@/lib/inventory/service";
import { listRecentPurchasesService, listSuppliersService } from "@/lib/purchases/service";
import { formatBRL } from "@/lib/money";
import { PurchaseForm } from "./PurchaseForm";

export default async function RegistrarCompraPage() {
  const [parts, suppliers, recent] = await Promise.all([
    listPartsWithStockService(),
    listSuppliersService(true),
    listRecentPurchasesService(10),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/estoque" className="text-sm text-muted hover:underline">
        ← Estoque
      </Link>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Registrar compra</h1>
        <p className="mt-1 text-sm text-muted">
          Lança de uma vez a entrada das peças no estoque e o pagamento ao fornecedor (em Despesas, categoria
          Fornecedores/Peças). Serve para peças e insumos.
        </p>
      </div>

      <PurchaseForm
        parts={parts.filter((p) => p.status === "ATIVO").map((p) => ({ id: p.id, name: p.name, isConsumable: p.isConsumable }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />

      {recent.length > 0 ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-semibold">Últimas compras</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {recent.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="font-medium">{p.supplierName ?? "Sem fornecedor"}</p>
                  <p className="text-xs text-muted">
                    {p.purchaseDate.split("-").reverse().join("/")} · {p.itemCount}{" "}
                    {p.itemCount === 1 ? "item" : "itens"} ·{" "}
                    {p.expenseCount === 0
                      ? "sem despesa"
                      : p.expenseCount === 1
                        ? "1 despesa"
                        : `${p.expenseCount} parcelas`}
                  </p>
                </div>
                <span className="font-semibold">{formatBRL(p.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
