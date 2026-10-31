"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generateVehicleQrAction, revokeVehicleQrAction } from "./qrActions";

/** Botões do cartão QR Car na ficha do veículo. */
export function QrCarActions({ vehicleId, url }: { vehicleId: string; url: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<"regenerate" | "revoke" | null>(null);

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.success) {
        setError(result.error ?? "Não foi possível concluir.");
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem permissão de copiar: a pessoa seleciona o link na tela */
    }
  }

  const outline = "h-10 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-50";

  if (!url) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => generateVehicleQrAction(vehicleId))}
          className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Gerando…" : "Gerar QR Car"}
        </button>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/veiculos/${vehicleId}/etiqueta`} className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground">
          Imprimir etiqueta
        </Link>
        <button type="button" onClick={copy} className={outline}>
          {copied ? "Link copiado!" : "Copiar link"}
        </button>
        <a href={url} target="_blank" rel="noreferrer" className={`${outline} flex items-center`}>
          Ver como o cliente vê
        </a>
      </div>

      {confirming ? (
        <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
          <p>
            {confirming === "regenerate"
              ? "Gerar um novo QR faz o QR antigo parar de funcionar. Você terá que imprimir a etiqueta de novo."
              : "Desativar o QR faz o link parar de funcionar. Dá para gerar de novo depois."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => (confirming === "regenerate" ? generateVehicleQrAction(vehicleId) : revokeVehicleQrAction(vehicleId)))}
              className="h-10 flex-1 rounded-xl bg-danger text-sm font-semibold text-white disabled:opacity-50"
            >
              {confirming === "regenerate" ? "Gerar novo QR" : "Desativar QR"}
            </button>
            <button type="button" onClick={() => setConfirming(null)} className="h-10 flex-1 rounded-xl border border-border text-sm">
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => setConfirming("regenerate")} className="font-medium text-muted underline">
            Gerar novo QR
          </button>
          <button type="button" onClick={() => setConfirming("revoke")} className="font-medium text-danger underline">
            Desativar QR
          </button>
        </div>
      )}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
