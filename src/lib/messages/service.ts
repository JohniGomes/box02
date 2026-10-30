import { getSetting, setSetting } from "@/lib/db/repositories/appSettings";
import {
  createMessageLog,
  listAppointmentsForMessages,
  listDeliveredForMessages,
  listLoggedActions,
  listLoggedRefIds,
  listReceivablesForMessages,
  type MessageKind,
} from "@/lib/db/repositories/messageCenter";
import { formatBRL } from "@/lib/money";
import { onlyDigits } from "@/lib/validation/document";
import { whatsappLinkWithMessage } from "@/lib/validation/phone";
import { balanceMessage, confirmationMessage, permissionMessage, reminderMessage, reviewMessage, serviceDueMessage } from "./templates";
import { listLastServicesForMessages } from "@/lib/db/repositories/serviceIntervals";
import { computeNextDue } from "@/lib/vehicles/nextService";

const REVIEW_LINK_KEY = "google_review_link";
const DAY_MS = 86400000;

export async function getGoogleReviewLink(): Promise<string | null> {
  return (await getSetting(REVIEW_LINK_KEY)) || null;
}

export async function setGoogleReviewLink(raw: string): Promise<void> {
  const link = raw.trim();
  if (link && !/^https?:\/\//i.test(link)) {
    throw new Error("O link precisa começar com http:// ou https://");
  }
  await setSetting(REVIEW_LINK_KEY, link);
}

export interface MessageItem {
  kind: MessageKind;
  refId: string;
  customerName: string;
  /** Linha de contexto (quando/qual OS). */
  context: string;
  text: string;
  /** Link já pronto para abrir o WhatsApp do cliente. */
  whatsappUrl: string;
}

/** Pedido de permissão para lembretes (refId = id do cliente). */
export interface PermissionItem extends MessageItem {
  /** PEDIR: ainda não pediu. AGUARDANDO: pedido feito, falta a resposta do cliente. */
  state: "PEDIR" | "AGUARDANDO";
}

export interface MessageCenter {
  /** Quem ainda não foi perguntado se aceita lembretes: não recebe troca/avaliação até autorizar. */
  permissions: PermissionItem[];
  confirmations: MessageItem[];
  reminders: MessageItem[];
  reviews: MessageItem[];
  balances: MessageItem[];
  /** Lembrete de próxima troca (óleo, correia…), pelo intervalo definido em cada serviço. */
  trocas: MessageItem[];
  reviewLinkConfigured: boolean;
  total: number;
}

function phoneDigits(raw: string | null): string | null {
  const d = raw ? onlyDigits(raw) : "";
  return d.length === 10 || d.length === 11 ? d : null;
}

/** O que há para enviar hoje. Nada é enviado: só monta as mensagens prontas. */
export async function getMessageCenterService(now: Date = new Date()): Promise<MessageCenter> {
  // Os agendamentos são guardados como digitados (relógio de parede lido em UTC).
  const todayBr = now.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const todayStart = new Date(`${todayBr}T00:00:00.000Z`);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const dayAfterStart = new Date(todayStart.getTime() + 2 * DAY_MS);
  const horizon = new Date(todayStart.getTime() + 60 * DAY_MS);

  const [upcoming, delivered, receivables, reviewLink, lastServices] = await Promise.all([
    listAppointmentsForMessages(todayStart, horizon),
    listDeliveredForMessages(new Date(now.getTime() - 14 * DAY_MS)),
    listReceivablesForMessages(),
    getGoogleReviewLink(),
    listLastServicesForMessages(),
  ]);

  const [confirmedIds, remindedIds, reviewedIds, chargedIds] = await Promise.all([
    listLoggedRefIds("CONFIRMACAO", upcoming.map((a) => a.id)),
    listLoggedRefIds("LEMBRETE", upcoming.map((a) => a.id)),
    listLoggedRefIds("AVALIACAO", delivered.map((d) => d.id)),
    listLoggedRefIds("COBRANCA", receivables.map((r) => r.id)),
  ]);

  const whenLabel = (d: Date) => {
    const day = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const time = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
    return `${day} às ${time}`;
  };

  const confirmations: MessageItem[] = [];
  const reminders: MessageItem[] = [];
  for (const a of upcoming) {
    const phone = phoneDigits(a.customerPhone);
    if (!phone) continue;
    if (!confirmedIds.has(a.id)) {
      const text = confirmationMessage(a);
      confirmations.push({ kind: "CONFIRMACAO", refId: a.id, customerName: a.customerName, context: `Agendamento ${whenLabel(a.scheduledAt)}`, text, whatsappUrl: whatsappLinkWithMessage(phone, text) });
    }
    const isToday = a.scheduledAt < tomorrowStart;
    const isTomorrow = !isToday && a.scheduledAt < dayAfterStart;
    if ((isToday || isTomorrow) && !remindedIds.has(a.id)) {
      const text = reminderMessage(a, isToday ? "hoje" : "amanhã");
      reminders.push({ kind: "LEMBRETE", refId: a.id, customerName: a.customerName, context: `Agendamento ${whenLabel(a.scheduledAt)}`, text, whatsappUrl: whatsappLinkWithMessage(phone, text) });
    }
  }

  const reviews: MessageItem[] = [];
  if (reviewLink) {
    for (const d of delivered) {
      const phone = phoneDigits(d.customerPhone);
      if (!phone || reviewedIds.has(d.id) || d.remindersConsent !== "SIM") continue;
      const text = reviewMessage(d, reviewLink);
      reviews.push({ kind: "AVALIACAO", refId: d.id, customerName: d.customerName, context: `${d.number} entregue`, text, whatsappUrl: whatsappLinkWithMessage(phone, text) });
    }
  }

  const balances: MessageItem[] = [];
  for (const r of receivables) {
    const phone = phoneDigits(r.customerPhone);
    if (!phone || chargedIds.has(r.id)) continue;
    // Só lembra de saldo depois de 2 dias da entrega (dá tempo de o cliente pagar na hora).
    if (r.deliveredAt && now.getTime() - r.deliveredAt.getTime() < 2 * DAY_MS) continue;
    const text = balanceMessage(r, formatBRL(r.balanceCents));
    balances.push({ kind: "COBRANCA", refId: r.id, customerName: r.customerName, context: `${r.number} · saldo ${formatBRL(r.balanceCents)}`, text, whatsappUrl: whatsappLinkWithMessage(phone, text) });
  }

  // Próxima troca: serviço com intervalo, vencido ou chegando, uma mensagem por ciclo (uma por execução do serviço).
  const dueCandidates = lastServices
    .map((row) => {
      const due = computeNextDue(row, row.vehicleMileage, now);
      if (!due || due.status === "EM_DIA") return null;
      if (row.remindersConsent === "NAO") return null;
      const phone = phoneDigits(row.customerPhone);
      if (!phone) return null;
      const lastDay = row.lastAt.toISOString().slice(0, 10);
      return { row, due, phone, refId: `${row.vehicleId}:${row.serviceId}:${lastDay}` };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const dueLogged = await listLoggedRefIds("TROCA", dueCandidates.map((c) => c.refId));
  const trocas: MessageItem[] = dueCandidates
    .filter((c) => !dueLogged.has(c.refId) && c.row.remindersConsent === "SIM")
    .map(({ row, due, phone, refId }) => {
      const text = serviceDueMessage({
        customerName: row.customerName,
        vehicleDescription: row.vehicleLabel,
        serviceName: row.serviceName,
        lastDate: row.lastAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
        overdue: due.status === "VENCIDA",
      });
      return {
        kind: "TROCA" as const,
        refId,
        customerName: row.customerName,
        context: `${row.serviceName} · ${due.status === "VENCIDA" ? "vencida" : "chegando"} (${due.dueText})`,
        text,
        whatsappUrl: whatsappLinkWithMessage(phone, text),
      };
    });

  // Pedido de permissão: um por cliente ainda não perguntado que teria lembrete (troca) ou avaliação.
  const askCandidates = new Map<string, { customerName: string; phone: string; context: string }>();
  for (const d of delivered) {
    const phone = phoneDigits(d.customerPhone);
    if (!phone || d.remindersConsent !== null || askCandidates.has(d.customerId)) continue;
    askCandidates.set(d.customerId, { customerName: d.customerName, phone, context: `${d.number} entregue · pedir permissão para avisos` });
  }
  for (const c of dueCandidates) {
    if (c.row.remindersConsent !== null) continue;
    askCandidates.set(c.row.customerId, {
      customerName: c.row.customerName,
      phone: c.phone,
      context: `${c.row.serviceName} ${c.due.status === "VENCIDA" ? "vencida" : "chegando"} · pedir permissão para avisar`,
    });
  }
  const askActions = await listLoggedActions("PERMISSAO", [...askCandidates.keys()]);
  const permissions: PermissionItem[] = [];
  for (const [customerId, c] of askCandidates) {
    const action = askActions.get(customerId);
    if (action === "PULADA") continue;
    const text = permissionMessage({ customerName: c.customerName });
    permissions.push({
      kind: "PERMISSAO",
      refId: customerId,
      customerName: c.customerName,
      context: c.context,
      text,
      whatsappUrl: whatsappLinkWithMessage(c.phone, text),
      state: action === "ENVIADA" ? "AGUARDANDO" : "PEDIR",
    });
  }

  return {
    permissions,
    confirmations,
    reminders,
    reviews,
    balances,
    trocas,
    reviewLinkConfigured: Boolean(reviewLink),
    total:
      permissions.length + confirmations.length + reminders.length + reviews.length + balances.length + trocas.length,
  };
}

/** Marca a mensagem como enviada (ou pulada) para ela sair da fila. */
export async function markMessageService(
  actorUserId: string,
  input: { kind: MessageKind; refId: string; action: "ENVIADA" | "PULADA" },
): Promise<void> {
  await createMessageLog({ ...input, sentByUserId: actorUserId });
}
