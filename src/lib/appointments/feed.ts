import { randomBytes } from "node:crypto";
import { getSetting, setSetting } from "@/lib/db/repositories/appSettings";
import { listAppointmentsWithNamesBetween } from "@/lib/db/repositories/appointments";
import { buildAppointmentsIcs } from "./ics";

const FEED_TOKEN_KEY = "calendar_feed_token";

/** Código secreto do endereço da agenda; null enquanto nunca foi gerado. */
export async function getCalendarFeedToken(): Promise<string | null> {
  return (await getSetting(FEED_TOKEN_KEY)) || null;
}

/** Gera (ou troca) o código. Quem tinha o endereço antigo deixa de enxergar a agenda. */
export async function regenerateCalendarFeedToken(): Promise<string> {
  const token = randomBytes(24).toString("hex");
  await setSetting(FEED_TOKEN_KEY, token);
  return token;
}

/** Texto do calendário se o código bater; null se não bater (ou se nunca foi gerado). */
export async function buildCalendarFeedIfAuthorized(token: string): Promise<string | null> {
  const current = await getCalendarFeedToken();
  if (!current || token.length !== current.length || token !== current) return null;
  const now = new Date();
  const from = new Date(now.getTime() - 14 * 86400000);
  const to = new Date(now.getTime() + 180 * 86400000);
  const rows = await listAppointmentsWithNamesBetween(from, to);
  return buildAppointmentsIcs(rows, now);
}
