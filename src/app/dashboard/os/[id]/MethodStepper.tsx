import { METHOD_STAGES, METHOD_STAGE_LABEL, type MethodStage } from "../statusLabels";

/**
 * Sequência fixa das 7 etapas oficiais do Método BOX 02 — sempre todas
 * visíveis, sempre nesta ordem, nunca somem mesmo quando não aplicável
 * a uma OS específica. `activeStage` (derivado do status, não sinônimo
 * dele) destaca uma das 4 etapas que têm correspondência com status.
 * `showVerificandoBarrier` mostra o selo da barreira interna
 * (PRONTA) — nunca um 8º item da sequência.
 */
export function MethodStepper({
  activeStage,
  showVerificandoBarrier,
}: {
  activeStage: MethodStage | null;
  showVerificandoBarrier: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface p-3">
      <ol className="flex min-w-max gap-1">
        {METHOD_STAGES.map((stage, index) => {
          const isActive = stage === activeStage;
          return (
            <li key={stage} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                    isActive ? "bg-accent text-accent-foreground" : "bg-muted/20 text-muted"
                  }`}
                >
                  {index + 1}
                </span>
                <span className={`text-[10px] font-medium whitespace-nowrap ${isActive ? "text-foreground" : "text-muted"}`}>
                  {METHOD_STAGE_LABEL[stage]}
                </span>
              </div>
              {stage === "EXECUTAMOS" && showVerificandoBarrier ? (
                <span className="mx-1 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold text-accent">
                  Verificando
                </span>
              ) : null}
              {index < METHOD_STAGES.length - 1 ? <span className="mx-1 h-px w-3 bg-border" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
