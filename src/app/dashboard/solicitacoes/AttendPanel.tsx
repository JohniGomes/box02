"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  attendServiceRequestAction,
  previewServiceRequestMatchesAction,
  type ServiceRequestMatchesView,
} from "./actions";

const inputClass =
  "h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * "Atender": mostra o que já existe no cadastro (cliente pelo telefone, veículo
 * pela placa) para vincular em vez de duplicar, e cria o agendamento.
 */
export function AttendPanel({ serviceRequestId }: { serviceRequestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<ServiceRequestMatchesView | null>(null);
  const [customerChoice, setCustomerChoice] = useState<string>("NEW"); // id do cliente ou "NEW"
  const [vehicleChoice, setVehicleChoice] = useState<string>("NONE"); // id, "NEW" ou "NONE"
  const [scheduledAt, setScheduledAt] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await previewServiceRequestMatchesAction(serviceRequestId);
    setLoading(false);
    if (!result.success || !result.matches) {
      setError(result.error ?? "Não foi possível consultar os cadastros.");
      return;
    }
    const m = result.matches;
    setMatches(m);
    setDescription(m.request.description);
    // Padrão: o cliente encontrado (pelo telefone ou pelo dono da placa).
    const first = m.plateOwner && m.customers.some((c) => c.id === m.plateOwner!.customerId)
      ? m.plateOwner.customerId
      : m.customers[0]?.id ?? "NEW";
    setCustomerChoice(first);
    setVehicleChoice(defaultVehicle(m, first));
  }

  function defaultVehicle(m: ServiceRequestMatchesView, customerId: string): string {
    if (customerId !== "NEW") {
      const list = m.vehiclesByCustomer[customerId] ?? [];
      const byPlate = m.plate ? list.find((v) => v.plate === m.plate) : undefined;
      if (byPlate) return byPlate.id;
    }
    return m.plate || m.request.vehicleDescription ? "NEW" : "NONE";
  }

  function changeCustomer(id: string) {
    setCustomerChoice(id);
    if (matches) setVehicleChoice(defaultVehicle(matches, id));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await attendServiceRequestAction(serviceRequestId, {
        customerId: customerChoice === "NEW" ? undefined : customerChoice,
        vehicle: vehicleChoice,
        scheduledAt,
        description,
      });
      if (!result.success) {
        setError(result.error ?? "Não foi possível atender.");
        return;
      }
      router.push("/dashboard/agendamentos");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPanel}
        className="h-10 rounded-lg bg-accent text-sm font-semibold text-accent-foreground active:scale-[0.98]"
      >
        Atender (criar agendamento)
      </button>
    );
  }

  const vehicles = customerChoice !== "NEW" ? matches?.vehiclesByCustomer[customerChoice] ?? [] : [];
  const plateElsewhere =
    matches?.plateOwner && customerChoice !== matches.plateOwner.customerId ? matches.plateOwner : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3">
      {loading || !matches ? (
        <p className="text-sm text-muted">{error ?? "Consultando cadastros…"}</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cliente</p>
            {matches.customers.map((c) => (
              <label key={c.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name={`c-${serviceRequestId}`} checked={customerChoice === c.id} onChange={() => changeCustomer(c.id)} className="mt-1" />
                <span>
                  Usar cadastro existente: <strong>{c.name}</strong>
                  {c.phone ? <span className="text-muted"> · {c.phone}</span> : null}
                </span>
              </label>
            ))}
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name={`c-${serviceRequestId}`} checked={customerChoice === "NEW"} onChange={() => changeCustomer("NEW")} className="mt-1" />
              <span>
                {matches.customers.length > 0 ? "Cadastrar como cliente novo" : "Cadastrar cliente novo"}:{" "}
                <strong>{matches.request.customerName}</strong>
                <span className="text-muted"> · {matches.request.customerPhone}</span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Veículo</p>
            {vehicles.map((v) => (
              <label key={v.id} className="flex items-start gap-2 text-sm">
                <input type="radio" name={`v-${serviceRequestId}`} checked={vehicleChoice === v.id} onChange={() => setVehicleChoice(v.id)} className="mt-1" />
                <span>Usar: {v.label}</span>
              </label>
            ))}
            {matches.plate || matches.request.vehicleDescription ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name={`v-${serviceRequestId}`} checked={vehicleChoice === "NEW"} onChange={() => setVehicleChoice("NEW")} className="mt-1" />
                <span>
                  Cadastrar veículo novo:{" "}
                  <strong>{[matches.model, matches.plate].filter(Boolean).join(" · ")}</strong>
                </span>
              </label>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name={`v-${serviceRequestId}`} checked={vehicleChoice === "NONE"} onChange={() => setVehicleChoice("NONE")} className="mt-1" />
              <span>Sem veículo por enquanto</span>
            </label>
            {plateElsewhere ? (
              <p className="rounded-lg bg-accent/10 p-2 text-xs">
                Atenção: a placa informada já está cadastrada para <strong>{plateElsewhere.customerName}</strong>. Confira se é
                o mesmo cliente antes de cadastrar outro veículo.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Agendamento</p>
            {matches.request.preferredTime ? (
              <p className="text-xs text-muted">Melhor dia/horário pedido pelo cliente: {matches.request.preferredTime}</p>
            ) : null}
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={inputClass} />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Serviço / queixa do cliente"
            />
          </div>

          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={isPending || !scheduledAt}
              className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {isPending ? "Criando…" : "Criar agendamento"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl border border-border text-sm font-medium">
              Voltar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
