"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createCustomerAction, updateCustomerAction, type ActionResult } from "./actions";
import { createVehicleAction } from "../veiculos/actions";
import type { CustomerRecord } from "@/lib/db/repositories/customers";
import { formatDocument } from "@/lib/validation/document";
import { formatPhone } from "@/lib/validation/phone";
import { lookupCep } from "@/lib/validation/cep";

const FUEL_TYPES = ["Flex", "Gasolina", "Etanol", "Diesel", "GNV", "Elétrico", "Híbrido"];

type CustomerType = "PF" | "PJ";

export interface CustomerFormValues {
  type: CustomerType;
  legalName: string;
  tradeName: string;
  contactName: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
  addressZipCode: string;
  notes: string;
}

export interface VehicleDraftValues {
  plate: string;
  brand: string;
  model: string;
  color: string;
  fuelType: string;
  mileage: string;
}

function emptyVehicleDraft(): VehicleDraftValues {
  return { plate: "", brand: "", model: "", color: "", fuelType: "", mileage: "" };
}

function emptyValues(type: CustomerType): CustomerFormValues {
  return {
    type,
    legalName: "",
    tradeName: "",
    contactName: "",
    document: "",
    phone: "",
    whatsapp: "",
    email: "",
    addressStreet: "",
    addressNumber: "",
    addressComplement: "",
    addressNeighborhood: "",
    addressCity: "",
    addressState: "",
    addressZipCode: "",
    notes: "",
  };
}

export function customerRecordToFormValues(customer: CustomerRecord): CustomerFormValues {
  return {
    type: customer.type,
    legalName: customer.legalName,
    tradeName: customer.tradeName ?? "",
    contactName: customer.contactName ?? "",
    document: customer.document ? formatDocument(customer.document) : "",
    phone: customer.phone ? formatPhone(customer.phone) : "",
    whatsapp: customer.whatsapp ? formatPhone(customer.whatsapp) : "",
    email: customer.email ?? "",
    addressStreet: customer.addressStreet ?? "",
    addressNumber: customer.addressNumber ?? "",
    addressComplement: customer.addressComplement ?? "",
    addressNeighborhood: customer.addressNeighborhood ?? "",
    addressCity: customer.addressCity ?? "",
    addressState: customer.addressState ?? "",
    addressZipCode: customer.addressZipCode ?? "",
    notes: customer.notes ?? "",
  };
}

const STEPS_CREATE = [
  { key: "identificacao", label: "Identificação" },
  { key: "contato", label: "Contato" },
  { key: "endereco", label: "Endereço" },
  { key: "veiculo", label: "Veículo" },
  { key: "observacoes", label: "Observações" },
] as const;

const STEPS_EDIT = [
  { key: "identificacao", label: "Identificação" },
  { key: "contato", label: "Contato" },
  { key: "endereco", label: "Endereço" },
  { key: "observacoes", label: "Observações" },
] as const;

export function CustomerForm({
  mode,
  customerId,
  initialValues,
}: {
  mode: "create" | "edit";
  customerId?: string;
  initialValues?: CustomerFormValues;
}) {
  const router = useRouter();
  const STEPS = mode === "create" ? STEPS_CREATE : STEPS_EDIT;
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<CustomerFormValues>(
    initialValues ?? emptyValues("PF"),
  );
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraftValues>(emptyVehicleDraft());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function updateVehicle<K extends keyof VehicleDraftValues>(key: K, value: VehicleDraftValues[K]) {
    setVehicleDraft((prev) => ({ ...prev, [key]: value }));
  }

  const isPJ = values.type === "PJ";

  const hasVehicleData =
    mode === "create" &&
    (vehicleDraft.plate.trim() || vehicleDraft.brand.trim() || vehicleDraft.model.trim());

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const payload = {
      type: values.type,
      legalName: values.legalName,
      ...(isPJ ? { tradeName: values.tradeName, contactName: values.contactName } : {}),
      document: values.document,
      phone: values.phone,
      whatsapp: values.whatsapp,
      email: values.email,
      addressStreet: values.addressStreet,
      addressNumber: values.addressNumber,
      addressComplement: values.addressComplement,
      addressNeighborhood: values.addressNeighborhood,
      addressCity: values.addressCity,
      addressState: values.addressState,
      addressZipCode: values.addressZipCode,
      notes: values.notes,
    };

    let result: ActionResult;
    if (mode === "create") {
      result = await createCustomerAction(payload);
    } else {
      result = await updateCustomerAction(customerId as string, payload);
    }

    if (result.success && hasVehicleData && result.customerId) {
      const vehicleResult = await createVehicleAction({
        customerId: result.customerId,
        plate: vehicleDraft.plate,
        brand: vehicleDraft.brand,
        model: vehicleDraft.model,
        color: vehicleDraft.color,
        fuelType: vehicleDraft.fuelType,
        mileage: vehicleDraft.mileage,
      });
      if (!vehicleResult.success) {
        setSubmitting(false);
        setFormError(
          `Cliente cadastrado, mas o veículo não pôde ser salvo: ${vehicleResult.error ?? "erro desconhecido"}. Adicione o veículo depois pela ficha do cliente.`,
        );
        router.push(`/dashboard/clientes/${result.customerId}`);
        router.refresh();
        return;
      }
    }

    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      // Volta para a etapa que contém o primeiro campo com erro, se souber qual é.
      return;
    }

    router.push(`/dashboard/clientes/${result.customerId}`);
    router.refresh();
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="flex flex-col gap-5">
      <StepIndicator steps={STEPS} currentIndex={step} />

      {STEPS[step].key === "identificacao" ? (
        <FieldsIdentificacao values={values} update={update} errors={fieldErrors} />
      ) : null}
      {STEPS[step].key === "contato" ? <FieldsContato values={values} update={update} errors={fieldErrors} /> : null}
      {STEPS[step].key === "endereco" ? <FieldsEndereco values={values} update={update} errors={fieldErrors} /> : null}
      {STEPS[step].key === "veiculo" ? (
        <FieldsVeiculo values={vehicleDraft} update={updateVehicle} />
      ) : null}
      {STEPS[step].key === "observacoes" ? <FieldsObservacoes values={values} update={update} /> : null}

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
            disabled={!values.legalName.trim()}
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
          >
            Próximo
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !values.legalName.trim()}
            className="h-12 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-60 active:scale-[0.98]"
          >
            {submitting ? "Salvando…" : mode === "create" ? "Cadastrar cliente" : "Salvar alterações"}
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
              i <= currentIndex
                ? "bg-accent text-accent-foreground"
                : "border border-border text-muted"
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
          {i < steps.length - 1 ? (
            <span className="h-px flex-1 bg-border" aria-hidden />
          ) : null}
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
}: {
  values: CustomerFormValues;
  update: <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => void;
  errors: Record<string, string>;
}) {
  const isPJ = values.type === "PJ";
  return (
    <FieldGroup>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Tipo de cliente</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update("type", "PF")}
            className={`h-12 rounded-xl border text-base font-medium ${
              values.type === "PF"
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted"
            }`}
          >
            Pessoa física
          </button>
          <button
            type="button"
            onClick={() => update("type", "PJ")}
            className={`h-12 rounded-xl border text-base font-medium ${
              values.type === "PJ"
                ? "border-accent bg-accent/15 text-foreground"
                : "border-border text-muted"
            }`}
          >
            Pessoa jurídica
          </button>
        </div>
      </div>

      <Field label={isPJ ? "Razão social" : "Nome completo"} htmlFor="legalName" error={errors.legalName}>
        <input
          id="legalName"
          value={values.legalName}
          onChange={(e) => update("legalName", e.target.value)}
          className={inputClass}
          placeholder={isPJ ? "Ex.: Auto Peças Anápolis LTDA" : "Ex.: João da Silva"}
        />
      </Field>

      {isPJ ? (
        <>
          <Field label="Nome fantasia (opcional)" htmlFor="tradeName">
            <input
              id="tradeName"
              value={values.tradeName}
              onChange={(e) => update("tradeName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Responsável (opcional)" htmlFor="contactName">
            <input
              id="contactName"
              value={values.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              className={inputClass}
            />
          </Field>
        </>
      ) : null}

      <Field
        label={isPJ ? "CNPJ (opcional)" : "CPF (opcional)"}
        htmlFor="document"
        error={errors.document}
      >
        <input
          id="document"
          inputMode="numeric"
          value={values.document}
          onChange={(e) => update("document", e.target.value)}
          className={inputClass}
          placeholder={isPJ ? "00.000.000/0000-00" : "000.000.000-00"}
        />
      </Field>
      <p className="text-xs text-muted">
        Sem o documento, ainda é possível cadastrar — mas não será possível checar duplicidade automaticamente.
      </p>
    </FieldGroup>
  );
}

function FieldsContato({
  values,
  update,
  errors,
}: {
  values: CustomerFormValues;
  update: <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <FieldGroup>
      <Field label="Telefone" htmlFor="phone" error={errors.phone}>
        <input
          id="phone"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
          className={inputClass}
          placeholder="(62) 99999-9999"
        />
      </Field>
      <Field label="WhatsApp" htmlFor="whatsapp" error={errors.whatsapp}>
        <input
          id="whatsapp"
          inputMode="tel"
          value={values.whatsapp}
          onChange={(e) => update("whatsapp", e.target.value)}
          className={inputClass}
          placeholder="(62) 99999-9999"
        />
      </Field>
      <Field label="E-mail" htmlFor="email" error={errors.email}>
        <input
          id="email"
          type="email"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          className={inputClass}
        />
      </Field>
    </FieldGroup>
  );
}

function FieldsEndereco({
  values,
  update,
  errors,
}: {
  values: CustomerFormValues;
  update: <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => void;
  errors: Record<string, string>;
}) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotFound, setCepNotFound] = useState(false);

  async function handleCepBlur() {
    setCepNotFound(false);
    const digits = values.addressZipCode.replace(/\D/g, "");
    if (digits.length !== 8) return;

    setCepLoading(true);
    const address = await lookupCep(digits);
    setCepLoading(false);

    if (!address) {
      setCepNotFound(true);
      return;
    }
    update("addressStreet", address.street);
    update("addressNeighborhood", address.neighborhood);
    update("addressCity", address.city);
    update("addressState", address.state);
  }

  return (
    <FieldGroup>
      <Field label="CEP" htmlFor="addressZipCode">
        <input
          id="addressZipCode"
          inputMode="numeric"
          value={values.addressZipCode}
          onChange={(e) => update("addressZipCode", e.target.value)}
          onBlur={handleCepBlur}
          className={inputClass}
          placeholder="00000-000"
        />
        {cepLoading ? <p className="text-xs text-muted">Buscando endereço…</p> : null}
        {cepNotFound ? <p className="text-xs text-danger">CEP não encontrado — preencha manualmente.</p> : null}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Rua" htmlFor="addressStreet">
            <input
              id="addressStreet"
              value={values.addressStreet}
              onChange={(e) => update("addressStreet", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Número" htmlFor="addressNumber">
          <input
            id="addressNumber"
            value={values.addressNumber}
            onChange={(e) => update("addressNumber", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Complemento" htmlFor="addressComplement">
        <input
          id="addressComplement"
          value={values.addressComplement}
          onChange={(e) => update("addressComplement", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Bairro" htmlFor="addressNeighborhood">
        <input
          id="addressNeighborhood"
          value={values.addressNeighborhood}
          onChange={(e) => update("addressNeighborhood", e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Field label="Cidade" htmlFor="addressCity">
            <input
              id="addressCity"
              value={values.addressCity}
              onChange={(e) => update("addressCity", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="UF" htmlFor="addressState" error={errors.addressState}>
          <input
            id="addressState"
            maxLength={2}
            value={values.addressState}
            onChange={(e) => update("addressState", e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="GO"
          />
        </Field>
      </div>
    </FieldGroup>
  );
}

function FieldsVeiculo({
  values,
  update,
}: {
  values: VehicleDraftValues;
  update: <K extends keyof VehicleDraftValues>(key: K, value: VehicleDraftValues[K]) => void;
}) {
  return (
    <FieldGroup>
      <p className="text-sm text-muted">
        Opcional — se o cliente já trouxer o veículo, cadastre agora. Pode editar ou adicionar mais veículos
        depois, pela ficha do cliente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Placa" htmlFor="vehiclePlate">
          <input
            id="vehiclePlate"
            value={values.plate}
            onChange={(e) => update("plate", e.target.value.toUpperCase())}
            className={inputClass}
            placeholder="ABC1D23"
          />
        </Field>
        <Field label="Cor" htmlFor="vehicleColor">
          <input
            id="vehicleColor"
            value={values.color}
            onChange={(e) => update("color", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" htmlFor="vehicleBrand">
          <input
            id="vehicleBrand"
            value={values.brand}
            onChange={(e) => update("brand", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Modelo" htmlFor="vehicleModel">
          <input
            id="vehicleModel"
            value={values.model}
            onChange={(e) => update("model", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Combustível</span>
        <div className="flex flex-wrap gap-2">
          {FUEL_TYPES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => update("fuelType", values.fuelType === f ? "" : f)}
              className={`h-9 rounded-full border px-3 text-sm font-medium ${
                values.fuelType === f ? "border-accent bg-accent/15 text-foreground" : "border-border text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <Field label="Quilometragem" htmlFor="vehicleMileage">
        <input
          id="vehicleMileage"
          inputMode="numeric"
          value={values.mileage}
          onChange={(e) => update("mileage", e.target.value)}
          className={inputClass}
        />
      </Field>
    </FieldGroup>
  );
}

function FieldsObservacoes({
  values,
  update,
}: {
  values: CustomerFormValues;
  update: <K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) => void;
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
        <p className="mt-1">
          {values.type === "PJ" ? "Pessoa jurídica" : "Pessoa física"} — {values.legalName || "(sem nome)"}
        </p>
        {values.document ? <p>Documento: {values.document}</p> : null}
        {values.phone ? <p>Telefone: {values.phone}</p> : null}
      </div>
    </FieldGroup>
  );
}
