"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityPickerOption } from "@/components/EntityPicker";
import { ServicePickerButton } from "@/components/ServicePickerButton";
import { PartPickerButton } from "@/components/PartPickerButton";
import { PurchasedPartButton } from "@/components/PurchasedPartButton";
import { QuickCustomerForm } from "@/components/QuickCustomerForm";
import { QuickVehicleForm } from "@/components/QuickVehicleForm";
import { LastMileageHint } from "@/components/LastMileageHint";
import { DraftBar, useDraft } from "@/components/DraftControls";
import { getServiceKitAction, saveServiceKitAction } from "../configuracoes/servicos/actions";
import {
  createQuoteAction,
  listCustomerVehiclesAction,
  listOpenQuotesForVehicleAction,
  type OpenQuoteRef,
  searchCustomersForQuoteAction,
  updateQuoteVersionAction,
  type ActionResult,
  type VehicleOption,
} from "./actions";
import { computeQuoteTotals, formatBRL, lineTotalCents, reaisToCents } from "@/lib/money";
import { fromDateOnlyLocal } from "@/lib/dateOnly";
import { blockFieldsOf, laborToleranceWarning } from "./itemBlocks";

export { blockFieldsOf, laborToleranceWarning };

type ItemType = "SERVICO" | "PECA" | "MAO_DE_OBRA";
type ItemCategory = "NECESSARIO" | "RECOMENDADO" | "INFORMATIVO";

export interface ItemDraft {
  key: string;
  type: ItemType;
  description: string;
  quantity: string;
  unitPriceReais: string;
  serviceId?: string;
  partId?: string;
  category: ItemCategory;
  notes?: string;
  /** Peça fornecida pelo cliente: sem cobrança e sem baixa de estoque. */
  customerSupplied?: boolean;
  /** Chave (key) do serviço-cabeça do bloco a que este item pertence; vazio = item solto. */
  groupKey?: string;
  /** Peça que veio do kit como "vaga": a pessoa escolhe a peça do estoque depois. */
  slot?: boolean;
  /** Estimativa de mão de obra do serviço (preço padrão do catálogo), só para o aviso amarelo. */
  estimateReais?: string;
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

export function newItem(): ItemDraft {
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
  discountReason?: string;
  surchargeType: "PERCENTUAL" | "FIXO" | "";
  surchargeValue: string;
  validUntil: string;
  internalNotes: string;
  customerMessage: string;
  /** Queixa que veio de um agendamento. */
  customerComplaint?: string;
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
  // Vindo de um agendamento (cliente e veículo prontos), já começa nos itens.
  const [step, setStep] = useState(mode === "create" && initialValues?.vehicle ? 2 : 0);

  const [customer, setCustomer] = useState<EntityPickerOption | null>(initialValues?.customer ?? null);
  const [vehicle, setVehicle] = useState<VehicleOption | null>(initialValues?.vehicle ?? null);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  // Resultado da busca de orçamentos abertos, junto da chave (cliente+veículo) a que pertence.
  const [openQuotesResult, setOpenQuotesResult] = useState<{ key: string; rows: OpenQuoteRef[] }>({ key: "", rows: [] });
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  const [items, setItems] = useState<ItemDraft[]>(initialValues?.items?.length ? initialValues.items : [newItem()]);
  const [discountType, setDiscountType] = useState(initialValues?.discountType ?? "");
  const [discountValue, setDiscountValue] = useState(initialValues?.discountValue ?? "");
  const [discountReason, setDiscountReason] = useState(initialValues?.discountReason ?? "");
  const [customerComplaint, setCustomerComplaint] = useState(initialValues?.customerComplaint ?? "");
  const [mileageAtEntry, setMileageAtEntry] = useState("");
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
    // Quem sai era cabeça de bloco: as peças dele voltam a ser itens soltos.
    setItems((prev) =>
      prev.length > 1
        ? prev.filter((i) => i.key !== key).map((i) => (i.groupKey === key ? { ...i, groupKey: undefined } : i))
        : prev,
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      customerId: customer?.id ?? "",
      vehicleId: vehicle?.id ?? "",
      customerComplaint: customerComplaint || undefined,
      mileageAtEntry: mileageAtEntry || undefined,
      items: items
        .filter((i) => i.description.trim() !== "")
        .map((i) => ({
          type: i.type,
          description: i.description,
          quantity: i.quantity,
          unitPriceReais: i.unitPriceReais || "0",
          serviceId: i.serviceId,
          partId: i.partId,
          // Bloco: as peças e a mão de obra seguem a categoria do serviço-cabeça.
          ...blockFieldsOf(items, i),
          // Observações só valem para Mão de obra; texto deixado em outro
          // tipo (ao trocar de aba) não deve ir junto.
          notes: i.type === "MAO_DE_OBRA" ? i.notes : undefined,
          customerSupplied: i.type === "PECA" ? Boolean(i.customerSupplied) : false,
        })),
      discount: discountType ? { type: discountType, value: discountValue, reason: discountReason || undefined } : undefined,
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

    if (mode === "create") void draft.finish();
    router.push(`/dashboard/orcamentos/${result.quoteId}`);
    router.refresh();
  }

  const draft = useDraft({
    kind: "QUOTE",
    getTitle: () => `Orçamento${customer ? ` — ${customer.label}` : ""}`,
    getPayload: () => ({
      step,
      customer,
      vehicle,
      items,
      discountType,
      discountValue,
      discountReason,
      surchargeType,
      surchargeValue,
      validUntil,
      internalNotes,
      customerMessage,
      customerComplaint,
      mileageAtEntry,
    }),
    applyPayload: (p: {
      step: number;
      customer: EntityPickerOption | null;
      vehicle: VehicleOption | null;
      items: ItemDraft[];
      discountType: "PERCENTUAL" | "FIXO" | "";
      discountValue: string;
      discountReason: string;
      surchargeType: "PERCENTUAL" | "FIXO" | "";
      surchargeValue: string;
      validUntil: string;
      internalNotes: string;
      customerMessage: string;
      customerComplaint: string;
      mileageAtEntry: string;
    }) => {
      setCustomer(p.customer ?? null);
      setVehicle(p.vehicle ?? null);
      setItems(p.items?.length ? p.items : [newItem()]);
      setDiscountType(p.discountType ?? "");
      setDiscountValue(p.discountValue ?? "");
      setDiscountReason(p.discountReason ?? "");
      setSurchargeType(p.surchargeType ?? "");
      setSurchargeValue(p.surchargeValue ?? "");
      setValidUntil(p.validUntil ?? "");
      setInternalNotes(p.internalNotes ?? "");
      setCustomerMessage(p.customerMessage ?? "");
      setCustomerComplaint(p.customerComplaint ?? "");
      setMileageAtEntry(p.mileageAtEntry ?? "");
      setStep(Math.min(Math.max(p.step ?? 0, 0), STEPS.length - 1));
    },
  });

  // Avisa se já existe orçamento em aberto para o mesmo cliente e veículo (só ao criar).
  const openQuotesKey = mode === "create" && customer && vehicle ? `${customer.id}:${vehicle.id}` : "";
  useEffect(() => {
    if (!openQuotesKey) return;
    const [customerId, vehicleId] = openQuotesKey.split(":");
    let cancelled = false;
    listOpenQuotesForVehicleAction(customerId, vehicleId).then((rows) => {
      if (!cancelled) setOpenQuotesResult({ key: openQuotesKey, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [openQuotesKey]);
  // Só vale o resultado da busca do cliente+veículo atuais; trocou, o aviso some até a nova resposta.
  const openQuotes = openQuotesKey && openQuotesResult.key === openQuotesKey ? openQuotesResult.rows : [];

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
          {mode === "create" ? (
            <QuickCustomerForm
              onCreated={(c) => {
                setCustomer(c);
                setVehicle(null);
              }}
            />
          ) : null}
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
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">Este cliente ainda não tem veículo ativo. Cadastre um aqui mesmo:</p>
              {customer ? (
                <QuickVehicleForm
                  customerId={customer.id}
                  onCreated={(v) => {
                    setVehicleOptions((prev) => [...prev, v]);
                    setVehicle(v);
                  }}
                />
              ) : null}
            </div>
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
              {customer ? (
                <QuickVehicleForm
                  customerId={customer.id}
                  onCreated={(v) => {
                    setVehicleOptions((prev) => (prev.some((o) => o.id === v.id) ? prev : [...prev, v]));
                    setVehicle(v);
                  }}
                />
              ) : null}
            </div>
          )}
          {fieldErrors.vehicleId ? <p className="text-xs text-danger">{fieldErrors.vehicleId}</p> : null}
          {mode === "create" && vehicle ? (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
              <span className="text-sm font-medium">Queixa e KM (opcional — passam para a OS)</span>
              <textarea
                value={customerComplaint}
                onChange={(e) => setCustomerComplaint(e.target.value)}
                rows={2}
                placeholder="O que o cliente relatou (ex.: barulho na frente ao frear)"
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-accent"
              />
              <input
                value={mileageAtEntry}
                onChange={(e) => setMileageAtEntry(e.target.value)}
                inputMode="numeric"
                placeholder="KM do painel (ex.: 98000)"
                className="h-11 rounded-xl border border-border bg-surface px-4 text-sm outline-none focus:border-accent"
              />
              <LastMileageHint
                lastMileage={vehicleOptions.find((v) => v.id === vehicle.id)?.mileage}
                current={mileageAtEntry}
                onUse={setMileageAtEntry}
              />
            </div>
          ) : null}
          {openQuotes.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-xl border border-accent/40 bg-accent/5 p-3 text-sm">
              <p className="font-medium">Já existe orçamento em aberto para este carro:</p>
              <ul className="flex flex-col gap-0.5">
                {openQuotes.map((q) => (
                  <li key={q.id}>
                    <Link href={`/dashboard/orcamentos/${q.id}`} className="font-mono font-semibold text-accent underline">
                      {q.number}
                    </Link>{" "}
                    <span className="text-xs text-muted">({q.status === "RASCUNHO" ? "rascunho" : "enviado ao cliente"})</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Abra o existente se for o <strong>mesmo serviço</strong> — assim você edita em vez de repetir. Crie um novo
                só se for <strong>outro serviço</strong> ou outro pedido do cliente.
              </p>
            </div>
          ) : null}
        </FieldGroup>
      ) : null}

      {step === 2 ? (
        <QuoteItemsEditor
          items={items}
          onAdd={(preset) => setItems((prev) => [...prev, { ...newItem(), ...preset }])}
          onUpdate={updateItem}
          onRemove={removeItem}
          error={fieldErrors.items}
          allowGroups
        />
      ) : null}

      {step === 3 ? (
        <QuoteAdjustments
          discountType={discountType}
          discountValue={discountValue}
          discountReason={discountReason}
          surchargeType={surchargeType}
          surchargeValue={surchargeValue}
          validUntil={validUntil}
          internalNotes={internalNotes}
          customerMessage={customerMessage}
          onChange={{
            discountType: setDiscountType,
            discountValue: setDiscountValue,
            discountReason: setDiscountReason,
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

      {mode === "create" ? <DraftBar draft={draft} /> : null}

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

export function QuoteItemsEditor({
  items,
  onAdd,
  onUpdate,
  onRemove,
  error,
  allowGroups,
}: {
  items: ItemDraft[];
  /** Com `allowGroups`, o orçamento agrupa peças e mão de obra sob um serviço. */
  allowGroups?: boolean;
  onAdd: (preset?: Partial<ItemDraft>) => void;
  onUpdate: (key: string, patch: Partial<ItemDraft>) => void;
  onRemove: (key: string) => void;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, idx) => (
        <div
          key={item.key}
          className={`flex flex-col gap-3 rounded-2xl border bg-surface p-4 ${
            item.groupKey ? "ml-4 border-accent/40" : "border-border"
          }`}
        >
          {allowGroups && item.groupKey ? (
            <p className="text-xs text-accent">
              Faz parte do serviço:{" "}
              <strong>
                {items.find((h) => h.key === item.groupKey)?.description || `Item ${items.findIndex((h) => h.key === item.groupKey) + 1}`}
              </strong>
            </p>
          ) : null}
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

          <div className="flex flex-wrap gap-2">
            <ServicePickerButton
              onSelect={(service) =>
                onUpdate(item.key, {
                  type: "SERVICO",
                  serviceId: service.id,
                  partId: undefined,
                  description: service.label,
                  unitPriceReais: service.suggestedPriceReais ?? "",
                  estimateReais: service.defaultPriceReais ?? undefined,
                })
              }
            />
            <PartPickerButton
              onSelect={(part) =>
                onUpdate(item.key, {
                  type: "PECA",
                  partId: part.id,
                  serviceId: undefined,
                  description: part.label,
                  unitPriceReais: part.suggestedPriceReais ?? "",
                  slot: false,
                })
              }
            />
            <PurchasedPartButton
              onCreated={(part, quantity) =>
                onUpdate(item.key, {
                  type: "PECA",
                  partId: part.id,
                  serviceId: undefined,
                  description: part.label,
                  quantity: String(quantity),
                  unitPriceReais: part.suggestedPriceReais ?? "",
                })
              }
            />
          </div>

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

          {allowGroups && item.type === "SERVICO" ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onAdd({ type: "PECA", groupKey: item.key, category: item.category })}
                className="h-9 rounded-lg border border-dashed border-accent/50 px-3 text-xs font-semibold text-accent"
              >
                + Peça deste serviço
              </button>
              <button
                type="button"
                onClick={() => onAdd({ type: "MAO_DE_OBRA", groupKey: item.key, category: item.category })}
                className="h-9 rounded-lg border border-dashed border-accent/50 px-3 text-xs font-semibold text-accent"
              >
                + Mão de obra deste serviço
              </button>
            </div>
          ) : null}

          {allowGroups && item.type === "SERVICO" && item.serviceId ? (
            <KitControls head={item} items={items} onAdd={onAdd} />
          ) : null}

          {allowGroups && item.type === "PECA" && item.slot && !item.partId ? (
            <p className="rounded-lg bg-accent/10 p-2 text-xs">
              Peça do kit a escolher: toque em <strong>Selecionar do estoque</strong> acima (se não escolher agora, pode
              escolher depois — nada trava).
            </p>
          ) : null}

          {allowGroups && item.type === "MAO_DE_OBRA" && item.groupKey
            ? (() => {
                const warning = laborToleranceWarning(items, items.find((h) => h.key === item.groupKey));
                return warning ? <p className="rounded-lg bg-accent/10 p-2 text-xs">{warning}</p> : null;
              })()
            : null}

          {allowGroups && item.type !== "SERVICO" ? (
            <div>
              <span className="mb-1 block text-[11px] font-medium text-muted">Faz parte de qual serviço? (opcional)</span>
              <select
                value={item.groupKey ?? ""}
                onChange={(e) => onUpdate(item.key, { groupKey: e.target.value || undefined })}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">Nenhum — item solto</option>
                {items
                  .filter((h) => h.type === "SERVICO" && h.key !== item.key)
                  .map((h) => (
                    <option key={h.key} value={h.key}>
                      {h.description || `Item ${items.findIndex((x) => x.key === h.key) + 1}`}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

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

          {item.type === "MAO_DE_OBRA" ? (
            <div>
              <label className="text-xs text-muted">Observações (o que foi feito)</label>
              <textarea
                value={item.notes ?? ""}
                onChange={(e) => onUpdate(item.key, { notes: e.target.value })}
                rows={3}
                maxLength={2000}
                placeholder="Discrimine o serviço realizado (ex.: desmontagem do eixo, troca de rolamentos, regulagem…)"
                className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
              />
            </div>
          ) : null}

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
                value={item.customerSupplied ? "0" : item.unitPriceReais}
                onChange={(e) => onUpdate(item.key, { unitPriceReais: e.target.value })}
                disabled={Boolean(item.customerSupplied)}
                inputMode="decimal"
                placeholder="0,00"
                className={`${inputClass} mt-1 w-full disabled:opacity-60`}
              />
            </div>
          </div>
          {item.type === "PECA" ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(item.customerSupplied)}
                onChange={(e) =>
                  onUpdate(item.key, { customerSupplied: e.target.checked, unitPriceReais: e.target.checked ? "0" : "" })
                }
                className="mt-0.5 h-5 w-5 shrink-0"
              />
              <span>
                Peça fornecida pelo cliente
                <span className="block text-xs text-muted">Fica registrada na OS, sem cobrança e sem baixa de estoque.</span>
              </span>
            </label>
          ) : null}

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
        onClick={() => onAdd()}
        className="h-12 rounded-xl border border-dashed border-border text-sm font-medium text-muted"
      >
        + Adicionar item
      </button>
    </div>
  );
}

/** Aplicar o kit do serviço e salvar as linhas do bloco como kit. Só acrescenta; nunca muda o que já foi digitado. */
function KitControls({
  head,
  items,
  onAdd,
}: {
  head: ItemDraft;
  items: ItemDraft[];
  onAdd: (preset?: Partial<ItemDraft>) => void;
}) {
  const children = items.filter((i) => i.groupKey === head.key && i.type !== "SERVICO");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // peças genéricas que ficam fixas no kit (as demais viram "vaga a escolher")
  const [fixed, setFixed] = useState<Record<string, boolean>>({});

  async function applyKit() {
    setMessage(null);
    setBusy(true);
    const lines = await getServiceKitAction(head.serviceId as string);
    setBusy(false);
    if (lines.length === 0) {
      setMessage("Este serviço ainda não tem kit. Monte as peças e a mão de obra abaixo e use \"Salvar como kit\".");
      return;
    }
    let added = 0;
    for (const line of lines) {
      // Não repete uma linha que já está no bloco, e nunca troca o preço do que já existe.
      const exists = children.some(
        (c) => c.type === line.type && c.description.trim().toLowerCase() === line.description.trim().toLowerCase(),
      );
      if (exists) continue;
      onAdd({
        type: line.type,
        description: line.description,
        quantity: line.quantity,
        unitPriceReais: line.unitPriceReais,
        partId: line.partId,
        slot: line.slot,
        groupKey: head.key,
        category: head.category,
      });
      added++;
    }
    setMessage(added === 0 ? "O kit já está neste serviço." : `${added} linha(s) do kit adicionada(s). Tudo continua editável.`);
  }

  async function saveKit() {
    setMessage(null);
    setBusy(true);
    const result = await saveServiceKitAction(
      head.serviceId as string,
      children.map((c) => ({
        type: c.type as "PECA" | "MAO_DE_OBRA",
        description: c.description,
        quantity: c.quantity,
        unitPriceReais: c.type === "MAO_DE_OBRA" ? c.unitPriceReais : undefined,
        partId: c.partId,
        fixedPart: c.type === "PECA" ? Boolean(fixed[c.key]) : undefined,
      })),
    );
    setBusy(false);
    if (!result.success) {
      setMessage(result.error ?? "Não foi possível salvar o kit.");
      return;
    }
    setSaving(false);
    setMessage(`Kit salvo com ${result.count} linha(s). Da próxima vez é só aplicar.`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={applyKit}
          disabled={busy}
          className="h-9 rounded-lg border border-accent/50 px-3 text-xs font-semibold text-accent disabled:opacity-50"
        >
          Aplicar kit deste serviço
        </button>
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => setSaving((v) => !v)}
            className="h-9 rounded-lg border border-border px-3 text-xs font-medium"
          >
            Salvar como kit
          </button>
        ) : null}
      </div>
      {saving ? (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-muted">
            Marque as peças <strong>genéricas</strong> (óleo, filtro, fluido): elas ficam fixas no kit. As outras (pastilha,
            correia, embreagem…) viram &quot;vaga a escolher do estoque&quot;. Preços digitados não são guardados, só o valor da
            mão de obra.
          </p>
          {children
            .filter((c) => c.type === "PECA")
            .map((c) => (
              <label key={c.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!c.partId}
                  checked={Boolean(fixed[c.key]) && Boolean(c.partId)}
                  onChange={(e) => setFixed((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  className="h-4 w-4"
                />
                <span>
                  {c.description || "Peça"} {c.partId ? "" : <span className="text-muted">(sem peça do estoque: vira vaga)</span>}
                </span>
              </label>
            ))}
          <button
            type="button"
            onClick={saveKit}
            disabled={busy}
            className="h-9 w-fit rounded-lg bg-accent px-4 text-xs font-semibold text-accent-foreground disabled:opacity-50"
          >
            Guardar kit (substitui o kit atual)
          </button>
        </div>
      ) : null}
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}

function QuoteAdjustments({
  discountType,
  discountValue,
  discountReason,
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
  discountReason: string;
  surchargeType: "PERCENTUAL" | "FIXO" | "";
  surchargeValue: string;
  validUntil: string;
  internalNotes: string;
  customerMessage: string;
  onChange: {
    discountType: (v: "PERCENTUAL" | "FIXO" | "") => void;
    discountValue: (v: string) => void;
    discountReason: (v: string) => void;
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
      {discountType ? (
        <div>
          <label className="text-xs text-muted" htmlFor="discountReason">
            Motivo do desconto (interno — não aparece para o cliente)
          </label>
          <input
            id="discountReason"
            value={discountReason}
            onChange={(e) => onChange.discountReason(e.target.value)}
            placeholder="Ex.: cliente antigo, fechou mais de um serviço"
            className={`${inputClass} mt-1 w-full`}
          />
        </div>
      ) : null}
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
