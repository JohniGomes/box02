"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustAdditionalItemAction,
  authorizeAdditionalItemDirectlyAction,
  createAdditionalItemAction,
  generateAdditionalItemLinkAction,
  setWorkOrderItemStatusAction,
} from "../actions";
import { formatBRL } from "@/lib/money";
import { ServicePickerButton } from "@/components/ServicePickerButton";
import { WorkOrderItemExecutorInfo, type ActiveUserOption } from "./WorkOrderActions";

type ItemType = "SERVICO" | "PECA" | "MAO_DE_OBRA";
const ITEM_TYPE_LABEL: Record<ItemType, string> = { SERVICO: "Serviço", PECA: "Peça", MAO_DE_OBRA: "Mão de obra" };

export interface AdditionalItemView {
  id: string;
  type: ItemType;
  description: string;
  totalCents: number;
  status: "PLANEJADO" | "EXECUTADO" | "CANCELADO";
  clientDecision: "PENDENTE" | "APROVADO" | "RECUSADO";
  clientAuthorizedBy: string | null;
  authorizationChannel: string | null;
  cancelReason: string | null;
  customerPhone: string | null;
  /** Ciclo L */
  executedByUserId: string | null;
}

const DECISION_LABEL: Record<string, string> = { PENDENTE: "Aguardando decisão", APROVADO: "Aprovado", RECUSADO: "Recusado" };
const DECISION_CLASS: Record<string, string> = {
  PENDENTE: "bg-muted/20 text-muted",
  APROVADO: "bg-success/15 text-success",
  RECUSADO: "bg-danger/15 text-danger",
};

export function AdditionalItemsSection({
  workOrderId,
  items,
  canManage,
  users,
  currentUserId,
}: {
  workOrderId: string;
  items: AdditionalItemView[];
  canManage: boolean;
  /** Ciclo L */
  users: ActiveUserOption[];
  currentUserId: string;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Adicionais</h2>
        {canManage ? (
          <button onClick={() => setCreating((v) => !v)} className="text-xs font-medium text-accent">
            {creating ? "Cancelar" : "+ Registrar adicional"}
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="mb-4">
          <NewAdditionalItemForm workOrderId={workOrderId} onDone={() => setCreating(false)} />
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nenhum adicional registrado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <AdditionalItemCard
              key={item.id}
              workOrderId={workOrderId}
              item={item}
              canManage={canManage}
              users={users}
              currentUserId={currentUserId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewAdditionalItemForm({ workOrderId, onDone }: { workOrderId: string; onDone: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<ItemType>("SERVICO");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceReais, setUnitPriceReais] = useState("");
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "h-12 rounded-xl border border-border bg-background px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createAdditionalItemAction(workOrderId, {
        type,
        description,
        quantity,
        unitPriceReais,
        serviceId,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao registrar.");
        return;
      }
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
      <ServicePickerButton
        onSelect={(service) => {
          setServiceId(service.id);
          setDescription(service.label);
          setUnitPriceReais(service.suggestedPriceReais ?? "");
        }}
      />
      <div className="flex gap-2">
        {(Object.keys(ITEM_TYPE_LABEL) as ItemType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-full border px-2 py-1 text-xs font-medium ${type === t ? "border-accent bg-accent/15" : "border-border text-muted"}`}
          >
            {ITEM_TYPE_LABEL[t]}
          </button>
        ))}
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descrição do serviço/peça encontrado" className={inputClass} />
      <div className="grid grid-cols-2 gap-2">
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qtd" className={inputClass} />
        <input inputMode="decimal" value={unitPriceReais} onChange={(e) => setUnitPriceReais(e.target.value)} placeholder="Valor (R$)" className={inputClass} />
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <button
        onClick={handleSubmit}
        disabled={isPending || !description.trim() || !unitPriceReais}
        className="h-11 rounded-xl bg-accent text-sm font-semibold text-accent-foreground disabled:opacity-50"
      >
        {isPending ? "Registrando…" : "Registrar adicional"}
      </button>
    </div>
  );
}

function AdditionalItemCard({
  workOrderId,
  item,
  canManage,
  users,
  currentUserId,
}: {
  workOrderId: string;
  item: AdditionalItemView;
  canManage: boolean;
  users: ActiveUserOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "direct" | "link" | "adjust">(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  function handleGenerateLink() {
    setError(null);
    startTransition(async () => {
      const result = await generateAdditionalItemLinkAction(workOrderId, item.id);
      if (!result.success || !result.token) {
        setError(result.error ?? "Falha ao gerar link.");
        return;
      }
      const url = `${window.location.origin}/os-item/${result.token}`;
      setLinkUrl(url);
      router.refresh();
    });
  }

  function whatsappHref() {
    if (!linkUrl || !item.customerPhone) return null;
    const digits = item.customerPhone.replace(/\D/g, "");
    const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
    const text = encodeURIComponent(
      `Olá! Durante o atendimento do seu veículo identificamos um serviço adicional: "${item.description}" (${formatBRL(item.totalCents)}). Você pode ver os detalhes e aprovar ou recusar por este link: ${linkUrl}`,
    );
    return `https://wa.me/${withCountry}?text=${text}`;
  }

  return (
    <li className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{ITEM_TYPE_LABEL[item.type]}</span>
        <span className="text-sm font-semibold">{formatBRL(item.totalCents)}</span>
      </div>
      <p className="text-sm">{item.description}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${DECISION_CLASS[item.clientDecision]}`}>
          {DECISION_LABEL[item.clientDecision]}
        </span>
        {item.status !== "PLANEJADO" ? (
          <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[11px] font-semibold text-muted">
            {item.status === "EXECUTADO" ? "Executado" : "Cancelado"}
          </span>
        ) : null}
      </div>
      {item.clientAuthorizedBy ? (
        <p className="mt-1 text-xs text-muted">
          {item.clientDecision === "RECUSADO" ? "Recusado" : "Autorizado"} por {item.clientAuthorizedBy}
          {item.authorizationChannel ? ` (${item.authorizationChannel})` : ""}
        </p>
      ) : null}
      {item.cancelReason ? <p className="mt-1 text-xs text-danger">Motivo: {item.cancelReason}</p> : null}

      {item.status === "EXECUTADO" ? (
        <WorkOrderItemExecutorInfo
          workOrderId={workOrderId}
          itemId={item.id}
          executedByUserId={item.executedByUserId}
          users={users}
          canManage={canManage}
        />
      ) : null}

      {canManage && item.clientDecision === "PENDENTE" && item.status === "PLANEJADO" ? (
        <div className="mt-2 flex flex-col gap-2">
          {mode === null ? (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setMode("direct")} className="h-9 rounded-lg border border-border px-3 text-xs font-medium">
                Autorizar presencial/telefone
              </button>
              <button onClick={() => setMode("link")} className="h-9 rounded-lg border border-border px-3 text-xs font-medium">
                Gerar link
              </button>
              <button onClick={() => setMode("adjust")} className="h-9 rounded-lg border border-border px-3 text-xs font-medium">
                Ajustar valor/escopo
              </button>
            </div>
          ) : null}

          {mode === "direct" ? (
            <DirectAuthorizationForm
              workOrderId={workOrderId}
              itemId={item.id}
              onCancel={() => setMode(null)}
              onDone={() => {
                setMode(null);
                router.refresh();
              }}
            />
          ) : null}

          {mode === "link" ? (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
              {!linkUrl ? (
                <button
                  onClick={handleGenerateLink}
                  disabled={isPending}
                  className="h-10 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
                >
                  {isPending ? "Gerando…" : "Gerar link (válido por 48h)"}
                </button>
              ) : (
                <>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted break-all">
                    {linkUrl}
                  </div>
                  {whatsappHref() ? (
                    <a
                      href={whatsappHref()!}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 items-center justify-center rounded-lg bg-success text-xs font-semibold text-white"
                    >
                      Enviar pelo WhatsApp
                    </a>
                  ) : (
                    <p className="text-xs text-muted">Cliente sem WhatsApp cadastrado — copie o link manualmente.</p>
                  )}
                </>
              )}
              {error ? <p className="text-xs text-danger">{error}</p> : null}
              <button onClick={() => { setMode(null); setLinkUrl(null); }} className="h-8 text-xs text-muted">
                Fechar
              </button>
            </div>
          ) : null}

          {mode === "adjust" ? (
            <AdjustItemForm
              workOrderId={workOrderId}
              itemId={item.id}
              onCancel={() => setMode(null)}
              onDone={() => {
                setMode(null);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      ) : null}

      {canManage && item.clientDecision === "APROVADO" && item.status === "PLANEJADO" ? (
        <ExecuteOrCancelButtons
          workOrderId={workOrderId}
          itemId={item.id}
          users={users}
          currentUserId={currentUserId}
        />
      ) : null}
    </li>
  );
}

function DirectAuthorizationForm({
  workOrderId,
  itemId,
  onCancel,
  onDone,
}: {
  workOrderId: string;
  itemId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [decision, setDecision] = useState<"APROVADO" | "RECUSADO">("APROVADO");
  const [channel, setChannel] = useState<"PRESENCIAL" | "TELEFONE">("PRESENCIAL");
  const [authorizedBy, setAuthorizedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await authorizeAdditionalItemDirectlyAction(workOrderId, itemId, {
        decision,
        channel,
        authorizedBy,
        notes: notes || undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao registrar.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <div className="flex gap-2">
        <button onClick={() => setDecision("APROVADO")} className={`h-9 flex-1 rounded-lg border text-xs font-semibold ${decision === "APROVADO" ? "border-success bg-success/15 text-success" : "border-border text-muted"}`}>
          Aprovado
        </button>
        <button onClick={() => setDecision("RECUSADO")} className={`h-9 flex-1 rounded-lg border text-xs font-semibold ${decision === "RECUSADO" ? "border-danger bg-danger/15 text-danger" : "border-border text-muted"}`}>
          Recusado
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setChannel("PRESENCIAL")} className={`h-9 flex-1 rounded-lg border text-xs ${channel === "PRESENCIAL" ? "border-accent bg-accent/15" : "border-border text-muted"}`}>
          Presencial
        </button>
        <button onClick={() => setChannel("TELEFONE")} className={`h-9 flex-1 rounded-lg border text-xs ${channel === "TELEFONE" ? "border-accent bg-accent/15" : "border-border text-muted"}`}>
          Telefone
        </button>
      </div>
      <input
        value={authorizedBy}
        onChange={(e) => setAuthorizedBy(e.target.value)}
        placeholder="Nome de quem autorizou/recusou"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
      />
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação (opcional)"
        className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
      />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending || authorizedBy.trim().length < 2}
          className="h-9 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          Confirmar
        </button>
        <button onClick={onCancel} className="h-9 flex-1 rounded-lg border border-border text-xs">
          Voltar
        </button>
      </div>
    </div>
  );
}

function AdjustItemForm({
  workOrderId,
  itemId,
  onCancel,
  onDone,
}: {
  workOrderId: string;
  itemId: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPriceReais, setUnitPriceReais] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await adjustAdditionalItemAction(workOrderId, itemId, {
        description,
        quantity,
        unitPriceReais,
        adjustReason,
      });
      if (!result.success) {
        setError(result.error ?? "Falha ao ajustar.");
        return;
      }
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">
        Isto cancela o item atual e cria um novo com os dados corrigidos — o item anterior fica preservado no
        histórico.
      </p>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nova descrição" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Qtd" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
        <input inputMode="decimal" value={unitPriceReais} onChange={(e) => setUnitPriceReais(e.target.value)} placeholder="Novo valor (R$)" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
      </div>
      <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Motivo do ajuste" className="h-10 rounded-lg border border-border bg-background px-3 text-sm" />
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={isPending || !description.trim() || !unitPriceReais || adjustReason.trim().length < 3}
          className="h-9 flex-1 rounded-lg bg-accent text-xs font-semibold text-accent-foreground disabled:opacity-50"
        >
          Confirmar ajuste
        </button>
        <button onClick={onCancel} className="h-9 flex-1 rounded-lg border border-border text-xs">
          Voltar
        </button>
      </div>
    </div>
  );
}

function ExecuteOrCancelButtons({
  workOrderId,
  itemId,
  users,
  currentUserId,
}: {
  workOrderId: string;
  itemId: string;
  users: ActiveUserOption[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [executorId, setExecutorId] = useState(currentUserId);
  const [error, setError] = useState<string | null>(null);

  function markExecuted() {
    setError(null);
    startTransition(async () => {
      const result = await setWorkOrderItemStatusAction(workOrderId, itemId, "EXECUTADO", {
        executedByUserId: executorId,
      });
      if (!result.success) {
        setError(result.error ?? "Falha.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">Executado por</span>
        <select
          value={executorId}
          onChange={(e) => setExecutorId(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-2 text-xs"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={markExecuted}
        disabled={isPending}
        className="h-9 rounded-lg bg-success/15 text-xs font-semibold text-success disabled:opacity-60"
      >
        Marcar como executado
      </button>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
