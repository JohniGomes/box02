"use client";

import { useState, useTransition } from "react";
import { consultPartCodesAction } from "./actions";
import type { PartCodeResult, PartConsultResponse } from "@/lib/parts/consult";

const CONFIDENCE_LABEL: Record<PartCodeResult["confianca"], { text: string; className: string }> = {
  ALTA: { text: "Confiança alta (2+ fontes)", className: "bg-success/15 text-success" },
  MEDIA: { text: "Confiança média (1 fonte)", className: "bg-accent/15 text-foreground" },
  BAIXA: { text: "Sem fonte confirmada", className: "bg-danger/15 text-danger" },
};

/** Sugestão de códigos de peça pela IA (com pesquisa na internet), em cards. Nunca trava nada. */
export function PartCodesPanel({
  vehicle,
  part,
}: {
  vehicle: { marca: string; modelo: string; ano: string; versao: string };
  part: string;
}) {
  const [data, setData] = useState<PartConsultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ready = vehicle.marca.trim() && vehicle.modelo.trim() && part.trim().length >= 2;

  function run(refresh: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await consultPartCodesAction(
        {
          marca: vehicle.marca,
          modelo: vehicle.modelo,
          ano: vehicle.ano || undefined,
          versao: vehicle.versao || undefined,
          peca: part,
        },
        refresh,
      );
      if (!result.success || !result.data) {
        setError(result.error ?? "A consulta está indisponível agora.");
        return;
      }
      setData(result.data);
    });
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      /* sem permissão de copiar: a pessoa seleciona o código na tela */
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">Sugerir códigos com IA</h2>
        <p className="text-xs text-muted">
          Pesquisa códigos das marcas Mahle, Metal Leve, Bosch, Fras-le, Magneti Marelli, Cofap, Nakata, LUK e Sachs para o veículo e a
          peça acima.
        </p>
      </div>
      <button
        type="button"
        onClick={() => run(false)}
        disabled={isPending || !ready}
        className="h-12 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Pesquisando na internet… (pode levar alguns segundos)" : "Sugerir códigos da peça"}
      </button>
      {!ready ? <p className="text-xs text-muted">Preencha marca, modelo e a peça que você procura.</p> : null}
      {error ? <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      {data ? (
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-accent/10 p-3 text-xs">
            <strong>Atenção:</strong> {data.aviso}
          </p>
          {data.resultados.length === 0 ? (
            <p className="text-sm text-muted">Não encontrei códigos confiáveis para essa peça. Tente outro nome ou confira com o fornecedor.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.resultados.map((r) => (
                <li key={`${r.marca}-${r.codigo}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{r.marca}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONFIDENCE_LABEL[r.confianca].className}`}>
                      {CONFIDENCE_LABEL[r.confianca].text}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-all font-mono text-xl font-bold">{r.codigo}</span>
                    <button
                      type="button"
                      onClick={() => copy(r.codigo)}
                      className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-medium"
                    >
                      {copiedCode === r.codigo ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  {r.descricao ? <p className="text-sm">{r.descricao}</p> : null}
                  {r.aplicacao ? <p className="text-xs text-muted">{r.aplicacao}</p> : null}
                  {r.fontes.length > 0 ? (
                    <p className="text-xs">
                      Fontes:{" "}
                      {r.fontes.map((f, i) => (
                        <span key={f.uri}>
                          {i > 0 ? " · " : ""}
                          <a href={f.uri} target="_blank" rel="noopener noreferrer" className="font-medium text-accent underline">
                            {f.title} ↗
                          </a>
                        </span>
                      ))}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">Nenhuma fonte da pesquisa confirmou este código. Confira com o fornecedor.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            <span>
              {data.fromCache ? "Resultado guardado" : "Consulta nova"} · {new Date(data.consultedAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </span>
            <button type="button" onClick={() => run(true)} disabled={isPending} className="font-semibold text-accent underline disabled:opacity-50">
              Consultar de novo
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
