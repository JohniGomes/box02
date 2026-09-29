"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createVehicleAction, updateVehicleAction, type ActionResult } from "./actions";
import { CustomerPicker } from "./CustomerPicker";
import type { VehicleRecord } from "@/lib/db/repositories/vehicles";
import { formatPlate } from "@/lib/validation/plate";

export interface VehicleFormValues {
  customerId: string;
  customerLabel: string;
  plate: string;
  brand: string;
  model: string;
  version: string;
  yearManufacture: string;
  yearModel: string;
  color: string;
  fuelType: string;
  mileage: string;
  chassis: string;
  renavam: string;
  notes: string;
}

function emptyValues(preset?: { customerId?: string; customerLabel?: string }): VehicleFormValues {
  return {
    customerId: preset?.customerId ?? "",
    customerLabel: preset?.customerLabel ?? "",
    plate: "",
    brand: "",
    model: "",
    version: "",
    yearManufacture: "",
    yearModel: "",
    color: "",
    fuelType: "",
    mileage: "",
    chassis: "",
    renavam: "",
    notes: "",
  };
}

export function vehicleRecordToFormValues(
  vehicle: VehicleRecord,
  customerLabel: string,
): VehicleFormValues {
  return {
    customerId: vehicle.customerId,
    customerLabel,
    plate: vehicle.plate ? formatPlate(vehicle.plate) : "",
    brand: vehicle.brand ?? "",
    model: vehicle.model ?? "",
    version: vehicle.version ?? "",
    yearManufacture: vehicle.yearManufacture ? String(vehicle.yearManufacture) : "",
    yearModel: vehicle.yearModel ? String(vehicle.yearModel) : "",
    color: vehicle.color ?? "",
    fuelType: vehicle.fuelType ?? "",
    mileage: vehicle.mileage !== null ? String(vehicle.mileage) : "",
    chassis: vehicle.chassis ?? "",
    renavam: vehicle.renavam ?? "",
    notes: vehicle.notes ?? "",
  };
}

const STEPS = [
  { key: "cliente", label: "Cliente" },
  { key: "identificacao", label: "Identificação" },
  { key: "detalhes", label: "Detalhes" },
  { key: "observacoes", label: "Observações" },
] as const;

const FUEL_OPTIONS = ["Flex", "Gasolina", "Etanol", "Diesel", "GNV", "Elétrico", "Híbrido"];

export function VehicleForm({
  mode,
  vehicleId,
  initialValues,
  fixedCustomer,
}: {
  mode: "create" | "edit";
  vehicleId?: string;
  initialValues?: VehicleFormValues;
  /** Quando o formulário é aberto a partir da ficha de um cliente, o cliente
   * já vem definido e a etapa de seleção é pulada. */
  fixedCustomer?: { id: string; label: string };
}) {
  const router = useRouter();
  const [step, setStep] = useState(fixedCustomer ? 1 : 0);
  const [values, setValues] = useState<VehicleFormValues>(
    initialValues ?? emptyValues(fixedCustomer ? { customerId: fixedCustomer.id, customerLabel: fixedCustomer.label } : undefined),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const steps = fixedCustomer ? STEPS.slice(1) : STEPS;
  const currentStepIndex = fixedCustomer ? step - 1 : step;

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      customerId: values.customerId,
      plate: values.plate,
      brand: values.brand,
      model: values.model,
      version: values.version,
      yearManufacture: values.yearManufacture,
      yearModel: values.yearModel,
      color: values.color,
      fuelType: values.fuelType,
      mileage: values.mileage,
      chassis: values.chassis,
      renavam: values.renavam,
      notes: values.notes,
    };

    let result: ActionResult;
    if (mode === "create") {
      result = await createVehicleAction(payload);
    } else {
      result = await updateVehicleAction(vehicleId as string, payload);
    }

    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    router.push(`/dashboard/veiculos/${result.vehicleId}`);
    router.refresh();
  }

  const isLastStep = step === STEPS.length - 1;
  const canLeaveClienteStep = values.customerId.trim() !== "";

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator steps={steps} currentIndex={currentStepIndex} />

      {step === 0 ? (
        <FieldGroup>
          <span className="text-sm font-medium">Cliente proprietário/responsável</span>
          <CustomerPicker
            value={values.customerId ? { id: values.customerId, label: values.customerLabel } : null}
            onChange={(c) => {
              update("customerId", c?.id ?? "");
              update("customerLabel", c?.label ?? "");
            }}
            error={fieldErrors.customerId}
          />
        </FieldGroup>
      ) : null}

      {step === 1 ? (
        <FieldsIdentificacao values={values} update={update} errors={fieldErrors} fixedCustomer={fixedCustomer} />
      ) : null}
      {step === 2 ? <FieldsDetalhes values={values} update={update} /> : null}
      {step === 3 ? <FieldsObservacoes values={values} update={update} /> : null}

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        {step > (fixedCustomer ? 1 : 0) ? (
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
            disabled={step === 0 && !canLeaveClienteStep}
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canLeaveClienteStep}
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-60 active:scale-[0.98]"
          >
            {submitting ? "Salvando…" : mode === "create" ? "Cadastrar veículo" : "Salvar alterações"}
          </button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({
  steps,
  currentIndex,
}: {
  steps: readonly { key: string; label: string }[];
  currentIndex: number;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="flex flex-1 items-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i <= currentIndex ? "bg-accent text-accent-foreground" : "border border-border text-muted"
            }`}
          >
            {i + 1}
          </span>
          <span
            className={`hidden text-xs font-medium sm:inline ${
              i === currentIndex ? "text-foreground" : "text-muted"
            }`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">{children}</div>;
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

function FieldsIdentificacao({
  values,
  update,
  errors,
  fixedCustomer,
}: {
  values: VehicleFormValues;
  update: <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) => void;
  errors: Record<string, string>;
  fixedCustomer?: { id: string; label: string };
}) {
  return (
    <FieldGroup>
      {fixedCustomer ? (
        <p className="text-xs text-muted">
          Veículo de <span className="font-medium text-foreground">{fixedCustomer.label}</span>
        </p>
      ) : null}
      <Field label="Placa (opcional)" htmlFor="plate" error={errors.plate}>
        <input
          id="plate"
          value={values.plate}
          onChange={(e) => update("plate", e.target.value.toUpperCase())}
          className={`${inputClass} font-mono uppercase tracking-wider`}
          placeholder="ABC-1234 ou ABC1D23"
        />
      </Field>
      <p className="text-xs text-muted">
        Sem placa ainda é possível cadastrar (ex.: veículo recém-adquirido). Não será possível checar duplicidade automaticamente.
      </p>
      <Field label="Marca" htmlFor="brand">
        <input id="brand" value={values.brand} onChange={(e) => update("brand", e.target.value)} className={inputClass} placeholder="Ex.: Volkswagen" />
      </Field>
      <Field label="Modelo" htmlFor="model">
        <input id="model" value={values.model} onChange={(e) => update("model", e.target.value)} className={inputClass} placeholder="Ex.: Gol" />
      </Field>
      <Field label="Versão (opcional)" htmlFor="version">
        <input id="version" value={values.version} onChange={(e) => update("version", e.target.value)} className={inputClass} placeholder="Ex.: 1.6 MSI" />
      </Field>
    </FieldGroup>
  );
}

function FieldsDetalhes({
  values,
  update,
}: {
  values: VehicleFormValues;
  update: <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) => void;
}) {
  return (
    <FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ano fabricação" htmlFor="yearManufacture">
          <input
            id="yearManufacture"
            inputMode="numeric"
            value={values.yearManufacture}
            onChange={(e) => update("yearManufacture", e.target.value)}
            className={inputClass}
            placeholder="2020"
          />
        </Field>
        <Field label="Ano modelo" htmlFor="yearModel">
          <input
            id="yearModel"
            inputMode="numeric"
            value={values.yearModel}
            onChange={(e) => update("yearModel", e.target.value)}
            className={inputClass}
            placeholder="2021"
          />
        </Field>
      </div>
      <Field label="Cor" htmlFor="color">
        <input id="color" value={values.color} onChange={(e) => update("color", e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Combustível</span>
        <div className="flex flex-wrap gap-2">
          {FUEL_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => update("fuelType", opt)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                values.fuelType === opt ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      <Field label="Quilometragem atual" htmlFor="mileage">
        <input
          id="mileage"
          inputMode="numeric"
          value={values.mileage}
          onChange={(e) => update("mileage", e.target.value)}
          className={inputClass}
          placeholder="Ex.: 45000"
        />
      </Field>
      <Field label="Chassi (opcional)" htmlFor="chassis">
        <input id="chassis" value={values.chassis} onChange={(e) => update("chassis", e.target.value.toUpperCase())} className={`${inputClass} font-mono uppercase`} />
      </Field>
      <Field label="RENAVAM (opcional)" htmlFor="renavam">
        <input id="renavam" inputMode="numeric" value={values.renavam} onChange={(e) => update("renavam", e.target.value)} className={inputClass} />
      </Field>
    </FieldGroup>
  );
}

function FieldsObservacoes({
  values,
  update,
}: {
  values: VehicleFormValues;
  update: <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) => void;
}) {
  return (
    <FieldGroup>
      <Field label="Observações (opcional)" htmlFor="notes">
        <textarea
          id="notes"
          value={values.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={5}
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </Field>
      <div className="rounded-xl bg-background p-4 text-sm text-muted">
        <p className="font-medium text-foreground">Revisão rápida</p>
        <p className="mt-1">{values.customerLabel || "(sem cliente selecionado)"}</p>
        <p>
          {[values.brand, values.model].filter(Boolean).join(" ") || "(sem marca/modelo)"}
          {values.plate ? ` — ${values.plate}` : ""}
        </p>
      </div>
    </FieldGroup>
  );
}
