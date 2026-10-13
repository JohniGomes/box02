"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntityPicker, type EntityPickerOption } from "@/components/EntityPicker";
import {
  listCustomerVehiclesAction,
  searchCustomersForQuoteAction,
  type VehicleOption,
} from "../orcamentos/actions";
import { createAppointmentAction, type ActionResult } from "./actions";

export function AppointmentForm() {
  const router = useRouter();
  const [customer, setCustomer] = useState<EntityPickerOption | null>(null);
  const [vehicle, setVehicle] = useState<VehicleOption | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!customer) {
      setVehicleOptions([]);
      return;
    }
    setLoadingVehicles(true);
    listCustomerVehiclesAction(customer.id)
      .then(setVehicleOptions)
      .finally(() => setLoadingVehicles(false));
  }, [customer]);

  async function handleSubmit() {
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    const result: ActionResult = await createAppointmentAction({
      customerId: customer?.id ?? "",
      vehicleId: vehicle?.id,
      scheduledAt,
      description,
    });

    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error ?? "Não foi possível salvar.");
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Cliente</span>
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
      </div>

      {customer ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Veículo (opcional)</span>
          {loadingVehicles ? (
            <p className="text-sm text-muted">Carregando veículos…</p>
          ) : vehicleOptions.length === 0 ? (
            <p className="text-sm text-muted">Este cliente não tem veículos ativos cadastrados.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicleOptions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVehicle(vehicle?.id === v.id ? null : v)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm ${
                    vehicle?.id === v.id ? "border-accent bg-accent/10" : "border-border"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Data e hora</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        {fieldErrors.scheduledAt ? <p className="text-xs text-danger">{fieldErrors.scheduledAt}</p> : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Observação (opcional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {formError ? <p className="text-sm text-danger">{formError}</p> : null}

      <button
        type="button"
        disabled={!customer || !scheduledAt || submitting}
        onClick={handleSubmit}
        className="flex h-12 items-center justify-center rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50"
      >
        {submitting ? "Salvando…" : "Agendar"}
      </button>
    </div>
  );
}
