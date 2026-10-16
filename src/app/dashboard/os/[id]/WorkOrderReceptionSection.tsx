"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerReceptionAcceptanceAction, updateReceptionInfoAction } from "../receptionActions";

export function WorkOrderReceptionSection({
  workOrderId,
  preExistingDamagesDescription,
  receptionAcceptedAt,
  receptionAcceptedName,
  canManage,
}: {
  workOrderId: string;
  preExistingDamagesDescription: string | null;
  receptionAcceptedAt: string | null;
  receptionAcceptedName: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [damages, setDamages] = useState(preExistingDamagesDescription ?? "");
  const [savingDamages, startSavingDamages] = useTransition();
  const [damagesError, setDamagesError] = useState<string | null>(null);

  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [awareness1, setAwareness1] = useState(false);
  const [awareness2, setAwareness2] = useState(false);
  const [awareness3, setAwareness3] = useState(false);
  const [accepting, startAccepting] = useTransition();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  function handleSaveDamages() {
    setDamagesError(null);
    startSavingDamages(async () => {
      const result = await updateReceptionInfoAction(workOrderId, damages);
      if (!result.success) {
        setDamagesError(result.error ?? "Falha ao salvar.");
        return;
      }
      router.refresh();
    });
  }

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
      setShowAcceptForm(false);
      router.refresh();
    });
  }

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Recepção</h2>
        <Link href={`/dashboard/os/${workOrderId}/termo-recepcao`} className="text-xs font-medium text-accent">
          Ver Termo de Recepção →
        </Link>
      </div>

      {!receptionAcceptedAt ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="damages">Avarias preexistentes (opcional)</label>
            <textarea
              id="damages"
              value={damages}
              onChange={(e) => setDamages(e.target.value)}
              disabled={!canManage}
              rows={3}
              className="rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:opacity-60"
              placeholder="Ex.: risco no para-choque traseiro, amassado na porta esquerda"
            />
            {canManage ? (
              <button
                onClick={handleSaveDamages}
                disabled={savingDamages}
                className="h-10 self-start rounded-lg border border-border px-4 text-xs font-semibold disabled:opacity-60"
              >
                {savingDamages ? "Salvando…" : "Salvar avarias"}
              </button>
            ) : null}
            {damagesError ? <p className="text-xs text-danger">{damagesError}</p> : null}
          </div>

          {canManage ? (
            <div className="rounded-xl border border-border bg-background p-3">
              {!showAcceptForm ? (
                <button
                  onClick={() => setShowAcceptForm(true)}
                  className="h-11 w-full rounded-lg bg-accent text-sm font-semibold text-accent-foreground"
                >
                  Registrar aceite de recepção
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-muted">
                    Ao registrar, os dados de queixa, avarias e o checklist de entrada (se usado) ficam
                    congelados no Termo — não é possível editar depois.
                  </p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome de quem está recebendo o veículo"
                    className={inputClass}
                  />
                  <input
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder="CPF (opcional)"
                    inputMode="numeric"
                    className={inputClass}
                  />

                  <div className="flex flex-col gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
                    <p className="text-xs font-semibold">Ciência do cliente (leia e marque antes de assinar)</p>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={awareness1}
                        onChange={(e) => setAwareness1(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Fui informado(a) de que o veículo pode ter desgastes ou problemas já existentes, que só
                        aparecem quando a oficina testa, desmonta ou liga o carro. Se isso acontecer, a oficina me
                        avisa e apresenta orçamento separado. Nada será feito sem minha autorização.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={awareness2}
                        onChange={(e) => setAwareness2(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>
                        Fui informado(a) de que carro parado por muito tempo pode ter bateria fraca, combustível e
                        fluidos degradados e borrachas/mangueiras ressecadas, e que isso pode aparecer depois que o
                        carro volta a ser usado.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={awareness3}
                        onChange={(e) => setAwareness3(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>Esta ciência não retira a responsabilidade da oficina pelo serviço que ela executar.</span>
                    </label>
                  </div>

                  {acceptError ? <p className="text-xs text-danger">{acceptError}</p> : null}
                  <div className="flex gap-2">
                    <button
                      onClick={handleAccept}
                      disabled={accepting || name.trim().length < 2 || !awareness1 || !awareness2 || !awareness3}
                      className="h-11 flex-1 rounded-lg bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
                    >
                      {accepting ? "Registrando…" : "Confirmar aceite"}
                    </button>
                    <button
                      onClick={() => setShowAcceptForm(false)}
                      className="h-11 flex-1 rounded-lg border border-border text-sm font-semibold"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted">Aceite de recepção ainda não registrado.</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
          <p className="text-sm font-medium text-success">Aceite de recepção registrado</p>
          <p className="text-xs text-muted">
            Por {receptionAcceptedName} em {new Date(receptionAcceptedAt).toLocaleString("pt-BR")}
          </p>
        </div>
      )}
    </section>
  );
}
