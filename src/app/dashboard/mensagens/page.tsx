import { getGoogleReviewLink, getMessageCenterService, type MessageItem } from "@/lib/messages/service";
import { MessageRow } from "./MessageRow";
import { ReviewLinkForm } from "./ReviewLinkForm";

function Section({ title, hint, items }: { title: string; hint: string; items: MessageItem[] }) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-sm font-semibold">
          {title} <span className="text-muted">({items.length})</span>
        </h2>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">Nada para enviar aqui.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((m) => (
            <MessageRow key={`${m.kind}-${m.refId}`} {...m} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MessagesPage() {
  const [center, reviewLink] = await Promise.all([getMessageCenterService(), getGoogleReviewLink()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Mensagens para enviar</h1>
        <p className="text-sm text-muted">
          Mensagens prontas para os clientes. O sistema nunca envia sozinho: você toca em &quot;Enviar no WhatsApp&quot;,
          confere e envia; depois toca em &quot;Já enviei&quot; para a mensagem sair da fila.
        </p>
      </div>

      <Section title="Lembretes (hoje e amanhã)" hint="Agendamentos de hoje e de amanhã que ainda não foram lembrados." items={center.reminders} />
      <Section title="Confirmação de agendamento" hint="Agendamentos dos próximos dias que ainda não foram confirmados com o cliente." items={center.confirmations} />
      <Section title="Saldo a receber" hint="OS entregues há 2 dias ou mais com saldo em aberto." items={center.balances} />
      <Section
        title="Lembrete de próxima troca"
        hint="Veículos cujo serviço (óleo, correia, filtros…) está chegando na hora ou já passou, pelo intervalo definido em Configurações → Serviços."
        items={center.trocas}
      />
      <Section
        title="Pedido de avaliação no Google"
        hint="OS entregues nos últimos 14 dias. Vai para todos os clientes, sem filtrar e sem oferecer vantagem."
        items={center.reviews}
      />
      {!center.reviewLinkConfigured ? (
        <p className="rounded-xl bg-accent/10 p-3 text-sm">Cadastre o link de avaliação abaixo para o pedido de avaliação aparecer.</p>
      ) : null}

      <ReviewLinkForm initial={reviewLink ?? ""} />
    </div>
  );
}
