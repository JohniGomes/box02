"use client";

import { useState, useRef, useTransition } from "react";
import { MicButton } from "@/components/MicButton";
import { appendTranscript } from "@/lib/voice";
import {
  analisarTextoAction,
  analisarImagemAction,
  confirmarLancamentoAction,
  type ReconciledData,
} from "@/app/dashboard/assistente/actions";
import { useRouter } from "next/navigation";

type Etapa = "idle" | "analisando" | "revisao" | "confirmando" | "concluido";

export function AssistenteChat() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [reconciliado, setReconciliado] = useState<ReconciledData | null>(null);
  const [tipoLancamento, setTipoLancamento] = useState<"ORCAMENTO" | "OS">("ORCAMENTO");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setTexto("");
    setEtapa("idle");
    setErro(null);
    setReconciliado(null);
  }

  function handleEnviarTexto() {
    if (!texto.trim()) return;
    setEtapa("analisando");
    setErro(null);
    startTransition(async () => {
      const result = await analisarTextoAction(texto);
      if (!result.success || !result.reconciliado) {
        setErro(result.error ?? "Erro desconhecido.");
        setEtapa("idle");
        return;
      }
      setReconciliado(result.reconciliado);
      setEtapa("revisao");
    });
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mimeType = file.type;
      setEtapa("analisando");
      setErro(null);
      startTransition(async () => {
        const result = await analisarImagemAction(base64, mimeType, texto || undefined);
        if (!result.success || !result.reconciliado) {
          setErro(result.error ?? "Erro ao analisar imagem.");
          setEtapa("idle");
          return;
        }
        setReconciliado(result.reconciliado);
        setEtapa("revisao");
      });
    };
    reader.readAsDataURL(file);
  }

  function handleConfirmar() {
    if (!reconciliado) return;
    setEtapa("confirmando");
    startTransition(async () => {
      const result = await confirmarLancamentoAction({ reconciliado, tipo: tipoLancamento });
      if (!result.success) {
        setErro(result.error ?? "Erro ao confirmar.");
        setEtapa("revisao");
        return;
      }
      setEtapa("concluido");
      if (result.redirectUrl) {
        setTimeout(() => {
          router.push(result.redirectUrl!);
          setAberto(false);
          reset();
        }, 1500);
      }
    });
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto((v) => !v)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 active:scale-95 md:bottom-6 print:hidden"
        aria-label="Assistente de lançamento"
        title="Assistente IA"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2zM7.5 14a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 21l1.5-3h15L21 21H3z" />
        </svg>
      </button>

      {/* Painel do chat */}
      {aberto && (
        <div className="fixed bottom-36 right-4 z-50 flex w-[min(90vw,420px)] flex-col rounded-2xl border border-border bg-surface shadow-2xl md:bottom-24 print:hidden">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-foreground px-4 py-3 text-background">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="font-semibold text-sm">Assistente BOX 02</span>
            </div>
            <button onClick={() => { setAberto(false); reset(); }} className="opacity-70 hover:opacity-100">✕</button>
          </div>

          <div className="flex flex-col gap-3 p-4">
            {/* Estado: idle ou analisando */}
            {(etapa === "idle" || etapa === "analisando") && (
              <>
                <p className="text-xs text-muted">
                  Digite ou fale (🎤) o que aconteceu, ou tire uma foto da anotação/nota fiscal. O sistema identifica o cliente, veículo e peças automaticamente.
                </p>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex: Troca de óleo do Celta do João Silva, placa ABC-1234, filtro + óleo 5W30..."
                  rows={4}
                  disabled={etapa === "analisando"}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-foreground disabled:opacity-50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleEnviarTexto}
                    disabled={!texto.trim() || etapa === "analisando"}
                    className="flex-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-40 hover:opacity-90"
                  >
                    {etapa === "analisando" ? "Analisando..." : "Analisar texto"}
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={etapa === "analisando"}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/10 disabled:opacity-40"
                    title="Enviar foto"
                  >
                    📷
                  </button>
                  <MicButton
                    onText={(spoken) => setTexto((prev) => appendTranscript(prev, spoken))}
                    disabled={etapa === "analisando"}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFoto}
                  />
                </div>
                {erro && <p className="text-xs text-red-500">{erro}</p>}
              </>
            )}

            {/* Estado: revisão */}
            {etapa === "revisao" && reconciliado && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Revisar dados identificados</p>
                  <button onClick={reset} className="text-xs text-muted hover:underline">Recomeçar</button>
                </div>

                {/* Cliente */}
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-medium text-muted mb-1">CLIENTE</p>
                  {reconciliado.cliente.acao === "SEM_CLIENTE" ? (
                    <p className="text-muted italic">Não identificado</p>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{reconciliado.cliente.nome}</p>
                        {reconciliado.cliente.telefone && (
                          <p className="text-muted">{reconciliado.cliente.telefone}</p>
                        )}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        reconciliado.cliente.acao === "USAR_EXISTENTE"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {reconciliado.cliente.acao === "USAR_EXISTENTE" ? "✓ Encontrado" : "+ Novo"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Veículo */}
                <div className="rounded-lg border border-border p-3 text-xs">
                  <p className="font-medium text-muted mb-1">VEÍCULO</p>
                  {reconciliado.veiculo.acao === "SEM_VEICULO" ? (
                    <p className="text-muted italic">Não identificado</p>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">
                          {[reconciliado.veiculo.modelo, reconciliado.veiculo.placa]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        reconciliado.veiculo.acao === "USAR_EXISTENTE"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {reconciliado.veiculo.acao === "USAR_EXISTENTE" ? "✓ Encontrado" : "+ Novo"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Itens */}
                {reconciliado.itens.length > 0 && (
                  <div className="rounded-lg border border-border p-3 text-xs">
                    <p className="font-medium text-muted mb-2">ITENS ({reconciliado.itens.length})</p>
                    <div className="flex flex-col gap-1.5">
                      {reconciliado.itens.map((item, i) => (
                        <div key={i} className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="text-[10px] font-medium text-muted">{item.tipo} · </span>
                            <span>{item.registroNome ?? item.descricao}</span>
                            {item.quantidade > 1 && (
                              <span className="text-muted"> × {item.quantidade}</span>
                            )}
                          </div>
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                            item.acao === "USAR_EXISTENTE"
                              ? "bg-green-100 text-green-700"
                              : item.acao === "CRIAR_NOVO"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-zinc-100 text-zinc-500"
                          }`}>
                            {item.acao === "USAR_EXISTENTE" ? "✓" : item.acao === "CRIAR_NOVO" ? "+Novo" : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observações */}
                {reconciliado.extracted.observacoes && (
                  <p className="text-xs text-muted italic">
                    Obs: {reconciliado.extracted.observacoes}
                  </p>
                )}

                {/* Tipo de lançamento */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTipoLancamento("ORCAMENTO")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      tipoLancamento === "ORCAMENTO"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted/10"
                    }`}
                  >
                    Orçamento
                  </button>
                  <button
                    onClick={() => setTipoLancamento("OS")}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      tipoLancamento === "OS"
                        ? "border-foreground bg-foreground text-background"
                        : "border-border hover:bg-muted/10"
                    }`}
                  >
                    Ordem de Serviço
                  </button>
                </div>

                {erro && <p className="text-xs text-red-500">{erro}</p>}

                <button
                  onClick={handleConfirmar}
                  disabled={isPending}
                  className="w-full rounded-lg bg-foreground py-2.5 text-sm font-semibold text-background disabled:opacity-40 hover:opacity-90"
                >
                  {isPending ? "Criando..." : `Criar ${tipoLancamento === "ORCAMENTO" ? "Orçamento" : "OS"}`}
                </button>
              </div>
            )}

            {/* Estado: concluído */}
            {etapa === "concluido" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-sm">Lançamento criado!</p>
                <p className="text-xs text-muted">Redirecionando para o formulário...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
