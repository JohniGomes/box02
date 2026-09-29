"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityPickerOption } from "@/components/EntityPicker";
import { ServicePickerButton } from "@/components/ServicePickerButton";
import {
  createQuoteAction,
  listCustomerVehiclesAction,
  searchCustomersForQuoteAction,
  updateQuoteVersionAction,
  type ActionResult,
  type VehicleOption,
} from "./actions";
import { computeQuoteTotals, formatBRL, lineTotalCents, reaisToCents } from "@/lib/money";
import { fromDateOnlyLocal } from "@/lib/dateOnly";

type ItemType = "SERVICO" | "PECA" | "MAO_DE_OBRA";
type ItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";

interface ItemDraft {
  key: string;
  type: ItemType;
  description: string;
  quantity: string;
  unitPriceReais: string;
  serviceId?: string;
  category: ItemCategory;
}

const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  SERVICO: "Serviço",
  PECA: "Peça",
  MAO_DE_OBRA: "Mão de obra",
};

const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  NECESSARIO: "Necessário",
  RECOMENDADO: "Recomendado",
  INFORMATIVO: "Informativo",
};

function newItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    type: "SERVICO",
    description: "",
    quantity: "1",
    unitPriceReais: "",
    category: "NECESSARIO", // ORC-3: default mais seguro, sempre trocável
  };
}

export interface QuoteFormInitialValues {
  customer: EntityPickerOption;
  vehicle: VehicleOption;
  items: ItemDraft[];
  discountType: "PERCENTUAL" | "FIXO" | "";
  discountValue: string;
  surchargeType: "PERCENTUAL" | "FIXO" | "";
  surchargeValue: string;
  validUntil: string;
  internalNotes: string;
  customerMessage: string;
}

const STEPS = ["Cliente", "Veículo", "Itens", "Ajustes"] as const;

export function QuoteForm({
  mode,
  quoteId,
  initialValues,
}: {
  mode: "create" | "edit";
  quoteId?: string;
  initialValues?: QuoteFormInitialValues;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [customer, setCustomer] = useState<EntityPickerOption | null>(initialValues?.customer ?? null);
  const [vehicle, setVehicle] = useState<VehicleOption | null>(initialValues?.vehicle ?? null);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>(initialValues?.items ?? [newItem()]);
  const [discountType, setDiscountType] = useState(initialValues?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(initialValues?.discountValue ?? "");
  const [surchargeType, setSurchargeType] = useState(initialValues?.surchargeType ?? "");
  const [surchargeValue, setSurchargeValue] = useState(initialValues?.surchargeValue ?? "");
  const [validUntil, setValidUntil] = useState(initialValues?.validUntil ?? "");
  const [internalNotes, setInternalNotes] = useState(initialValues?.internalNotes ?? "");
  const [customerMessage, setCustomerMessage] = useState(initialValues?.customerMessage ?? "");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!customer || mode === "edit") return;
    const loadingTimer = setTimeout(() => setLoadingVehicles(true), 0);
    listCustomerVehiclesAction(customer.id).then((options) => {
      setVehicleOptions(options);
      setLoadingVehicles(false);
    });
    return () => clearTimeout(loadingTimer);
  }, [customer, mode]);

  const totalsPreview = useMemo(() => {
    const computedItems = items
      .filter((i) => i.description.trim() !== "")
      .map((i) => {
        const unitPriceCents = reaisToCents(i.unitPriceReais || "0");
        const quantity = Number(i.quantity.replace(",", ".")) || 0;
        return { type: i.type, totalCents: lineTotalCents(quantity, unitPriceCents) };
      });
    return computeQuoteTotals({
      items: computedItems,
      discountType: discountType || null,
      discountValue: discountValue
        ? discountType === "PERCENTUAL"
          ? Math.round(Number(discountValue.replace(",", ".")) * 100)
          : reaisToCents(discountValue)
        : null,
      surchargeType: surchargeType || null,
      surchargeValue: surchargeValue
        ? surchargeType === "PERCENTUAL"
          ? Math.round(Number(surchargeValue.replace(",", ".")) * 100)
          : reaisToCents(surchargeValue)
        : null,
    });
  }, [items, discountType, discountValue, surchargeType, surchargeValue]);

  function updateItem(key: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev));
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      customerId: customer?.id ?? "",
      vehicleId: vehicle?.id ?? "",
      items: items
        .filter((i) => i.description.trim() !== "")
        .map((i) => ({
          type: i.type,
          description: i.description,
          quantity: i.quantity,
          unitPriceReais: i.unitPriceReais || "0",
          serviceId: i.serviceId,
          category: i.category,
        })),
      discount: discountType ? { type: discountType, value: discountValue } : undefined,
      surcharge: surchargeType ? { type: surchargeType, value: surchargeValue } : undefined,
      validUntil: validUntil ? fromDateOnlyLocal(validUntil).toISOString() : undefined,
      internalNotes,
      customerMessage,
    };

    let result: ActionResult;
    if (mode === "create") {
      result = await createQuoteAction(payload);
    } else {
      result = await updateQuoteVersionAction(quoteId as string, payload);
    }

    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    router.push(`/dashboard/orcamentos/${result.quoteId}`);
    router.refresh();
  }

  const isLastStep = step === STEPS.length - 1;
  const canLeaveCliente = mode === "edit" || !!customer;
  const canLeaveVeiculo = mode === "edit" || !!vehicle;
  const canLeaveItens = items.some((i) => i.description.trim() !== "");

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator currentIndex={step} />

      {step === 0 ? (
        <FieldGroup>
          <span className="text-sm font-medium">Cliente</span>
          {mode === "edit" ? (
            <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
              {customer?.label} <span className="text-xs text-muted">(não pode ser trocado ao editar)</span>
            </div>
          ) : (
            <EntityPicker
              value={customer}
              onChange={(c) => {
                setCustomer(c);
                setVehicle(null);
              }}
              searchAction={searchCustomersForQuoteAction}
              placeholder="Buscar cliente por nome, CPF ou CNPJ…"
              error={fieldErrors.customerId}
            />
          )}
        </FieldGroup>
      ) : null}

      {step === 1 ? (
        <FieldGroup>
          <span className="text-sm font-medium">Veículo de {customer?.label}</span>
          {mode === "edit" ? (
            <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm">
              {vehicle?.label} <span className="text-xs text-muted">(não pode ser trocado ao editar)</span>
            </div>
          ) : loadingVehicles ? (
            <p className="text-sm text-muted">Carregando veículos…</p>
          ) : vehicleOptions.length === 0 ? (
            <p className="text-sm text-danger">
              Este cliente não tem veículos ativos cadastrados. Cadastre um veículo antes de montar o orçamento.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicleOptions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(v)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    vehicle?.id === v.id ? "border-accent bg-accent/10" : "border-border"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
          {fieldErrors.vehicleId ? <p className="text-xs text-danger">{fieldErrors.vehicleId}</p> : null}
        </FieldGroup>
      ) : null}

      {step === 2 ? (
        <QuoteItemsEditor
          items={items}
          onAdd={() => setItems((prev) => [...prev, newItem()])}
          onUpdate={updateItem}
          onRemove={removeItem}
          error={fieldErrors.items}
        />
      ) : null}

      {step === 3 ? (
        <QuoteAdjustments
          discountType={discountType}
          discountValue={discountValue}
          surchargeType={surchargeType}
          surchargeValue={surchargeValue}
          validUntil={validUntil}
          internalNotes={internalNotes}
          customerMessage={customerMessage}
          onChange={{
            discountType: setDiscountType,
            discountValue: setDiscountValue,
            surchargeType: setSurchargeType,
            surchargeValue: setSurchargeValue,
            validUntil: setValidUntil,
            internalNotes: setInternalNotes,
            customerMessage: setCustomerMessage,
          }}
          totals={totalsPreview}
        />
      ) : null}

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="h-12 flex-1 rounded-xl border border-border text-base font-medium active:scale-[0.98]"
          >
            Voltar
          </button>
        ) : null}

        {!isLastStep ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}
            disabled={
              (step === 0 && !canLeaveCliente) ||
              (step === 1 && !canLeaveVeiculo) ||
              (step === 2 && !canLeaveItens)
            }
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canLeaveItens}
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-60 active:scale-[0.98]"
          >
            {submitting ? "Salvando…" : mode === "create" ? "Salvar orçamento (rascunho)" : "Salvar alterações"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ currentIndex }: { currentIndex: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i <= currentIndex ? "bg-accent text-accent-foreground" : "border border-border text-muted"
            }`}
          >
            {i + 1}
          </span>
          <span className={`hidden text-xs font-medium sm:inline ${i === currentIndex ? "text-foreground" : "text-muted"}`}>
            {label}
          </span>
          {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">{children}</div>;
}

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function QuoteItemsEditor({
  items,
  onAdd,
  onUpdate,
  onRemove,
  error,
}: {
  items: ItemDraft[];
  onAdd: () => void;
  onUpdate: (key: string, patch: Partial<ItemDraft>) => void;
  onRemove: (key: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => (
        <div key={item.key} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Item {idx + 1}</span>
            {items.length > 1 ? (
              <button
                type="button"
                onClick={() => onRemove(item.key)}
                className="text-xs font-medium text-danger"
              >
                Remover
              </button>
            ) : null}
          </div>

          <ServicePickerButton
            onSelect={(service) =>
              onUpdate(item.key, {
                serviceId: service.id,
                description: service.label,
                unitPriceReais: service.suggestedPriceReais ?? "",
              })
            }
          />

          <div className="flex gap-2">
            {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onUpdate(item.key, { type: t })}
                className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                  item.type === t ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"
                }`}
              >
                {ITEM_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <div>
            <span className="mb-1 block text-[11px] font-medium text-muted">Categoria</span>
            <div className="flex gap-2">
              {(Object.keys(ITEM_CATEGORY_LABEL) as ItemCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onUpdate(item.key, { category: c })}
                  className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${
                    item.category === c
                      ? c === "NECESSARIO"
                        ? "border-danger bg-danger/15 text-danger"
                        : c === "RECOMENDADO"
                          ? "border-accent bg-accent/15 text-foreground"
                          : "border-muted bg-muted/15 text-muted"
                      : "border-border text-muted"
                  }`}
                >
                  {ITEM_CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
            {item.category === "INFORMATIVO" ? (
              <p className="mt-1 text-[11px] text-muted">
                Valor estimado, não cobrado — o cliente só visualiza, não precisa aprovar.
              </p>
            ) : null}
          </div>

          <input
            value={item.description}
            onChange={(e) => onUpdate(item.key, { description: e.target.value })}
            placeholder="Descrição (ex.: Troca de pastilha de freio dianteira)"
            className={inputClass}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted">Quantidade</label>
              <input
                value={item.quantity}
                onChange={(e) => onUpdate(item.key, { quantity: e.target.value })}
                inputMode="decimal"
                className={`${inputClass} mt-1 w-full`}
              />
            </div>
            <div>
              <label className="text-xs text-muted">Preço unitário (R$)</label>
              <input
                value={item.unitPriceReais}
                onChange={(e) => onUpdate(item.key, { unitPriceReais: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
                className={`${inputClass} mt-1 w-full`}
              />
            </div>
          </div>

          <p className="text-right text-sm font-medium">
            {formatBRL(
              lineTotalCents(
                Number(item.quantity.replace(",", ".")) || 0,
                reaisToCents(item.unitPriceReais || "0"),
              ),
            )}
          </p>
        </div>
      ))}

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={onAdd}
        className="h-12 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
      >
        + Adicionar item
      </button>
    </div>
  );
}

function QuoteAdjustments({
  discountType,
  discountValue,
  surchargeType,
  surchargeValue,
  validUntil,
  internalNotes,
  customerMessage,
  onChange,
  totals,
}: {
  discountType: "PERCENTUAL" | "FIXO" | "";
  discountValue: string;
  surchargeType: "PERCENTUAL" | "FIXO" | "";
  surchargeValue: string;
  validUntil: string;
  internalNotes: string;
  customerMessage: string;
  onChange: {
    discountType: (v: "PERCENTUAL" | "FIXO" | "") => void;
    discountValue: (v: string) => void;
    surchargeType: (v: "PERCENTUAL" | "FIXO" | "") => void;
    surchargeValue: (v: string) => void;
    validUntil: (v: string) => void;
    internalNotes: (v: string) => void;
    customerMessage: (v: string) => void;
  };
  totals: ReturnType<typeof computeQuoteTotals>;
}) {
  return (
    <FieldGroup>
      <AdjustmentRow
        label="Desconto"
        type={discountType}
        value={discountValue}
        onTypeChange={onChange.discountType}
        onValueChange={onChange.discountValue}
      />
      <AdjustmentRow
        label="Acréscimo"
        type={surchargeType}
        value={surchargeValue}
        onTypeChange={onChange.surchargeType}
        onValueChange={onChange.surchargeValue}
      />

      <div>
        <label className="text-sm font-medium">Validade (opcional — usa o padrão configurado se vazio)</label>
        <input
          type="date"
          value={validUntil}
          onChange={(e) => onChange.validUntil(e.target.value)}
          className={`${inputClass} mt-1.5 w-full`}
        />
      </div>

      <div>
        <label className="text-sm font-medium">Mensagem para o cliente (opcional)</label>
        <textarea
          value={customerMessage}
          onChange={(e) => onChange.customerMessage(e.target.value)}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Observação interna (opcional)</label>
        <textarea
          value={internalNotes}
          onChange={(e) => onChange.internalNotes(e.target.value)}
          rows={3}
          className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div className="rounded-xl bg-background p-4 text-sm">
        <Row label="Serviços" value={formatBRL(totals.subtotalServicesCents)} />
        <Row label="Peças" value={formatBRL(totals.subtotalPartsCents)} />
        <Row label="Mão de obra" value={formatBRL(totals.subtotalLaborCents)} />
        {totals.discountTotalCents > 0 ? (
          <Row label="Desconto" value={`- ${formatBRL(totals.discountTotalCents)}`} />
        ) : null}
        {totals.surchargeTotalCents > 0 ? (
          <Row label="Acréscimo" value={`+ ${formatBRL(totals.surchargeTotalCents)}`} />
        ) : null}
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>Total</span>
          <span>{formatBRL(totals.totalCents)}</span>
        </div>
      </div>
    </FieldGroup>
  );
}

function AdjustmentRow({
  label,
  type,
  value,
  onTypeChange,
  onValueChange,
}: {
  label: string;
  type: "PERCENTUAL" | "FIXO" | "";
  value: string;
  onTypeChange: (v: "PERCENTUAL" | "FIXO" | "") => void;
  onValueChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label} (opcional)</label>
      <div className="mt-1.5 flex gap-2">
        <select
          value={type}
          onChange={(e) => onTypeChange(e.target.value as "PERCENTUAL" | "FIXO" | "")}
          className={`${inputClass} w-32`}
        >
          <option value="">Nenhum</option>
          <option value="PERCENTUAL">%</option>
          <option value="FIXO">R$</option>
        </select>
        <input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={!type}
          inputMode="decimal"
          placeholder={type === "PERCENTUAL" ? "10" : "0,00"}
          className={`${inputClass} flex-1 disabled:opacity-50`}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
