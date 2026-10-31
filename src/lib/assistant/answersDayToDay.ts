import { listYardWorkOrders } from "@/lib/db/repositories/workOrders";
import { listPartsWithStock, type PartWithStock } from "@/lib/db/repositories/parts";
import { listLastSuppliersForPart } from "@/lib/db/repositories/partPurchases";
import { listAppointmentsWithNamesBetween } from "@/lib/db/repositories/appointments";
import { searchCustomers } from "@/lib/db/repositories/customers";
import { getCustomerHistoryService } from "@/lib/customers/service";
import { getMessageCenterService } from "@/lib/messages/service";
import { WORK_ORDER_STATUS_LABEL } from "@/app/dashboard/os/statusLabels";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dateBr";
import { formatPlate } from "@/lib/validation/plate";
import type { Resposta } from "./answers";

/** Respostas de leitura do dia a dia (OS, estoque, clientes, agenda, mensagens). Nada aqui altera dados. */

const DAY_MS = 86400000;

export async function osAbertas(): Promise<Resposta> {
  const rows = await listYardWorkOrders();
  if (rows.length === 0) return { titulo: "OS na oficina", linhas: [], links: [], aviso: "Nenhuma OS aberta ou em andamento agora." };
  const shown = rows.slice(0, 15);
  return {
    titulo: `OS na oficina (${rows.length})`,
    linhas: shown.map((r) => ({
      rotulo: `${r.number} · ${r.customerName}${r.vehiclePlate ? ` · ${formatPlate(r.vehiclePlate)}` : ""}`,
      valor: WORK_ORDER_STATUS_LABEL[r.status] ?? r.status,
    })),
    links: shown.slice(0, 5).map((r) => ({ texto: `Abrir ${r.number}`, href: `/dashboard/os/${r.id}` })),
    aviso: rows.length > shown.length ? `Mostrando as 15 mais antigas; há mais ${rows.length - shown.length}.` : undefined,
  };
}

export async function pecasAcabando(): Promise<Resposta> {
  const parts = (await listPartsWithStock()).filter((p) => p.status === "ATIVO");
  // "Acabando" = no mínimo definido ou abaixo, ou saldo negativo. Peça zerada sem mínimo é só contada no aviso
  // (o catálogo guarda muita peça que não se mantém em estoque).
  const low = parts.filter((p) => p.currentStock < 0 || (p.minStock != null && p.currentStock <= p.minStock));
  const zeroNoMin = parts.filter((p) => p.minStock == null && p.currentStock === 0).length;
  const notes: string[] = [];
  if (zeroNoMin > 0) notes.push(`${zeroNoMin} peça(s) estão zeradas mas sem estoque mínimo definido, então não entram na lista.`);
  if (low.length === 0) {
    return { titulo: "Peças acabando", linhas: [], links: [{ texto: "Abrir o Estoque", href: "/dashboard/estoque" }], aviso: ["Nenhuma peça ativa no mínimo ou negativa.", ...notes].join(" ") };
  }
  const shown = low.slice(0, 15);
  if (low.length > shown.length) notes.unshift(`Mostrando 15 de ${low.length}.`);
  return {
    titulo: `Peças acabando (${low.length})`,
    linhas: shown.map((p) => ({
      rotulo: `${p.name}${p.minStock != null ? ` (mínimo ${p.minStock})` : ""}`,
      valor: `${p.currentStock} ${p.unit}`,
      destaque: p.currentStock <= 0,
    })),
    links: [{ texto: "Abrir o Estoque", href: "/dashboard/estoque" }],
    aviso: notes.length ? notes.join(" ") : undefined,
  };
}

function partLine(p: PartWithStock) {
  return {
    rotulo: `${p.name}${p.sku ? ` · ${p.sku}` : ""}`,
    valor: `${p.currentStock} ${p.unit}${p.costCents != null ? ` · custo ${formatBRL(p.costCents)}` : " · sem custo"}`,
  };
}

export async function pecaEstoque(nome: string | undefined): Promise<Resposta> {
  const query = (nome ?? "").trim();
  if (query.length < 2) return { titulo: "Estoque de uma peça", linhas: [], links: [], aviso: "Qual peça? Escreva o nome, por exemplo: quanto tenho de filtro de óleo?" };
  const found = (await listPartsWithStock(query)).filter((p) => p.status === "ATIVO");
  if (found.length === 0) {
    return { titulo: `Estoque de "${query}"`, linhas: [], links: [{ texto: "Abrir o Estoque", href: "/dashboard/estoque" }], aviso: "Não achei peça com esse nome no estoque." };
  }
  const shown = found.slice(0, 8);
  const linhas: Resposta["linhas"] = shown.map(partLine);
  if (found.length === 1) {
    const suppliers = await listLastSuppliersForPart(found[0].id);
    if (suppliers.length === 0) linhas.push({ rotulo: "Última compra", valor: "sem compra registrada" });
    for (const s of suppliers) linhas.push({ rotulo: `Comprada de ${s.supplierName ?? "fornecedor não informado"}`, valor: `${formatDateBR(s.purchaseDate)} · ${s.quantity} un` });
  }
  return {
    titulo: `Estoque de "${query}"`,
    linhas,
    links: [{ texto: "Abrir o Estoque", href: "/dashboard/estoque" }],
    aviso: found.length > shown.length ? `Mostrando 8 de ${found.length}; seja mais específico.` : found.length > 1 ? "Achei mais de uma; escreva o nome mais completo para ver o último fornecedor." : undefined,
  };
}

export async function historicoCliente(nome: string | undefined): Promise<Resposta> {
  const query = (nome ?? "").trim();
  if (query.length < 2) return { titulo: "Histórico de cliente", linhas: [], links: [], aviso: "Qual cliente? Escreva o nome, por exemplo: o que o Carlos Augusto já fez aqui?" };
  const { items } = await searchCustomers({ query, limit: 6 });
  if (items.length === 0) return { titulo: `Cliente "${query}"`, linhas: [], links: [], aviso: "Não achei cliente com esse nome." };
  if (items.length > 1) {
    return {
      titulo: `Achei ${items.length} clientes com "${query}"`,
      linhas: items.map((c) => ({ rotulo: c.legalName, valor: c.status === "ATIVO" ? "ativo" : "inativo" })),
      links: items.slice(0, 5).map((c) => ({ texto: `Abrir ${c.legalName}`, href: `/dashboard/clientes/${c.id}` })),
      aviso: "Escreva o nome mais completo para eu mostrar o histórico de um só.",
    };
  }
  const c = items[0];
  const h = await getCustomerHistoryService(c.id);
  const delivered = h.workOrders.filter((w) => w.status === "ENTREGUE");
  const last = delivered.find((w) => w.deliveredAt) ?? null;
  const shown = h.workOrders.slice(0, 6);
  return {
    titulo: `Histórico de ${c.legalName}`,
    linhas: [
      { rotulo: "OS no total", valor: String(h.totalWorkOrders) },
      { rotulo: "Total gasto (OS entregues)", valor: formatBRL(h.totalSpentCents), destaque: true },
      { rotulo: "Última entrega", valor: last?.deliveredAt ? formatDateBR(last.deliveredAt) : "nenhuma" },
      ...shown.map((w) => ({
        rotulo: `${w.number} · ${formatDateBR(w.entryAt)}${w.vehiclePlateSnapshot ? ` · ${formatPlate(w.vehiclePlateSnapshot)}` : ""}`,
        valor: `${WORK_ORDER_STATUS_LABEL[w.status] ?? w.status}${w.status === "ENTREGUE" ? ` · ${formatBRL(w.totalCents)}` : ""}`,
      })),
    ],
    links: [{ texto: "Abrir a ficha do cliente", href: `/dashboard/clientes/${c.id}` }, ...shown.slice(0, 3).map((w) => ({ texto: `Abrir ${w.number}`, href: `/dashboard/os/${w.id}` }))],
    aviso: h.workOrders.length > shown.length ? `Mostrando as 6 mais recentes de ${h.workOrders.length}.` : undefined,
  };
}

/** "HOJE", "AMANHA", "AAAA-MM-DD" → "AAAA-MM-DD" (data de Brasília); null se não entendeu. */
export function resolveDay(dia: string | undefined, now: Date = new Date()): string | null {
  const v = (dia ?? "").trim().toUpperCase().replace("Ã", "A");
  const today = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  if (v === "" || v === "HOJE") return today;
  if (v === "AMANHA") return new Date(new Date(`${today}T00:00:00.000Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
  if (v === "ONTEM") return new Date(new Date(`${today}T00:00:00.000Z`).getTime() - DAY_MS).toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime()) ? v : null;
}

const APPOINTMENT_STATUS: Record<string, string> = { AGENDADO: "", CANCELADO: " (cancelado)", COMPARECEU: " (compareceu)", NAO_COMPARECEU: " (faltou)" };

export async function agenda(dia: string | undefined, now: Date = new Date()): Promise<Resposta> {
  const day = resolveDay(dia, now);
  if (!day) return { titulo: "Agenda", linhas: [], links: [], aviso: "Não entendi o dia. Pergunte por hoje, amanhã ou uma data (ex.: 2026-11-05)." };
  // Os agendamentos guardam a hora como digitada (relógio de parede lido em UTC).
  const from = new Date(`${day}T00:00:00.000Z`);
  const rows = await listAppointmentsWithNamesBetween(from, new Date(from.getTime() + DAY_MS));
  const label = `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
  if (rows.length === 0) return { titulo: `Agenda de ${label}`, linhas: [], links: [{ texto: "Abrir agendamentos", href: "/dashboard/agendamentos" }], aviso: "Nenhum agendamento nesse dia." };
  return {
    titulo: `Agenda de ${label} (${rows.length})`,
    linhas: rows.map((a) => ({
      rotulo: `${String(a.scheduledAt.getUTCHours()).padStart(2, "0")}:${String(a.scheduledAt.getUTCMinutes()).padStart(2, "0")} · ${a.customerName}${a.vehicleDescription ? ` · ${a.vehicleDescription}` : ""}`,
      valor: `${a.description ?? "sem descrição"}${APPOINTMENT_STATUS[a.status] ?? ""}`,
    })),
    links: [{ texto: "Abrir agendamentos", href: "/dashboard/agendamentos" }],
  };
}

export async function mensagensPendentes(): Promise<Resposta> {
  const c = await getMessageCenterService();
  const linhas = [
    { rotulo: "Pedidos de permissão para lembretes", valor: String(c.permissions.length) },
    { rotulo: "Lembretes de hoje e amanhã", valor: String(c.reminders.length) },
    { rotulo: "Confirmações de agendamento", valor: String(c.confirmations.length) },
    { rotulo: "Saldo a receber (cobrança)", valor: String(c.balances.length) },
    { rotulo: "Lembretes de próxima troca", valor: String(c.trocas.length) },
    { rotulo: "Pedidos de avaliação", valor: String(c.reviews.length) },
  ];
  return {
    titulo: `Mensagens para enviar (${c.total})`,
    linhas,
    links: [{ texto: "Abrir Mensagens", href: "/dashboard/mensagens" }],
    aviso: c.total === 0 ? "Nada pendente agora." : undefined,
  };
}

export async function trocasVencidas(): Promise<Resposta> {
  const c = await getMessageCenterService();
  const shown = c.trocas.slice(0, 15);
  const wait = c.permissions.length;
  return {
    titulo: `Trocas chegando ou vencidas (${c.trocas.length})`,
    linhas: shown.map((t) => ({ rotulo: t.customerName, valor: t.context })),
    links: [{ texto: "Abrir Mensagens", href: "/dashboard/mensagens" }],
    aviso:
      `Aparecem só clientes que aceitaram receber lembretes${wait > 0 ? `; ${wait} cliente(s) ainda aguardam a permissão` : ""}.` +
      (c.trocas.length > shown.length ? ` Mostrando 15 de ${c.trocas.length}.` : ""),
  };
}
