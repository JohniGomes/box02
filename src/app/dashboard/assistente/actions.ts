"use server";

import { auth } from "@/auth";
import { extractFromText, extractFromImage, type ExtractedData } from "@/lib/gemini/extract";
import { searchCustomers, findCustomerByDocument } from "@/lib/db/repositories/customers";
import { findVehicleByPlate, listVehiclesByCustomer } from "@/lib/db/repositories/vehicles";
import { listPartsWithStock } from "@/lib/db/repositories/parts";
import { createCustomerService } from "@/lib/customers/service";
import { createVehicleService } from "@/lib/vehicles/service";
import { createPartService } from "@/lib/inventory/service";
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
    return { success: false, error: err instanceof Error ? err.message : "Erro ao analisar texto." };
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
    return { success: false, error: err instanceof Error ? err.message : "Erro ao analisar imagem." };
  }
}

async function reconciliarDados(data: ExtractedData): Promise<ReconciledData> {
  // 1. Reconciliar cliente
  let clienteRec: ReconciledData["cliente"] = { nome: "", acao: "SEM_CLIENTE" };
  if (data.cliente?.nome) {
    let found = null;
    if (data.cliente.documento) {
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
        return {
          ...item,
          tipo: "PECA" as const,
          registroId: found?.id,
          registroNome: found?.name,
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
      const novo = await createCustomerService(userId, {
        type: "PF",
        legalName: reconciliado.cliente.nome,
        phone: reconciliado.cliente.telefone ?? undefined,
      });
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

    // 3. Criar peças novas se necessário
    for (const item of reconciliado.itens) {
      if (item.tipo === "PECA" && item.acao === "CRIAR_NOVO") {
        const novaPeca = await createPartService({
          name: item.descricao,
          costCents: item.precoUnitarioCentavos ?? undefined,
        });
        item.registroId = novaPeca.id;
        item.registroNome = novaPeca.name;
        item.acao = "USAR_EXISTENTE";
      }
    }

    // 4. Redirecionar para criação de orçamento/OS com dados pré-preenchidos
    const params = new URLSearchParams();
    if (clienteId) params.set("clienteId", clienteId);
    if (veiculoId) params.set("veiculoId", veiculoId);

    const redirectUrl =
      input.tipo === "ORCAMENTO"
        ? `/dashboard/orcamentos/novo?${params.toString()}`
        : `/dashboard/os/nova?${params.toString()}`;

    return { success: true, clienteId, veiculoId, redirectUrl };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro ao confirmar lançamento." };
  }
}
