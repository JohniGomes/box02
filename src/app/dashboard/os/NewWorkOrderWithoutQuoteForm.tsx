"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityPickerOption } from "@/components/EntityPicker";
import { ServicePickerButton } from "@/components/ServicePickerButton";
import { createWorkOrderWithoutQuoteAction } from "./actions";
import { searchCustomersForPickerAction } from "../veiculos/actions";
import { listCustomerVehiclesAction, type VehicleOption } from "../orcamentos/actions";

type ItemType = "SERVICO" | "PECA" | "MAO_DE_OBRA";

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

interface DraftItem {
  key: string;
  type: ItemType;
  description: string;
  quantity: string;
  unitPriceReais: string;
  serviceId?: string;
}

function emptyItem(): DraftItem {
  return { key: crypto.randomUUID(), type: "SERVICO", description: "", quantity: "1", unitPriceReais: "" };
}

/** Criação de OS sem orçamento prévio: escolhe cliente/veículo, check-in, itens opcionais. */
export function NewWorkOrderWithoutQuoteForm() {
  const router = useRouter();
  const [customer, setCustomer] = useState<EntityPickerOption | null>(null);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [mileageAtEntry, setMileageAtEntry] = useState("");
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleCustomerChange(c: EntityPickerOption | null) {
    setCustomer(c);
    setVehicleId("");
    if (c) {
      const list = await listCustomerVehiclesAction(c.id);
      setVehicles(list);
    } else {
      setVehicles([]);
    }
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await createWorkOrderWithoutQuoteAction({
      customerId: customer?.id ?? "",
      vehicleId,
      mileageAtEntry,
      customerComplaint,
      diagnosis,
      items: items
        .filter((i) => i.description.trim())
        .map((i) => ({
          type: i.type,
          description: i.description,
          quantity: i.quantity,
          unitPriceReais: i.unitPriceReais,
          serviceId: i.serviceId,
        })),
    });

    setSubmitting(false);
    if (!result.success) {
      setError(result.error ?? "Não foi possível criar a OS.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }
    router.push(`/dashboard/os/${result.workOrderId}`);
    router.refresh();
  }

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="text-sm font-medium">Cliente</span>
        <EntityPicker
          value={customer}
          onChange={handleCustomerChange}
          searchAction={searchCustomersForPickerAction}
          placeholder="Buscar cliente por nome, CPF ou CNPJ…"
          error={fieldErrors.customerId}
        />

        {customer ? (
          <>
            <span className="text-sm font-medium">Veículo</span>
            {vehicles.length === 0 ? (
              <p className="text-sm text-muted">Este cliente não tem veículos ativos cadastrados.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVehicleId(v.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm ${
                      vehicleId === v.id ? "border-accent bg-accent/15" : "border-border"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            {fieldErrors.vehicleId ? <p className="text-xs text-danger">{fieldErrors.vehicleId}</p> : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <span className="text-sm font-semibold">Check-in</span>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="mileage">Quilometragem de entrada</label>
          <input
            id="mileage"
            inputMode="numeric"
            value={mileageAtEntry}
            onChange={(e) => setMileageAtEntry(e.target.value)}
            className={inputClass}
            placeholder="Ex.: 45000"
          />
          {fieldErrors.mileageAtEntry ? <p className="text-xs text-danger">{fieldErrors.mileageAtEntry}</p> : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="complaint">Queixa do cliente</label>
          <textarea
            id="complaint"
            value={customerComplaint}
            onChange={(e) => setCustomerComplaint(e.target.value)}
            rows={2}
            className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" htmlFor="diagnosis">Diagnóstico (opcional, pode ser preenchido depois)</label>
          <textarea
            id="diagnosis"
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            rows={2}
            className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Itens (opcional — pode deixar para depois do diagnóstico)</span>
        </div>
        {items.map((item) => (
          <div key={item.key} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
            <div className="flex gap-2">
              {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateItem(item.key, { type: t })}
                  className={`rounded-full border px-2 py-1 text-xs font-medium ${
                    item.type === t ? "border-accent bg-accent/15" : "border-border text-muted"
                  }`}
                >
                  {ITEM_TYPE_LABEL[t]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((i) => i.key !== item.key))}
                className="ml-auto text-xs text-danger"
              >
                Remover
              </button>
            </div>
            <ServicePickerButton
              onSelect={(service) =>
                updateItem(item.key, {
                  serviceId: service.id,
                  description: service.label,
                  unitPriceReais: service.suggestedPriceReais ?? "",
                })
              }
            />
            <input
              value={item.description}
              onChange={(e) => updateItem(item.key, { description: e.target.value })}
              placeholder="Descrição"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                inputMode="decimal"
                value={item.quantity}
                onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                placeholder="Qtd"
                className={inputClass}
              />
              <input
                inputMode="decimal"
                value={item.unitPriceReais}
                onChange={(e) => updateItem(item.key, { unitPriceReais: e.target.value })}
                placeholder="Preço unitário (R$)"
                className={inputClass}
              />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          className="h-11 rounded-xl border border-border text-sm font-medium"
        >
          + Adicionar item
        </button>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!customer || !vehicleId || !mileageAtEntry || submitting}
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Criando…" : "Criar OS"}
      </button>
    </div>
  );
}
