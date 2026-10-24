import Link from "next/link";
import { headers } from "next/headers";
import { getCalendarFeedToken } from "@/lib/appointments/feed";
import { CalendarFeedPanel } from "./CalendarFeedPanel";

export default async function CalendarFeedPage() {
  const token = await getCalendarFeedToken();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = token ? `${proto}://${host}/api/agenda/${token}.ics` : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Agenda no celular (Google Agenda)</h1>
      <p className="text-sm text-muted">
        Cole o endereço abaixo no Google Agenda e os agendamentos aparecem no celular, com aviso do Google. Mostra o
        nome do cliente, o serviço e a hora. Agendamentos cancelados não aparecem.
      </p>
      <CalendarFeedPanel url={url} />
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
        <p className="font-semibold">Como adicionar (uma vez, em cada pessoa)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>No computador, abra calendar.google.com na conta da pessoa.</li>
          <li>
            À esquerda, em &quot;Outras agendas&quot;, toque no <strong>+</strong> e escolha{" "}
            <strong>Do URL</strong>.
          </li>
          <li>Cole o endereço e clique em Adicionar agenda.</li>
          <li>
            No celular Android, abra o app Google Agenda e confira que a agenda &quot;BOX 02 - Agenda&quot; está
            marcada. Em Configurações da agenda, ative as notificações.
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          O Google atualiza esse tipo de agenda de tempos em tempos (às vezes demora horas). Um agendamento criado em
          cima da hora pode não aparecer na hora. Quem tiver o endereço vê a agenda: não compartilhe. Se vazar, gere um
          novo.
        </p>
      </div>
    </div>
  );
}
