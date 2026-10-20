"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRuleAction, type RuleKey } from "./actions";

interface RuleDef {
  key: RuleKey;
  title: string;
  on: string;
  off: string;
}

const RULES: RuleDef[] = [
  {
    key: "reception",
    title: "Exigir o Termo de Recepção aceito para iniciar a execução da OS",
    on: "Ligado: a OS só passa para \"Em execução\" depois que o termo for aceito (como sempre foi).",
    off: "Desligado: a OS pode começar a execução sem o termo. Ele continua existindo e aparece como \"Aceite pendente\" na OS e nos Pendentes do Início, para registrar depois.",
  },
  {
    key: "deliveryChecklist",
    title: "Exigir o checklist de entrega completo para entregar a OS",
    on: "Ligado: se o checklist de entrega foi iniciado, a OS só é entregue com todos os itens obrigatórios marcados (como sempre foi).",
    off: "Desligado: a OS pode ser entregue com itens do checklist de entrega pendentes. A pendência aparece nos Pendentes do Início, para completar depois.",
  },
];

export function RulesForm({ initial }: { initial: Record<RuleKey, boolean> }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(rule: RuleKey, next: boolean) {
    setError(null);
    setValues((prev) => ({ ...prev, [rule]: next }));
    startTransition(async () => {
      const result = await setRuleAction(rule, next);
      if (!result.success) {
        setValues((prev) => ({ ...prev, [rule]: !next }));
        setError(result.error ?? "Não foi possível salvar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {RULES.map((rule) => (
        <div key={rule.key} className="rounded-2xl border border-border bg-surface p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={values[rule.key]}
              disabled={isPending}
              onChange={(e) => toggle(rule.key, e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span>
              <span className="block text-sm font-semibold">{rule.title}</span>
              <span className="mt-1 block text-xs text-muted">{values[rule.key] ? rule.on : rule.off}</span>
            </span>
          </label>
        </div>
      ))}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="rounded-2xl border border-dashed border-border p-5 text-xs text-muted">
        <p className="mb-1 text-sm font-semibold text-foreground">Regras que ficam sempre ligadas</p>
        <p>
          Estas protegem os números e não podem ser desligadas: o estoque nunca fica negativo (se faltar peça, o
          sistema oferece dar a entrada), o pagamento nunca passa do saldo, e a OS não é entregue com item ainda
          &quot;planejado&quot;.
        </p>
      </div>
    </div>
  );
}
