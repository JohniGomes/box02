"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { centsToReais, formatBRL, reaisToCents } from "@/lib/money";
import { readPurchaseInvoiceAction, registerPurchaseAction } from "./actions";
import type { PurchaseInvoice } from "@/lib/gemini/invoice";
import { fileToResizedJpegBase64 } from "@/lib/imageResize";
import { bestPartMatch, matchSupplier } from "@/lib/purchases/nameMatch";
import { DraftBar, useDraft } from "@/components/DraftControls";
import { useRememberedChoice } from "@/lib/useRemembered";

type PayMode = "PAGO" | "DEPOIS" | "NENHUM";
type Method = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";

const METHOD_LABEL: Record<Method, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

interface Row {
  key: string;
  kind: "STOCK" | "NEW";
  partId: string;
  newName: string;
  newConsumable: boolean;
  newPrice: string;
  quantity: string;
  total: string;
}

const NEW_SUPPLIER = "__novo__";

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function newRow(): Row {
  return {
    key: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    kind: "STOCK",
    partId: "",
    newName: "",
    newConsumable: false,
    newPrice: "",
    quantity: "1",
    total: "",
  };
}

/** "Preencher com foto da nota": a IA lê fornecedor, data, itens e valores; a pessoa confere e escolhe o pagamento. */
function InvoicePhotoButton({ onRead, info }: { onRead: (d: PurchaseInvoice) => void; info: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToResizedJpegBase64(file);
      const result = await readPurchaseInvoiceAction(base64, mimeType);
      if (!result.success || !result.data) {
        setError(result.error ?? "Não consegui ler a foto. Preencha à mão.");
      } else {
        onRead(result.data);
      }
    } catch {
      setError("Não consegui ler essa foto. Tente outra ou preencha à mão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-4">
      <label className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-accent/50 text-sm font-semibold text-accent">
        {busy ? "Lendo a nota…" : "Preencher com foto da nota"}
        <input type="file" accept="image/*" onChange={handleFile} disabled={busy} className="hidden" />
      </label>
      <p className="text-xs text-muted">
        A IA lê fornecedor, data, itens e valores da nota. Nada é registrado sem você conferir, e a foto não fica guardada. O pagamento
        (já paguei, depois ou parcelado) é sempre você que escolhe.
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {info ? <p className="rounded-lg bg-accent/10 px-3 py-2 text-xs">{info}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Mesma conta do servidor: divide em parcelas inteiras; a sobra vai para a primeira. */
function installmentValues(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + remainder : base));
}

export function PurchaseForm({
  parts,
  suppliers,
}: {
  parts: { id: string; name: string; isConsumable: boolean }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  const [supplierChoice, setSupplierChoice] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [adjustment, setAdjustment] = useState("");
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<PayMode>("PAGO");
  const [method, setMethodState] = useRememberedChoice("box02.lastPayMethod", "PIX", ["DINHEIRO", "PIX", "CARTAO", "OUTRO"]);
  const setMethod = (m: Method) => setMethodState(m);
  const [paidOn, setPaidOn] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [installments, setInstallments] = useState("1");

  const [invoiceInfo, setInvoiceInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ totalCents: number; itemCount: number; expenseCount: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  const itemsTotalCents = useMemo(
    () => rows.reduce((sum, r) => sum + Math.max(0, reaisToCents(r.total || "0")), 0),
    [rows],
  );
  const adjustmentCents = adjustment.trim() === "" ? 0 : reaisToCents(adjustment);
  const totalCents = itemsTotalCents + adjustmentCents;
  const n = Math.min(24, Math.max(1, Math.round(Number(installments) || 1)));

  const draft = useDraft({
    kind: "PURCHASE",
    getTitle: () => {
      const supplier = suppliers.find((s) => s.id === supplierChoice)?.name ?? newSupplier.trim();
      return `Compra${supplier ? ` — ${supplier}` : ""} (${rows.length} ${rows.length === 1 ? "item" : "itens"})`;
    },
    getPayload: () => ({ supplierChoice, newSupplier, purchaseDate, rows, adjustment, notes, mode, method: method as Method, paidOn, dueDate, installments }),
    applyPayload: (p: {
      supplierChoice: string;
      newSupplier: string;
      purchaseDate: string;
      rows: Row[];
      adjustment: string;
      notes: string;
      mode: PayMode;
      method: Method;
      paidOn: string;
      dueDate: string;
      installments: string;
    }) => {
      setSupplierChoice(p.supplierChoice ?? "");
      setNewSupplier(p.newSupplier ?? "");
      setPurchaseDate(p.purchaseDate ?? today);
      setRows(p.rows?.length ? p.rows : [newRow()]);
      setAdjustment(p.adjustment ?? "");
      setNotes(p.notes ?? "");
      setMode(p.mode ?? "PAGO");
      setMethod(p.method ?? "PIX");
      setPaidOn(p.paidOn ?? today);
      setDueDate(p.dueDate ?? "");
      setInstallments(p.installments ?? "1");
    },
  });

  /** Preenche com o que a nota trouxe; o que já estava digitado é mantido (as linhas da nota entram depois). */
  function applyInvoice(d: PurchaseInvoice) {
    if (d.fornecedor) {
      const match = matchSupplier(d.fornecedor, suppliers);
      if (match) {
        setSupplierChoice(match.id);
        setNewSupplier("");
      } else {
        setSupplierChoice(NEW_SUPPLIER);
        setNewSupplier(d.fornecedor);
      }
    }
    if (d.data) setPurchaseDate(d.data);
    let linked = 0;
    const fromInvoice: Row[] = d.itens.map((it) => {
      const match = bestPartMatch(it.descricao, parts);
      if (match) linked++;
      return {
        ...newRow(),
        kind: match ? "STOCK" : "NEW",
        partId: match?.id ?? "",
        newName: match ? "" : it.descricao,
        quantity: String(it.quantidade),
        total: it.totalCents !== null ? centsToReais(it.totalCents) : "",
      };
    });
    if (fromInvoice.length > 0) {
      setRows((prev) => {
        const untouched = prev.length === 1 && prev[0].kind === "STOCK" && !prev[0].partId && !prev[0].newName && !prev[0].total;
        return untouched ? fromInvoice : [...prev, ...fromInvoice];
      });
    }
    if (d.ajusteCents) setAdjustment(`${d.ajusteCents < 0 ? "-" : ""}${centsToReais(Math.abs(d.ajusteCents))}`);
    const n = d.itens.length;
    setInvoiceInfo(
      n === 0
        ? "Não achei itens legíveis na foto. Tente de novo mais de perto, com boa luz."
        : `Li ${n} ${n === 1 ? "item" : "itens"}${d.fornecedor ? ` de ${d.fornecedor}` : ""}. ${linked} ${linked === 1 ? "foi ligado" : "foram ligados"} a peças do estoque (escolha conferida abaixo); os outros entram como peça nova. Confira tudo e escolha o pagamento antes de registrar — a IA pode errar.`,
    );
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await registerPurchaseAction({
        supplierId: supplierChoice && supplierChoice !== NEW_SUPPLIER ? supplierChoice : undefined,
        newSupplierName: supplierChoice === NEW_SUPPLIER ? newSupplier : undefined,
        purchaseDate,
        items: rows.map((r) =>
          r.kind === "STOCK"
            ? { partId: r.partId, quantity: r.quantity, totalReais: r.total }
            : {
                newPartName: r.newName,
                newPartIsConsumable: r.newConsumable,
                newPartPriceReais: r.newPrice || undefined,
                quantity: r.quantity,
                totalReais: r.total,
              },
        ),
        adjustmentReais: adjustment || undefined,
        notes: notes || undefined,
        payment: {
          mode,
          method: mode === "PAGO" ? method : undefined,
          paidOn: mode === "PAGO" ? paidOn : undefined,
          dueDate: mode === "DEPOIS" ? dueDate : undefined,
          installments: mode === "DEPOIS" ? n : undefined,
        },
      });
      if (!result.success || !result.summary) {
        setError(result.error ?? "Não foi possível registrar a compra.");
        return;
      }
      void draft.finish();
      setDone(result.summary);
      router.refresh();
    });
  }

  function reset() {
    setDone(null);
    setRows([newRow()]);
    setAdjustment("");
    setNotes("");
    setSupplierChoice("");
    setNewSupplier("");
    setDueDate("");
    setInstallments("1");
  }

  if (done) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-success">Compra registrada</h2>
        <p className="text-sm">
          {done.itemCount} {done.itemCount === 1 ? "item entrou" : "itens entraram"} no estoque. Total{" "}
          {formatBRL(done.totalCents)}.{" "}
          {done.expenseCount === 0
            ? "Nenhuma despesa foi lançada."
            : done.expenseCount === 1
              ? "Foi lançada 1 despesa em Fornecedores/Peças."
              : `Foram lançadas ${done.expenseCount} parcelas em Fornecedores/Peças.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <button onClick={reset} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
            Registrar outra compra
          </button>
          <Link href="/dashboard/despesas" className="flex h-11 items-center rounded-xl border border-border px-4 text-sm font-medium">
            Ver despesas
          </Link>
          <Link href="/dashboard/estoque" className="flex h-11 items-center rounded-xl border border-border px-4 text-sm font-medium">
            Ver estoque
          </Link>
        </div>
      </section>
    );
  }

  const canSubmit =
    !isPending &&
    totalCents > 0 &&
    rows.every((r) => (r.kind === "STOCK" ? r.partId : r.newName.trim().length >= 2) && reaisToCents(r.total || "0") > 0) &&
    (mode !== "DEPOIS" || dueDate) &&
    (supplierChoice !== NEW_SUPPLIER || newSupplier.trim().length >= 2);

  return (
    <div className="flex flex-col gap-5">
      <InvoicePhotoButton onRead={applyInvoice} info={invoiceInfo} />

      <Section title="1. Fornecedor e data">
        <select value={supplierChoice} onChange={(e) => setSupplierChoice(e.target.value)} className={inputClass}>
          <option value="">Sem fornecedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_SUPPLIER}>+ Novo fornecedor…</option>
        </select>
        {supplierChoice === NEW_SUPPLIER ? (
          <input
            value={newSupplier}
            onChange={(e) => setNewSupplier(e.target.value)}
            placeholder="Nome do fornecedor (ex.: Auto Peças Central)"
            className={inputClass}
          />
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="purchaseDate">
            Data da compra
          </label>
          <input
            id="purchaseDate"
            type="date"
            max={today}
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </Section>

      <Section title="2. Itens comprados">
        {rows.map((row, idx) => {
          const qty = Number(row.quantity.replace(",", ".")) || 0;
          const cents = reaisToCents(row.total || "0");
          return (
            <div key={row.key} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted">Item {idx + 1}</span>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    className="text-xs font-medium text-danger"
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              <select
                value={row.kind}
                onChange={(e) => updateRow(row.key, { kind: e.target.value as Row["kind"] })}
                className={inputClass}
              >
                <option value="STOCK">Peça que já está no estoque</option>
                <option value="NEW">Peça ou insumo novo</option>
              </select>
              {row.kind === "STOCK" ? (
                <select value={row.partId} onChange={(e) => updateRow(row.key, { partId: e.target.value })} className={inputClass}>
                  <option value="">Escolha a peça…</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.isConsumable ? " (insumo)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    value={row.newName}
                    onChange={(e) => updateRow(row.key, { newName: e.target.value })}
                    placeholder="Nome (ex.: Filtro de óleo Gol)"
                    className={inputClass}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.newConsumable}
                      onChange={(e) => updateRow(row.key, { newConsumable: e.target.checked })}
                      className="h-5 w-5"
                    />
                    Insumo de uso interno (não aparece nos orçamentos)
                  </label>
                  {!row.newConsumable ? (
                    <input
                      value={row.newPrice}
                      onChange={(e) => updateRow(row.key, { newPrice: e.target.value })}
                      inputMode="decimal"
                      placeholder="Preço de venda por unidade (opcional)"
                      className={inputClass}
                    />
                  ) : null}
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                  inputMode="numeric"
                  placeholder="Quantidade"
                  className={inputClass}
                />
                <input
                  value={row.total}
                  onChange={(e) => updateRow(row.key, { total: e.target.value })}
                  inputMode="decimal"
                  placeholder="Total pago (R$)"
                  className={inputClass}
                />
              </div>
              {qty > 0 && cents > 0 ? (
                <p className="text-xs text-muted">Custo por unidade: {formatBRL(Math.max(1, Math.round(cents / qty)))}</p>
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, newRow()])}
          className="h-10 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
        >
          + Adicionar item
        </button>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="adjustment">
            Frete ou desconto (opcional)
          </label>
          <input
            id="adjustment"
            value={adjustment}
            onChange={(e) => setAdjustment(e.target.value)}
            inputMode="decimal"
            placeholder="Frete: 15,00 · Desconto: -10,00"
            className={inputClass}
          />
          <p className="text-xs text-muted">Serve para o total fechar com o valor que saiu no Pix ou no cartão.</p>
        </div>
      </Section>

      <Section title="3. Pagamento">
        <div className="flex flex-col gap-2">
          {(
            [
              ["PAGO", "Já paguei"],
              ["DEPOIS", "Vou pagar depois (ou parcelado)"],
              ["NENHUM", "Não lançar despesa (só dar entrada no estoque)"],
            ] as [PayMode, string][]
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                mode === value ? "border-accent bg-accent/10" : "border-border"
              }`}
            >
              <input type="radio" name="payMode" checked={mode === value} onChange={() => setMode(value)} />
              {label}
            </label>
          ))}
        </div>

        {mode === "PAGO" ? (
          <div className="grid grid-cols-2 gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value as Method)} className={inputClass}>
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABEL[m]}
                </option>
              ))}
            </select>
            <input type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={inputClass} />
          </div>
        ) : null}

        {mode === "DEPOIS" ? (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted" htmlFor="dueDate">
                  Vencimento (da 1ª parcela)
                </label>
                <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-muted" htmlFor="installments">
                  Parcelas
                </label>
                <input
                  id="installments"
                  inputMode="numeric"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {n > 1 && totalCents > 0 ? (
              <p className="text-xs text-muted">
                {n}x de {formatBRL(installmentValues(totalCents, n)[1])}
                {installmentValues(totalCents, n)[0] !== installmentValues(totalCents, n)[1]
                  ? ` (a primeira ${formatBRL(installmentValues(totalCents, n)[0])})`
                  : ""}
                , uma por mês.
              </p>
            ) : null}
          </div>
        ) : null}

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observação (opcional)"
          className={inputClass}
        />

        <div className="rounded-xl bg-background p-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Itens</span>
            <span className="text-foreground">{formatBRL(itemsTotalCents)}</span>
          </div>
          {adjustmentCents !== 0 ? (
            <div className="flex justify-between text-muted">
              <span>{adjustmentCents > 0 ? "Frete" : "Desconto"}</span>
              <span className="text-foreground">{formatBRL(adjustmentCents)}</span>
            </div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total da compra</span>
            <span>{formatBRL(totalCents)}</span>
          </div>
        </div>
      </Section>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <DraftBar draft={draft} />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="h-14 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Registrando…" : "Registrar compra"}
      </button>
    </div>
  );
}
