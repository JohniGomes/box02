"use server";

import { auth } from "@/auth";
import { extractFromText, extractFromImage, type ExtractedData } from "@/lib/gemini/extract";
import { friendlyAiMessage } from "@/lib/gemini/errors";
import { searchCustomers, findCustomerByDocument, findCustomersByPhone } from "@/lib/db/repositories/customers";
import { findVehicleById, findVehicleByPlate, listVehiclesByCustomer } from "@/lib/db/repositories/vehicles";
import { listPartsWithStock } from "@/lib/db/repositories/parts";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { getPartSuggestedSalePriceService } from "@/lib/inventory/service";
import { buildAssistantDraft } from "@/lib/assistant/draft";
import { draftResumeHref, saveDraftService } from "@/lib/drafts/service";
import { formatPlate } from "@/lib/validation/plate";
import { listActiveServices } from "@/lib/db/repositories/services";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado.");
  return session.user.id;
}

export interface AssistenteResult {
  success: boolean;
  error?: string;
  data?: ExtractedData;
  reconciliado?: ReconciledData;
}

export interface ReconciledItem {
  tipo: "SERVICO" | "PECA" | "OUTRO";
  descricao: string;
  quantidade: number;
  precoUnitarioCentavos: number | null;
  // se encontrado no cadastro:
  registroId?: string;
  registroNome?: string;
  /** Preço do catálogo/estoque, usado se a pessoa não falou um valor. */
  precoSugeridoCentavos?: number | null;
  acao: "USAR_EXISTENTE" | "CRIAR_NOVO" | "IGNORAR";
}

export interface ReconciledData {
  extracted: ExtractedData;
  cliente: {
    id?: string;
    nome: string;
    telefone?: string;
    acao: "USAR_EXISTENTE" | "CRIAR_NOVO" | "SEM_CLIENTE";
  };
  veiculo: {
    id?: string;
    placa?: string;
    modelo?: string;
    acao: "USAR_EXISTENTE" | "CRIAR_NOVO" | "SEM_VEICULO";
  };
  itens: ReconciledItem[];
}

export async function analisarTextoAction(text: string): Promise<AssistenteResult> {
  try {
    await requireUserId();
    const data = await extractFromText(text);
    const reconciliado = await reconciliarDados(data);
    return { success: true, data, reconciliado };
  } catch (err) {
    return { success: false, error: friendlyAiMessage(err) };
  }
}

export async function analisarImagemAction(
  imageBase64: string,
  mimeType: string,
  textoAdicional?: string,
): Promise<AssistenteResult> {
  try {
    await requireUserId();
    const data = await extractFromImage(imageBase64, mimeType, textoAdicional);
    const reconciliado = await reconciliarDados(data);
    return { success: true, data, reconciliado };
  } catch (err) {
    return { success: false, error: friendlyAiMessage(err) };
  }
}

async function reconciliarDados(data: ExtractedData): Promise<ReconciledData> {
  // 1. Reconciliar cliente
  let clienteRec: ReconciledData["cliente"] = { nome: "", acao: "SEM_CLIENTE" };
  if (data.cliente?.nome) {
    let found = null;
    // 1º telefone (o mais confiável), 2º documento, 3º nome.
    const phoneDigits = (data.cliente.telefone ?? "").replace(/\D/g, "");
    if (phoneDigits.length === 10 || phoneDigits.length === 11) {
      found = (await findCustomersByPhone(phoneDigits)).find((c) => c.status === "ATIVO") ?? null;
    }
    if (!found && data.cliente.documento) {
      found = await findCustomerByDocument(data.cliente.documento.replace(/\D/g, ""));
    }
    if (!found) {
      const results = await searchCustomers({ query: data.cliente.nome, status: "ATIVO" });
      if (results.items.length > 0) found = results.items[0];
    }
    clienteRec = {
      id: found?.id,
      nome: found?.legalName ?? data.cliente.nome,
      telefone: data.cliente.telefone ?? undefined,
      acao: found ? "USAR_EXISTENTE" : "CRIAR_NOVO",
    };
  }

  // 2. Reconciliar veículo
  let veiculoRec: ReconciledData["veiculo"] = { acao: "SEM_VEICULO" };
  if (data.veiculo) {
    let found = null;
    if (data.veiculo.placa) {
      found = await findVehicleByPlate(data.veiculo.placa);
    }
    if (!found && clienteRec.id && data.veiculo.modelo) {
      const veiculos = await listVehiclesByCustomer(clienteRec.id);
      found = veiculos.find(
        (v) => v.model?.toLowerCase().includes(data.veiculo!.modelo!.toLowerCase()),
      ) ?? null;
    }
    veiculoRec = {
      id: found?.id,
      placa: found?.plate ?? data.veiculo.placa ?? undefined,
      modelo: found?.model ?? data.veiculo.modelo ?? undefined,
      acao: found ? "USAR_EXISTENTE" : "CRIAR_NOVO",
    };
  }

  // 3. Reconciliar itens
  const [pecasDisponiveis, servicosDisponiveis] = await Promise.all([
    listPartsWithStock(),
    listActiveServices(),
  ]);

  const itensRec: ReconciledItem[] = await Promise.all(
    data.itens.map(async (item) => {
      if (item.tipo === "PECA") {
        const found = pecasDisponiveis.find((p) =>
          p.name.toLowerCase().includes(item.descricao.toLowerCase()) ||
          item.descricao.toLowerCase().includes(p.name.toLowerCase()),
        );
        const suggested = found ? await getPartSuggestedSalePriceService(found.id) : null;
        return {
          ...item,
          tipo: "PECA" as const,
          registroId: found?.id,
          registroNome: found?.name,
          precoSugeridoCentavos: suggested?.cents ?? null,
          acao: found ? ("USAR_EXISTENTE" as const) : ("CRIAR_NOVO" as const),
        };
      } else if (item.tipo === "SERVICO") {
        const found = servicosDisponiveis.find((s) =>
          s.name.toLowerCase().includes(item.descricao.toLowerCase()) ||
          item.descricao.toLowerCase().includes(s.name.toLowerCase()),
        );
        return {
          ...item,
          tipo: "SERVICO" as const,
          registroId: found?.id,
          registroNome: found?.name,
          precoSugeridoCentavos: found?.defaultPriceCents ?? null,
          acao: found ? ("USAR_EXISTENTE" as const) : ("CRIAR_NOVO" as const),
        };
      }
      return { ...item, tipo: "OUTRO" as const, acao: "IGNORAR" as const };
    }),
  );

  return {
    extracted: data,
    cliente: clienteRec,
    veiculo: veiculoRec,
    itens: itensRec,
  };
}

export interface ConfirmarLancamentoInput {
  reconciliado: ReconciledData;
  tipo: "ORCAMENTO" | "OS";
}

export interface ConfirmarLancamentoResult {
  success: boolean;
  error?: string;
  clienteId?: string;
  veiculoId?: string;
  redirectUrl?: string;
}

export async function confirmarLancamentoAction(
  input: ConfirmarLancamentoInput,
): Promise<ConfirmarLancamentoResult> {
  try {
    const userId = await requireUserId();
    const { reconciliado } = input;

    // 1. Criar cliente se necessário
    let clienteId = reconciliado.cliente.id;
    if (reconciliado.cliente.acao === "CRIAR_NOVO") {
      const novo = await createCustomerService(
        userId,
        {
          type: "PF",
          legalName: reconciliado.cliente.nome,
          phone: reconciliado.cliente.telefone ?? undefined,
        },
        { preRegistration: true },
      );
      clienteId = novo.id;
    }
    if (!clienteId) {
      return { success: false, error: "Cliente não identificado. Por favor, selecione um cliente." };
    }

    // 2. Criar veículo se necessário
    let veiculoId = reconciliado.veiculo.id;
    if (reconciliado.veiculo.acao === "CRIAR_NOVO" && clienteId) {
      const { extracted } = reconciliado;
      const novo = await createVehicleService(userId, {
        customerId: clienteId,
        plate: extracted.veiculo?.placa ?? undefined,
        brand: extracted.veiculo?.marca ?? undefined,
        model: extracted.veiculo?.modelo ?? undefined,
        yearManufacture: extracted.veiculo?.ano ?? undefined,
        yearModel: extracted.veiculo?.ano ?? undefined,
        color: extracted.veiculo?.cor ?? undefined,
        mileage: extracted.veiculo?.quilometragem ?? undefined,
      });
      veiculoId = novo.id;
    }

    // 3. O assistente NÃO cria peças nem grava o orçamento/OS: monta um RASCUNHO com o que entendeu
    //    (peças e serviços novos entram como texto livre) e a pessoa revisa e confirma no formulário.
    const veiculoDados = veiculoId ? await findVehicleById(veiculoId) : null;
    const draft = buildAssistantDraft({
      tipo: input.tipo,
      cliente: { id: clienteId, nome: reconciliado.cliente.nome },
      veiculo: veiculoDados
        ? {
            id: veiculoDados.id,
            mileage: veiculoDados.mileage,
            label: [veiculoDados.plate ? formatPlate(veiculoDados.plate) : "Sem placa", [veiculoDados.brand, veiculoDados.model].filter(Boolean).join(" ")]
              .filter(Boolean)
              .join(" — "),
          }
        : null,
      itens: reconciliado.itens,
      observacoes: reconciliado.extracted.observacoes,
      quilometragem: reconciliado.extracted.veiculo?.quilometragem ?? null,
    });
    const saved = await saveDraftService(userId, { kind: draft.kind, title: draft.title, payload: draft.payload });
    const redirectUrl = draftResumeHref(saved);

    return { success: true, clienteId, veiculoId, redirectUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao confirmar lançamento." };
  }
}
