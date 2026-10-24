import { buildCalendarFeedIfAuthorized } from "@/lib/appointments/feed";

export const dynamic = "force-dynamic";

/** Agenda para assinar no Google Agenda. O código na URL é o segredo. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = await buildCalendarFeedIfAuthorized(token.replace(/\.ics$/i, ""));
  if (!ics) return new Response("Não encontrado.", { status: 404 });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
