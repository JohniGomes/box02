"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QuoteItemsEditor, newItem, type ItemDraft } from "../orcamentos/QuoteForm";
import { lookupCustomerByPhoneAction, quickSaleAction } from "./actions";
import { computeQuoteTotals, formatBRL, lineTotalCents, reaisToCents } from "@/lib/money";
import { defaultExecutorOptionId } from "@/lib/executors/value";
import type { CustomerLookup } from "@/lib/quickSale/service";

type PaymentMethod = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  CARTAO: "Cartão",
  OUTRO: "Outro",
};

interface PaymentRow {
  key: string;
  method: PaymentMethod;
  amount: string;
}

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Venda rápida de balcão: cliente + carro + itens + pagamento numa tela só.
 * Acha o cliente pelo telefone (ou cria o cadastro mínimo), monta o orçamento e
 * já deixa tudo concluído e pago, na data informada, com recibo.
 */
export function QuickSaleForm({
  executors,
  currentUserId,
}: {
  executors: { id: string; name: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  // Cliente
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<CustomerLookup | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [customerName, setCustomerName] = useState("");
  // Veículo ("" = veículo novo, digitado abaixo)
  const [existingVehicleId, setExistingVehicleId] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  // Itens
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  // Fechamento
  const [serviceDate, setServiceDate] = useState(today);
  const [mileage, setMileage] = useState("");
  const [executedBy, setExecutedBy] = useState(defaultExecutorOptionId(executors, currentUserId));
  const [deliveryName, setDeliveryName] = useState("");
  const [rows, setRows] = useState<PaymentRow[]>([{ key: "p1", method: "PIX", amount: "" }]);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const totalCents = useMemo(() => {
    const lines = items
      .filter((i) => i.description.trim() !== "" && i.category !== "INFORMATIVO")
      .map((i) => ({
        type: i.type,
        totalCents: lineTotalCents(
          Number(i.quantity.replace(",", ".")) || 0,
          reaisToCents(i.unitPriceReais || "0"),
        ),
      }));
    return computeQuoteTotals({
      items: lines,
      discountType: null,
      discountValue: null,
      surchargeType: null,
      surchargeValue: null,
    }).totalCents;
  }, [items]);

  const paidCents = rows.reduce((sum, r) => sum + reaisToCents(r.amount || "0"), 0);
  const remainingCents = totalCents - paidCents;

  function doLookup() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setLookup(null);
      setLookedUp(false);
      return;
    }
    startTransition(async () => {
      const found = await lookupCustomerByPhoneAction(phone);
      setLookup(found);
      setLookedUp(true);
      if (found) {
        setCustomerName(found.customer.name);
        setDeliveryName((prev) => prev || found.customer.name);
        setExistingVehicleId(found.vehicles[0]?.id ?? "");
      } else {
        setExistingVehicleId("");
      }
    });
  }

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  function handleSubmit() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await quickSaleAction({
        existingCustomerId: lookup?.customer.id,
        customerName,
        customerPhone: phone,
        existingVehicleId: lookup && existingVehicleId ? existingVehicleId : undefined,
        vehicleModel: lookup && existingVehicleId ? undefined : vehicleModel,
        vehiclePlate: lookup && existingVehicleId ? undefined : vehiclePlate,
        items: items
          .filter((i) => i.description.trim() !== "")
          .map((i) => ({
            type: i.type,
            description: i.description,
            quantity: i.quantity,
            unitPriceReais: i.unitPriceReais || "0",
            serviceId: i.serviceId,
            partId: i.partId,
            category: i.category,
            notes: i.type === "MAO_DE_OBRA" ? i.notes : undefined,
          })),
        serviceDate,
        mileageAtEntry: mileage,
        executedBy,
        deliveryAcceptedName: deliveryName || customerName,
        payments: rows
          .filter((r) => reaisToCents(r.amount || "0") > 0)
          .map((r) => ({ method: r.method, amountReais: r.amount })),
      });
      if (!result.success) {
        setError(result.error ?? "Não foi possível registrar a venda.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/dashboard/os/${result.workOrderId}/recibo`);
      router.refresh();
    });
  }

  const usingExistingVehicle = Boolean(lookup && existingVehicleId);
  const canSubmit =
    !isPending &&
    customerName.trim().length >= 3 &&
    (usingExistingVehicle || vehicleModel.trim() || vehiclePlate.trim()) &&
    items.some((i) => i.description.trim() !== "") &&
    executedBy &&
    paidCents > 0 &&
    remainingCents >= 0;

  return (
    <div className="flex flex-col gap-5">
      <Section title="1. Cliente">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="qsPhone">
            Telefone / WhatsApp (com DDD)
          </label>
          <input
            id="qsPhone"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setLookedUp(false);
              setLookup(null);
            }}
            onBlur={doLookup}
            placeholder="(62) 99999-0000"
            className={inputClass}
          />
          {lookup ? (
            <p className="text-xs text-success">Cliente já cadastrado: {lookup.customer.name}.</p>
          ) : lookedUp ? (
            <p className="text-xs text-muted">Cliente novo — será cadastrado só com nome e telefone.</p>
          ) : (
            <p className="text-xs text-muted">Digite o telefone e saia do campo: o sistema procura o cliente.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="qsName">
            Nome do cliente
          </label>
          <input
            id="qsName"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            disabled={Boolean(lookup)}
            className={`${inputClass} disabled:opacity-70`}
          />
          {fieldErrors.customerName ? <p className="text-xs text-danger">{fieldErrors.customerName}</p> : null}
        </div>
      </Section>

      <Section title="2. Veículo">
        {lookup && lookup.vehicles.length > 0 ? (
          <div className="flex flex-col gap-2">
            {lookup.vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setExistingVehicleId(v.id)}
                className={`rounded-xl border px-4 py-3 text-left text-sm ${
                  existingVehicleId === v.id ? "border-accent bg-accent/10" : "border-border"
                }`}
              >
                {v.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExistingVehicleId("")}
              className={`rounded-xl border border-dashed px-4 py-3 text-left text-sm ${
                existingVehicleId === "" ? "border-accent bg-accent/10" : "border-border text-muted"
              }`}
            >
              Outro veículo (novo)
            </button>
          </div>
        ) : null}
        {!usingExistingVehicle ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              placeholder="Modelo (ex.: Gol 1.0 2012)"
              className={inputClass}
            />
            <input
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              placeholder="Placa (opcional)"
              className={inputClass}
            />
          </div>
        ) : null}
      </Section>

      <Section title="3. Itens">
        <QuoteItemsEditor
          items={items}
          onAdd={() => setItems((prev) => [...prev, newItem()])}
          onUpdate={updateItem}
          onRemove={(key) => setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev))}
          error={fieldErrors.items}
        />
      </Section>

      <Section title="4. Serviço e pagamento">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="qsDate">
              Data do serviço
            </label>
            <input
              id="qsDate"
              type="date"
              max={today}
              value={serviceDate}
              onChange={(e) => setServiceDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="qsKm">
              Quilometragem (opcional)
            </label>
            <input
              id="qsKm"
              inputMode="numeric"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="qsExec">
              Quem executou
            </label>
            <select id="qsExec" value={executedBy} onChange={(e) => setExecutedBy(e.target.value)} className={inputClass}>
              {executors.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="qsDelivery">
              Quem retirou o veículo
            </label>
            <input
              id="qsDelivery"
              value={deliveryName}
              onChange={(e) => setDeliveryName(e.target.value)}
              placeholder={customerName || "Nome"}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Pagamento</span>
          {rows.map((row) => (
            <div key={row.key} className="flex gap-2">
              <select
                value={row.method}
                onChange={(e) =>
                  setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, method: e.target.value as PaymentMethod } : r)))
                }
                className={`${inputClass} w-36`}
              >
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
              <input
                value={row.amount}
                onChange={(e) =>
                  setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, amount: e.target.value } : r)))
                }
                inputMode="decimal"
                placeholder="0,00"
                className={`${inputClass} min-w-0 flex-1`}
              />
              {rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  className="px-2 text-xs font-medium text-danger"
                >
                  Remover
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setRows((prev) => [
                  ...prev,
                  { key: `p${prev.length + 1}-${Date.now()}`, method: "DINHEIRO", amount: remainingCents > 0 ? (remainingCents / 100).toFixed(2).replace(".", ",") : "" },
                ])
              }
              className="h-10 flex-1 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
            >
              + Outra forma de pagamento
            </button>
            {totalCents > 0 && paidCents === 0 ? (
              <button
                type="button"
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r, idx) =>
                      idx === 0 ? { ...r, amount: (totalCents / 100).toFixed(2).replace(".", ",") } : r,
                    ),
                  )
                }
                className="h-10 rounded-xl border border-border px-3 text-sm font-medium"
              >
                Pago tudo
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl bg-background p-4 text-sm">
          <div className="flex justify-between text-muted">
            <span>Total da venda</span>
            <span className="text-foreground">{formatBRL(totalCents)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Pago</span>
            <span className="text-foreground">{formatBRL(paidCents)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
            <span>{remainingCents < 0 ? "Pago a mais" : "Falta pagar"}</span>
            <span className={remainingCents < 0 ? "text-danger" : ""}>{formatBRL(Math.abs(remainingCents))}</span>
          </div>
        </div>
      </Section>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="h-14 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Registrando…" : "Registrar venda e gerar recibo"}
      </button>
    </div>
  );
}
