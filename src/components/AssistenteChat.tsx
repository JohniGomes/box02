"use client";

import { useState, useRef, useTransition } from "react";
import { MicButton } from "@/components/MicButton";
import { formatBRL } from "@/lib/money";
import { appendTranscript } from "@/lib/voice";
import { fileToResizedJpegBase64 } from "@/lib/imageResize";
import {
  analisarTextoAction,
  analisarImagemAction,
  confirmarLancamentoAction,
  type AssistenteResult,
  type ConsultaPeca,
  type ReconciledData,
} from "@/app/dashboard/assistente/actions";
import type { Resposta } from "@/lib/assistant/answers";
import { GRUPOS_PERGUNTAS } from "@/lib/assistant/frequentQuestions";
import { PartCodesPanel } from "@/app/dashboard/estoque/ficha/PartCodesPanel";
import { useRouter } from "next/navigation";

type Etapa = "idle" | "analisando" | "revisao" | "confirmando" | "concluido" | "consulta" | "resposta";

/** Confere o que o robô entendeu (veículo e peça, editáveis) e mostra os cards de código. */
function ConsultaPecaBox({
  consulta,
  onVehicle,
  onNewQuestion,
}: {
  consulta: ConsultaPeca;
  /** Avisa o robô do veículo (já editado) para lembrar na próxima pergunta. */
  onVehicle: (label: string) => void;
  onNewQuestion: () => void;
}) {
  const [marca, setMarcaState] = useState(consulta.veiculo.marca);
  const [modelo, setModeloState] = useState(consulta.veiculo.modelo);
  const [ano, setAnoState] = useState(consulta.veiculo.ano);
  const [peca, setPeca] = useState(consulta.peca);
  const setMarca = (v: string) => { setMarcaState(v); onVehicle([v, modelo, ano].filter(Boolean).join(" ")); };
  const setModelo = (v: string) => { setModeloState(v); onVehicle([marca, v, ano].filter(Boolean).join(" ")); };
  const setAno = (v: string) => { setAnoState(v); onVehicle([marca, modelo, v].filter(Boolean).join(" ")); };
  const falta = !marca.trim() || !modelo.trim();
  const campo = (falhando: boolean) =>
    `w-full rounded-lg border bg-background px-2 py-1.5 text-xs ${falhando ? "border-yellow-500" : "border-border"}`;

  return (
    <>
      {falta ? <p className="rounded-lg bg-yellow-100 p-2 text-xs text-yellow-800">Faltou a marca ou o modelo do veículo. Complete abaixo.</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Marca
          <input value={marca} onChange={(e) => setMarca(e.target.value)} className={campo(!marca.trim())} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Modelo
          <input value={modelo} onChange={(e) => setModelo(e.target.value)} className={campo(!modelo.trim())} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Ano
          <input value={ano} onChange={(e) => setAno(e.target.value)} className={campo(false)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-muted">
          Peça
          <input value={peca} onChange={(e) => setPeca(e.target.value)} className={campo(peca.trim().length < 2)} />
        </label>
      </div>
      <PartCodesPanel vehicle={{ marca, modelo, ano, versao: consulta.veiculo.versao }} part={peca} compact onNewQuestion={onNewQuestion} />
    </>
  );
}

export function AssistenteChat() {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [reconciliado, setReconciliado] = useState<ReconciledData | null>(null);
  const [consulta, setConsulta] = useState<ConsultaPeca | null>(null);
  const [resposta, setResposta] = useState<Resposta | null>(null);
  /** Veículo de que a conversa já tratava ("Honda HR-V 2017"): vale para a próxima pergunta, até "Nova conversa". */
  const [contexto, setContexto] = useState<string | null>(null);
  const [tipoLancamento, setTipoLancamento] = useState<"ORCAMENTO" | "OS">("ORCAMENTO");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function reset() {
    setTexto("");
    setEtapa("idle");
    setErro(null);
    setReconciliado(null);
    setConsulta(null);
    setResposta(null);
    setContexto(null);
  }

  /** Outra pergunta na mesma conversa: limpa a tela, mas lembra o veículo. */
  function novaPergunta() {
    setTexto("");
    setEtapa("idle");
    setErro(null);
    setReconciliado(null);
    setConsulta(null);
    setResposta(null);
  }

  function receber(result: AssistenteResult, erroPadrao: string) {
    if (result.success && result.resposta) {
      setResposta(result.resposta);
      setEtapa("resposta");
      return;
    }
    if (result.success && result.consulta) {
      const v = result.consulta.veiculo;
      const label = [v.marca, v.modelo, v.ano].filter(Boolean).join(" ");
      if (label) setContexto(label);
      setConsulta(result.consulta);
      setEtapa("consulta");
      return;
    }
    if (!result.success || !result.reconciliado) {
      setErro(result.error ?? erroPadrao);
      setEtapa("idle");
      return;
    }
    setReconciliado(result.reconciliado);
    setEtapa("revisao");
  }

  function handleEnviarTexto(override?: string) {
    const enviado = override ?? texto;
    if (!enviado.trim()) return;
    setTexto(enviado);
    setEtapa("analisando");
    setErro(null);
    startTransition(async () => {
      receber(await analisarTextoAction(enviado, contexto ?? undefined), "Erro desconhecido.");
    });
  }

  function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setEtapa("analisando");
    setErro(null);
    startTransition(async () => {
      let foto: { base64: string; mimeType: string };
      try {
        // Reduz a foto no celular: foto da câmera passa de vários MB e o envio aceita cerca de 1 MB.
        foto = await fileToResizedJpegBase64(file);
      } catch {
        setErro("Não consegui preparar a foto. Tente outra foto.");
        setEtapa("idle");
        return;
      }
      receber(await analisarImagemAction(foto.base64, foto.mimeType, texto || undefined), "Erro ao analisar imagem.");
    });
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
                  Digite ou fale (🎤) o que aconteceu, ou tire uma foto da anotação/nota fiscal. O sistema identifica o cliente, veículo e peças automaticamente. Também dá para pedir o código de uma peça (ex.: &quot;código do freio dianteiro do HR-V 2017&quot;) ou perguntar sobre dinheiro, OS, estoque, clientes, agenda e mensagens (ex.: &quot;quanto tenho a receber?&quot;).
                </p>
                {contexto ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-yellow-100 px-3 py-2 text-xs text-yellow-900">
                    <span>Conversa sobre: <strong>{contexto}</strong></span>
                    <button onClick={reset} className="shrink-0 font-semibold underline">Nova conversa</button>
                  </div>
                ) : null}
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
                    onClick={() => handleEnviarTexto()}
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
                    className="hidden"
                    onChange={handleFoto}
                  />
                </div>
                {erro && <p className="text-xs text-red-500">{erro}</p>}
                <details className="rounded-lg border border-border p-2">
                  <summary className="cursor-pointer text-xs font-semibold">Perguntas frequentes (toque para abrir)</summary>
                  <div className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
                    {GRUPOS_PERGUNTAS.map((g) => (
                      <div key={g.grupo} className="flex flex-col gap-1">
                        <p className="text-[11px] font-medium text-muted">{g.grupo}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.perguntas.map((q) => (
                            <button
                              key={q.rotulo}
                              type="button"
                              disabled={etapa === "analisando"}
                              onClick={() => (q.enviar ? handleEnviarTexto(q.texto) : setTexto(q.texto))}
                              className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted/10 disabled:opacity-40"
                            >
                              {q.rotulo}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            )}

            {/* Estado: resposta de uma pergunta sobre o negócio */}
            {etapa === "resposta" && resposta && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{resposta.titulo}</p>
                  <button onClick={novaPergunta} className="text-xs text-muted hover:underline">Voltar</button>
                </div>
                {resposta.linhas.length > 0 && (
                  <dl className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-xs">
                    {resposta.linhas.map((l, i) => (
                      <div key={i} className={`flex items-start justify-between gap-3 ${l.destaque ? "text-sm font-semibold" : ""}`}>
                        <dt className={l.destaque ? "" : "text-muted"}>{l.rotulo}</dt>
                        <dd className="shrink-0 text-right">{l.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {resposta.passos && resposta.passos.length > 0 && (
                  <ol className="flex list-decimal flex-col gap-2 rounded-lg border border-border p-3 pl-7 text-xs">
                    {resposta.passos.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                )}
                {resposta.aviso && <p className="rounded-lg bg-yellow-100 p-2 text-xs text-yellow-900">{resposta.aviso}</p>}
                {resposta.links.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {resposta.links.map((l) => (
                      <a key={l.href} href={l.href} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium underline">
                        {l.texto}
                      </a>
                    ))}
                  </div>
                )}
                <button onClick={novaPergunta} className="h-11 rounded-xl border border-border text-sm font-semibold">
                  Nova pergunta
                </button>
              </div>
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
                            {(item.precoUnitarioCentavos ?? item.precoSugeridoCentavos) != null ? (
                              <span className="ml-1 font-medium">
                                {formatBRL((item.precoUnitarioCentavos ?? item.precoSugeridoCentavos) as number)}
                                {item.precoUnitarioCentavos == null ? <span className="text-muted"> (do cadastro)</span> : null}
                              </span>
                            ) : (
                              <span className="ml-1 text-muted">sem valor</span>
                            )}
                          </div>
                          <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${
                            item.acao === "USAR_EXISTENTE"
                              ? "bg-green-100 text-green-700"
                              : item.acao === "CRIAR_NOVO"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-zinc-100 text-zinc-500"
                          }`}>
                            {item.acao === "USAR_EXISTENTE" ? "✓ do cadastro" : item.acao === "CRIAR_NOVO" ? "texto livre" : "ignorado"}
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
                  {isPending ? "Preparando..." : `Montar rascunho de ${tipoLancamento === "ORCAMENTO" ? "Orçamento" : "OS"}`}
                </button>
              </div>
            )}

            {/* Estado: pedido de código de peça */}
            {etapa === "consulta" && consulta && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Código de peça</p>
                  <button onClick={novaPergunta} className="text-xs text-muted hover:underline">Voltar</button>
                </div>
                <ConsultaPecaBox consulta={consulta} onVehicle={(label) => setContexto(label || null)} onNewQuestion={novaPergunta} />
              </div>
            )}

            {/* Estado: concluído */}
            {etapa === "concluido" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="text-4xl">✅</div>
                <p className="font-semibold text-sm">Rascunho pronto!</p>
                <p className="text-xs text-muted">Abrindo o formulário com tudo preenchido. Confira e salve lá.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
