import { centsToReais } from "@/lib/money";

/**
 * O assistente nunca grava o orçamento/OS sozinho: ele monta um RASCUNHO com o que entendeu e a
 * pessoa revisa e confirma no próprio formulário (o mesmo "Salvar e continuar depois" das telas).
 */

export interface AssistantItemInput {
  tipo: "SERVICO" | "PECA" | "OUTRO";
  descricao: string;
  quantidade: number;
  precoUnitarioCentavos: number | null;
  /** Preço do catálogo/estoque, usado só se a pessoa não falou um valor. */
  precoSugeridoCentavos?: number | null;
  registroId?: string;
  registroNome?: string;
  acao: "USAR_EXISTENTE" | "CRIAR_NOVO" | "IGNORAR";
}

export interface AssistantDraftInput {
  tipo: "ORCAMENTO" | "OS";
  cliente: { id: string; nome: string };
  veiculo: { id: string; label: string; mileage?: number | null } | null;
  itens: AssistantItemInput[];
  observacoes?: string;
  quilometragem?: number | null;
}

export interface AssistantDraft {
  kind: "QUOTE" | "WORK_ORDER";
  title: string;
  payload: Record<string, unknown>;
}

function draftItems(itens: AssistantItemInput[]) {
  return itens
    .filter((i) => i.acao !== "IGNORAR" && i.tipo !== "OUTRO" && i.descricao.trim() !== "")
    .map((i) => {
      const cents = i.precoUnitarioCentavos ?? i.precoSugeridoCentavos ?? null;
      const matched = i.acao === "USAR_EXISTENTE" && i.registroId;
      return {
        key: crypto.randomUUID(),
        type: i.tipo,
        // Peça ou serviço do cadastro usa o nome do cadastro; o resto vai como foi falado (texto livre).
        description: matched && i.registroNome ? i.registroNome : i.descricao,
        quantity: String(i.quantidade > 0 ? i.quantidade : 1),
        unitPriceReais: cents != null ? centsToReais(cents) : "",
        serviceId: matched && i.tipo === "SERVICO" ? i.registroId : undefined,
        partId: matched && i.tipo === "PECA" ? i.registroId : undefined,
        category: "NECESSARIO",
      };
    });
}

/** Monta o rascunho do orçamento ou da OS com o que o assistente entendeu. Função pura. */
export function buildAssistantDraft(input: AssistantDraftInput): AssistantDraft {
  const items = draftItems(input.itens);
  const customer = { id: input.cliente.id, label: input.cliente.nome };
  const complaint = input.observacoes?.trim() ?? "";
  const km = input.quilometragem != null ? String(input.quilometragem) : "";

  if (input.tipo === "OS") {
    return {
      kind: "WORK_ORDER",
      title: `OS sem orçamento — ${input.cliente.nome} (assistente)`,
      payload: {
        customer,
        vehicleId: input.veiculo?.id ?? "",
        mileageAtEntry: km,
        customerComplaint: complaint,
        diagnosis: "",
        items,
      },
    };
  }

  return {
    kind: "QUOTE",
    title: `Orçamento — ${input.cliente.nome} (assistente)`,
    payload: {
      // Já abre nos itens; se não achou veículo, abre na etapa do veículo.
      step: input.veiculo ? 2 : 1,
      customer,
      vehicle: input.veiculo ? { id: input.veiculo.id, label: input.veiculo.label, mileage: input.veiculo.mileage ?? null } : null,
      items: items.length > 0 ? items : [],
      discountType: "",
      discountValue: "",
      discountReason: "",
      surchargeType: "",
      surchargeValue: "",
      validUntil: "",
      internalNotes: "",
      customerMessage: "",
      customerComplaint: complaint,
      mileageAtEntry: km,
    },
  };
}
