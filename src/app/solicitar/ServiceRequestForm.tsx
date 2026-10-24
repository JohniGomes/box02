"use client";

import { useState } from "react";
import { whatsappLinkWithMessage } from "@/lib/validation/phone";
import { submitServiceRequestAction } from "./actions";
import { SERVICE_REQUEST_NOTIFY_TEAM } from "@/lib/serviceRequests/notifyTeam";

function buildNotifyMessage(input: {
  customerName: string;
  customerPhone: string;
  vehicleDescription?: string;
  vehiclePlate?: string;
  preferredTime?: string;
  description: string;
}): string {
  const lines = [
    "Nova solicitação de serviço (BOX 02):",
    `Cliente: ${input.customerName}`,
    `Telefone: ${input.customerPhone}`,
  ];
  if (input.vehicleDescription) lines.push(`Veículo: ${input.vehicleDescription}`);
  if (input.vehiclePlate) lines.push(`Placa: ${input.vehiclePlate}`);
  if (input.preferredTime) lines.push(`Melhor dia/horário: ${input.preferredTime}`);
  lines.push(`O que precisa: ${input.description}`);
  lines.push("", "Já está no sistema, em Solicitações.");
  return lines.join("\n");
}

export function ServiceRequestForm() {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleDescription, setVehicleDescription] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    customerName: string;
    customerPhone: string;
    vehicleDescription?: string;
    vehiclePlate?: string;
    preferredTime?: string;
    description: string;
  } | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    const result = await submitServiceRequestAction({
      customerName,
      customerPhone,
      vehicleDescription: vehicleDescription || undefined,
      vehiclePlate: vehiclePlate || undefined,
      preferredTime: preferredTime || undefined,
      description,
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Não foi possível enviar sua solicitação.");
      return;
    }

    setDone({
      customerName: result.customerName!,
      customerPhone: result.customerPhone!,
      vehicleDescription: result.vehicleDescription,
      vehiclePlate: result.vehiclePlate,
      preferredTime: result.preferredTime,
      description: result.description!,
    });
  }

  if (done) {
    const message = buildNotifyMessage(done);
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-success/30 bg-success/5 p-5 text-center">
          <p className="text-base font-semibold text-success">Solicitação enviada!</p>
          <p className="mt-1 text-sm text-muted">Já caiu no sistema da oficina. Em breve entramos em contato.</p>
        </div>
        <p className="text-center text-xs text-muted">
          Se quiser agilizar, toque abaixo pra já avisar direto no WhatsApp:
        </p>
        <div className="flex flex-col gap-2">
          {SERVICE_REQUEST_NOTIFY_TEAM.map((person) => (
            <a
              key={person.phone}
              href={whatsappLinkWithMessage(person.phone, message)}
              target="_blank"
              rel="noreferrer"
              className="flex h-12 items-center justify-center rounded-xl bg-success/15 text-sm font-semibold text-success active:scale-[0.98]"
            >
              Avisar {person.name} no WhatsApp
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="customerName">
          Seu nome
        </label>
        <input
          id="customerName"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="Nome completo"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="customerPhone">
          Seu telefone/WhatsApp
        </label>
        <input
          id="customerPhone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          inputMode="numeric"
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="(62) 99999-9999"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehicleDescription">
          Veículo (opcional)
        </label>
        <input
          id="vehicleDescription"
          value={vehicleDescription}
          onChange={(e) => setVehicleDescription(e.target.value)}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="Ex: Celta 2010, placa ABC1234"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="vehiclePlate">
          Placa (opcional)
        </label>
        <input
          id="vehiclePlate"
          value={vehiclePlate}
          onChange={(e) => setVehiclePlate(e.target.value)}
          maxLength={10}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base uppercase outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="ABC1D23"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="preferredTime">
          Melhor dia e horário (opcional)
        </label>
        <input
          id="preferredTime"
          value={preferredTime}
          onChange={(e) => setPreferredTime(e.target.value)}
          className="h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="Ex: sexta de manhã"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" htmlFor="description">
          O que você precisa?
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          placeholder="Ex: Barulho no motor ao acelerar, preciso de revisão."
        />
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          submitting || !customerName.trim() || !customerPhone.trim() || !description.trim()
        }
        className="h-12 rounded-xl bg-accent text-base font-semibold text-accent-foreground disabled:opacity-50 active:scale-[0.98]"
      >
        {submitting ? "Enviando…" : "Enviar solicitação"}
      </button>
      <p className="text-center text-xs text-muted">
        Seus dados são usados só para o atendimento da BOX 02 e não são compartilhados.
      </p>
    </div>
  );
}
