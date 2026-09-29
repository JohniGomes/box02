import { METHOD_STAGES, METHOD_STAGE_LABEL, type MethodStage } from "../statusLabels";

/** Rótulo fino acima de um grupo de seções, indicando a qual etapa
 * oficial do Método BOX 02 aquele conteúdo pertence. Puramente
 * presentacional — nunca decide nada, só nomeia o que já existe. */
export function MethodStageHeader({ stage }: { stage: MethodStage }) {
  const index = METHOD_STAGES.indexOf(stage);
  return (
    <p className="px-1 text-xs font-semibold uppercase tracking-wide text-accent">
      {index + 1} · {METHOD_STAGE_LABEL[stage]}
    </p>
  );
}
