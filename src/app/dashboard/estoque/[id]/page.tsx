import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPartCurrentStockService,
  getPartService,
  getPartSuggestedSalePriceService,
  listStockMovementsByPartService,
} from "@/lib/inventory/service";
import { formatBRL } from "@/lib/money";
import { StockMovementForm } from "../StockMovementForm";
import { PartStatusToggle } from "./PartStatusToggle";

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const part = await getPartService(id);
  if (!part) notFound();

  const [currentStock, movements, suggestedPrice] = await Promise.all([
    getPartCurrentStockService(id),
    listStockMovementsByPartService(id),
    getPartSuggestedSalePriceService(id),
  ]);

  const low = part.minStock !== null && currentStock <= part.minStock;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/dashboard/estoque" className="text-sm text-muted underline-offset-2 hover:underline">
          ← Estoque
        </Link>
        <Link
          href={`/dashboard/estoque/${part.id}/editar`}
          className="flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium"
        >
          Editar
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{part.name}</h1>
          <PartStatusToggle partId={part.id} status={part.status} />
        </div>
        {part.sku ? <p className="text-sm text-muted">SKU {part.sku}</p> : null}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted">Estoque atual</p>
            <p className={`mt-1 text-xl font-semibold ${low ? "text-danger" : ""}`}>
              {currentStock} <span className="text-xs font-normal text-muted">{part.unit}</span>
            </p>
            {low ? <p className="text-[11px] font-semibold text-danger">Abaixo do mínimo ({part.minStock})</p> : null}
          </div>
          <div className="rounded-xl bg-background p-3">
            <p className="text-xs text-muted">Custo unitário</p>
            <p className="mt-1 text-xl font-semibold">{part.costCents !== null ? formatBRL(part.costCents) : "—"}</p>
          </div>
        </div>

        {suggestedPrice ? (
          <div className="mt-3 rounded-xl bg-success/10 p-3">
            <p className="text-xs text-muted">
              Preço de venda sugerido · markup {suggestedPrice.markupPercent}% ({suggestedPrice.source})
            </p>
            <p className="mt-1 text-xl font-semibold text-success">{formatBRL(suggestedPrice.cents)}</p>
          </div>
        ) : part.costCents !== null ? (
          <p className="mt-3 text-xs text-muted">
            Sem preço de venda sugerido — cadastre um markup nesta peça ou configure o markup padrão em
            Configurações → Precificação.
          </p>
        ) : null}

        {part.notes ? <p className="mt-3 text-sm text-muted">{part.notes}</p> : null}
      </div>

      <StockMovementForm partId={part.id} unit={part.unit} />

      <div>
        <h2 className="mb-3 text-sm font-semibold">Histórico de movimentações</h2>
        {movements.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-5 text-center text-sm text-muted">
            Nenhuma movimentação registrada ainda.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {movements.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    <span className={m.type === "ENTRADA" ? "text-success" : "text-danger"}>
                      {m.type === "ENTRADA" ? "+" : "-"}
                      {m.quantity} {part.unit}
                    </span>
                  </p>
                  {m.reason ? <p className="text-xs text-muted">{m.reason}</p> : null}
                </div>
                <span className="text-xs text-muted">
                  {new Date(m.createdAt).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
