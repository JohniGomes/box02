"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markCustomerCheckedAction, setRemindersConsentAction } from "../actions";

type Consent = "SIM" | "NAO" | null;

/** Avisos da ficha do cliente: pré-cadastro (conferir os dados) e se aceita lembretes por WhatsApp. */
export function CustomerFlags({
  customerId,
  isPreRegistration,
  consent,
  consentAt,
}: {
  customerId: string;
  isPreRegistration: boolean;
  consent: Consent;
  /** Data do registro (texto já formatado), quando houver. */
  consentAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  const button = "h-9 rounded-lg border border-border px-3 text-xs font-medium disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      {isPreRegistration ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-accent/10 p-4">
          <p className="text-sm font-semibold">Pré-cadastro: conferir os dados na recepção</p>
          <p className="text-xs text-muted">
            Este cliente foi cadastrado às pressas. Confira nome, telefone, CPF e endereço. A etiqueta some quando você salvar o cadastro
            completo ou tocar em &quot;Já conferi&quot;.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/clientes/${customerId}/editar`} className="flex h-9 items-center rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground">
              Completar cadastro
            </Link>
            <button type="button" disabled={isPending} onClick={() => run(() => markCustomerCheckedAction(customerId))} className={button}>
              Já conferi
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Lembretes por WhatsApp</h2>
        <p className="mb-3 text-sm">
          {consent === "SIM"
            ? `Aceita receber lembretes e avisos${consentAt ? ` (registrado em ${consentAt})` : ""}.`
            : consent === "NAO"
              ? `Não quer receber lembretes${consentAt ? ` (registrado em ${consentAt})` : ""}. Não aparece nas sugestões.`
              : "Ainda não perguntado. Em Mensagens aparece uma sugestão para pedir a permissão."}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending || consent === "SIM"} onClick={() => run(() => setRemindersConsentAction(customerId, "SIM"))} className={button}>
            Aceita
          </button>
          <button type="button" disabled={isPending || consent === "NAO"} onClick={() => run(() => setRemindersConsentAction(customerId, "NAO"))} className={button}>
            Não quer
          </button>
          {consent ? (
            <button type="button" disabled={isPending} onClick={() => run(() => setRemindersConsentAction(customerId, null))} className="text-xs text-muted underline disabled:opacity-50">
              Voltar para &quot;não perguntado&quot;
            </button>
          ) : null}
        </div>
        {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
        <p className="mt-3 text-xs text-muted">
          Vale para lembrete de próxima troca e pedido de avaliação. Confirmação de agendamento, lembrete do dia e cobrança de saldo seguem
          normais.
        </p>
      </section>
    </div>
  );
}
