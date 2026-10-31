import { getMonthFinanceService } from "@/lib/finance/service";
import { currentMonthBr, monthLabel, parseMonth, percentChange, shiftMonth } from "@/lib/finance/month";
import { findWorkOrderByNumber, listReceivables } from "@/lib/db/repositories/workOrders";
import { getWorkOrderMarginService } from "@/lib/workOrders/marginService";
import { formatBRL } from "@/lib/money";
import { agenda, historicoCliente, mensagensPendentes, osAbertas, pecaEstoque, pecasAcabando, trocasVencidas } from "./answersDayToDay";

/**
 * Perguntas de leitura do robô. A IA só ESCOLHE a consulta (e o mês/OS citados); os números vêm
 * do banco por estas funções, formatados aqui. Nada daqui altera dados.
 */

export const CONSULTAS = [
  "RESUMO_MES",
  "A_RECEBER",
  "LUCRO_OS",
  "TAXA_CARTAO",
  "OS_ABERTAS",
  "PECAS_ACABANDO",
  "PECA_ESTOQUE",
  "HISTORICO_CLIENTE",
  "AGENDA",
  "MENSAGENS",
  "TROCAS",
] as const;
export type Consulta = (typeof CONSULTAS)[number];

export interface Pergunta {
  consulta: string;
  /** "ATUAL", "ANTERIOR" ou "AAAA-MM". */
  mes?: string;
  /** Número da OS como a pessoa falou ("OS-20", "20", "OS-000020"). */
  os?: string;
  /** Nome da peça (PECA_ESTOQUE). */
  peca?: string;
  /** Nome do cliente (HISTORICO_CLIENTE). */
  cliente?: string;
  /** "HOJE", "AMANHA" ou "AAAA-MM-DD" (AGENDA). */
  dia?: string;
}

export interface Resposta {
  titulo: string;
  linhas: { rotulo: string; valor: string; destaque?: boolean }[];
  links: { texto: string; href: string }[];
  /** Observação em destaque (limite do número, o que não deu para achar, etc.). */
  aviso?: string;
}

export function resolveMonth(mes: string | undefined, now: Date = new Date()): string {
  const v = (mes ?? "").trim().toUpperCase();
  if (v === "ANTERIOR") return shiftMonth(currentMonthBr(now), -1);
  if (v === "" || v === "ATUAL") return currentMonthBr(now);
  return parseMonth(mes?.trim(), now);
}

/** "OS-20", "os 20", "20", "OS-000020" → "OS-000020"; null se não houver número. */
export function normalizeWorkOrderNumber(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 6) return null;
  return `OS-${digits.padStart(6, "0")}`;
}

function desconhecida(): Resposta {
  return {
    titulo: "Ainda não sei responder isso",
    linhas: [],
    links: [],
    aviso: "Eu respondo sobre: dinheiro (resumo do mês, a receber, lucro de uma OS, taxa de cartão), OS na oficina, peças (acabando, saldo, último fornecedor), histórico de cliente, agenda, mensagens e trocas. Toque em uma pergunta pronta ou reescreva.",
  };
}

async function resumoMes(month: string): Promise<Resposta> {
  const { current: c, previous: p } = await getMonthFinanceService(month);
  const change = percentChange(c.resultCents, p.resultCents);
  const linhas: Resposta["linhas"] = [
    { rotulo: "Entrou", valor: formatBRL(c.revenueCents) },
    { rotulo: "Saiu (despesas pagas)", valor: formatBRL(c.expensesCents) },
    { rotulo: "Resultado do mês", valor: formatBRL(c.resultCents), destaque: true },
    { rotulo: "Resultado antes do pró-labore", valor: formatBRL(c.resultBeforeProLaboreCents) },
    { rotulo: `Lucro das ${c.margin.osCount} OS entregues`, valor: `${formatBRL(c.margin.profitCents)}${c.margin.marginPercent != null ? ` (${c.margin.marginPercent}%)` : ""}` },
    { rotulo: `Resultado em ${monthLabel(p.month)}`, valor: `${formatBRL(p.resultCents)}${change != null ? ` (${change > 0 ? "+" : ""}${change}% no mês)` : ""}` },
  ];
  const avisos: string[] = [];
  if (c.unpaidDueCount > 0) avisos.push(`Ainda há ${c.unpaidDueCount} despesa(s) a pagar neste mês, somando ${formatBRL(c.unpaidDueCents)}, que não entram em "Saiu".`);
  if (c.margin.itemsWithoutCost > 0) avisos.push(`${c.margin.itemsWithoutCost} item(ns) executado(s) sem custo informado: o lucro real pode ser menor.`);
  return {
    titulo: `Financeiro de ${monthLabel(month)}`,
    linhas,
    links: [{ texto: "Abrir o Financeiro", href: `/dashboard/financeiro?mes=${month}` }],
    aviso: avisos.length ? avisos.join(" ") : undefined,
  };
}

async function aReceber(): Promise<Resposta> {
  const rows = await listReceivables();
  if (rows.length === 0) return { titulo: "A receber", linhas: [{ rotulo: "Total", valor: formatBRL(0), destaque: true }], links: [], aviso: "Nenhuma OS entregue com saldo em aberto." };
  const total = rows.reduce((s, r) => s + r.balanceCents, 0);
  const shown = rows.slice(0, 10);
  return {
    titulo: "A receber",
    linhas: [
      { rotulo: `Total (${rows.length} OS)`, valor: formatBRL(total), destaque: true },
      ...shown.map((r) => ({ rotulo: `${r.number} · ${r.customerName}`, valor: formatBRL(r.balanceCents) })),
    ],
    links: shown.slice(0, 5).map((r) => ({ texto: `Abrir ${r.number}`, href: `/dashboard/os/${r.id}` })),
    aviso: rows.length > shown.length ? `Mostrando as 10 mais antigas; há mais ${rows.length - shown.length}.` : undefined,
  };
}

async function lucroOs(os: string | undefined): Promise<Resposta> {
  const number = normalizeWorkOrderNumber(os);
  if (!number) return { titulo: "Lucro de uma OS", linhas: [], links: [], aviso: "Qual OS? Escreva o número, por exemplo: lucro da OS-20." };
  const found = await findWorkOrderByNumber(number);
  if (!found) return { titulo: `Lucro da ${number}`, linhas: [], links: [], aviso: `Não achei a ${number}.` };
  const m = await getWorkOrderMarginService(found.id);
  const avisos: string[] = [];
  if (m.itemsWithoutCost > 0) avisos.push(`${m.itemsWithoutCost} item(ns) sem custo informado: o lucro real pode ser menor.`);
  if (m.pendingItems > 0) avisos.push(`${m.pendingItems} item(ns) ainda planejado(s): o valor é parcial.`);
  return {
    titulo: `Lucro da ${found.number} · ${found.customerName}`,
    linhas: [
      { rotulo: "Receita (itens executados)", valor: formatBRL(m.revenueCents) },
      { rotulo: "Custo", valor: formatBRL(m.costCents) },
      { rotulo: `Taxa estimada do cartão (${String(m.cardFeePercent).replace(".", ",")}%)`, valor: formatBRL(m.cardFeeCents) },
      { rotulo: "Lucro", valor: `${formatBRL(m.profitCents)}${m.marginPercent != null ? ` (${m.marginPercent}%)` : ""}`, destaque: true },
    ],
    links: [{ texto: `Abrir ${found.number}`, href: `/dashboard/os/${found.id}` }],
    aviso: avisos.length ? avisos.join(" ") : undefined,
  };
}

async function taxaCartao(month: string): Promise<Resposta> {
  const { current: c } = await getMonthFinanceService(month);
  return {
    titulo: `Taxa de cartão em ${monthLabel(month)}`,
    linhas: [
      { rotulo: "Recebido no cartão", valor: formatBRL(c.byMethod.cartaoCents) },
      { rotulo: `Taxa estimada (${String(c.cardFeePercent).replace(".", ",")}%)`, valor: formatBRL(c.cardFeeCents), destaque: true },
    ],
    links: [{ texto: "Abrir o Financeiro", href: `/dashboard/financeiro?mes=${month}` }],
    aviso: "É uma estimativa pela porcentagem das Regras, não o valor exato da maquininha.",
  };
}

export async function responderPergunta(p: Pergunta, now: Date = new Date()): Promise<Resposta> {
  const consulta = (p.consulta ?? "").toUpperCase();
  switch (consulta) {
    case "RESUMO_MES":
      return resumoMes(resolveMonth(p.mes, now));
    case "A_RECEBER":
      return aReceber();
    case "LUCRO_OS":
      return lucroOs(p.os);
    case "TAXA_CARTAO":
      return taxaCartao(resolveMonth(p.mes, now));
    case "OS_ABERTAS":
      return osAbertas();
    case "PECAS_ACABANDO":
      return pecasAcabando();
    case "PECA_ESTOQUE":
      return pecaEstoque(p.peca);
    case "HISTORICO_CLIENTE":
      return historicoCliente(p.cliente);
    case "AGENDA":
      return agenda(p.dia, now);
    case "MENSAGENS":
      return mensagensPendentes();
    case "TROCAS":
      return trocasVencidas();
    default:
      return desconhecida();
  }
}
