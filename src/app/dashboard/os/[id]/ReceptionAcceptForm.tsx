"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerReceptionAcceptanceAction } from "../receptionActions";

const inputClass =
  "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

export function ReceptionAcceptForm({
  workOrderId,
  missing = [],
  defaultName = "",
  defaultDocument = "",
}: {
  workOrderId: string;
  missing?: string[];
  /** Nome e CPF do cliente da OS (editáveis: quem assina pode ser outra pessoa). */
  defaultName?: string;
  defaultDocument?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [document, setDocument] = useState(defaultDocument);
  const [awareness1, setAwareness1] = useState(false);
  const [awareness2, setAwareness2] = useState(false);
  const [awareness3, setAwareness3] = useState(false);
  const [accepting, startAccepting] = useTransition();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  function handleAccept() {
    setAcceptError(null);
    startAccepting(async () => {
      const result = await registerReceptionAcceptanceAction(workOrderId, {
        receptionAcceptedName: name,
        receptionAcceptedDocument: document || undefined,
        receptionAwareness1: awareness1,
        receptionAwareness2: awareness2,
        receptionAwareness3: awareness3,
      });
      if (!result.success) {
        setAcceptError(result.error ?? "Falha ao registrar aceite.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="mb-2 text-sm font-bold uppercase">Ciência do cliente (leia e marque antes de assinar)</h2>
      <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={awareness1} onChange={(e) => setAwareness1(e.target.checked)} className="mt-0.5" />
          <span>
            Fui informado(a) de que o veículo pode ter desgastes ou problemas já existentes, que só aparecem quando
            a oficina testa, desmonta ou liga o carro. Se isso acontecer, a oficina me avisa e apresenta orçamento
            separado. Nada será feito sem minha autorização.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={awareness2} onChange={(e) => setAwareness2(e.target.checked)} className="mt-0.5" />
          <span>
            Fui informado(a) de que carro parado por muito tempo pode ter bateria fraca, combustível e fluidos
            degradados e borrachas/mangueiras ressecadas, e que isso pode aparecer depois que o carro volta a ser
            usado.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={awareness3} onChange={(e) => setAwareness3(e.target.checked)} className="mt-0.5" />
          <span>Esta ciência não retira a responsabilidade da oficina pelo serviço que ela executar.</span>
        </label>
      </div>

      <p className="mt-4 text-sm font-semibold">
        Declaro estar ciente das informações de recepção acima, incluindo o estado aparente do veículo e as avarias
        preexistentes declaradas, e autorizo a oficina a realizar o diagnóstico do veículo.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aceito por (nome)" className={inputClass} />
        <input
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          placeholder="CPF (opcional)"
          inputMode="numeric"
          className={inputClass}
        />
        {missing.length > 0 ? (
          <p className="rounded-lg bg-accent/10 p-3 text-xs font-medium">
            Para aceitar o Termo, informe {missing.join(" e ")} (campo acima, em &quot;Queixa relatada pelo cliente&quot;).
          </p>
        ) : null}
        {acceptError ? <p className="text-xs text-danger">{acceptError}</p> : null}
        <button
          type="button"
          onClick={handleAccept}
          disabled={accepting || missing.length > 0 || name.trim().length < 2 || !awareness1 || !awareness2 || !awareness3}
          className="h-12 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {accepting ? "Registrando…" : "Confirmar aceite"}
        </button>
      </div>

      <p className="mt-4 rounded-lg bg-danger/10 p-3 text-xs font-semibold text-danger">
        REGRA: nenhum serviço, desmontagem ou troca antes deste aceite. O aceite autoriza SOMENTE o diagnóstico.
      </p>
    </div>
  );
}
