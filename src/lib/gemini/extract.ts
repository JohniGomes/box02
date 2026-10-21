import { geminiFlash } from "./client";

export interface ExtractedItem {
  tipo: "SERVICO" | "PECA" | "OUTRO";
  descricao: string;
  quantidade: number;
  precoUnitarioCentavos: number | null;
}

export interface ExtractedData {
  cliente: {
    nome: string;
    telefone?: string;
    documento?: string;
  } | null;
  veiculo: {
    marca?: string;
    modelo?: string;
    ano?: number;
    placa?: string;
    cor?: string;
    quilometragem?: number;
  } | null;
  itens: ExtractedItem[];
  observacoes: string;
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  textoOriginal: string;
}

const PROMPT_SISTEMA = `Você é um assistente de uma oficina mecânica chamada BOX 02. Sua tarefa é extrair informações estruturadas de textos ou fotos de anotações, cadernos, ordens de serviço manuscritas ou notas fiscais.

Retorne APENAS um JSON válido, sem markdown, sem explicações, com a estrutura exata abaixo:

{
  "cliente": {
    "nome": "string ou null",
    "telefone": "string ou null",
    "documento": "string ou null (CPF ou CNPJ)"
  },
  "veiculo": {
    "marca": "string ou null",
    "modelo": "string ou null",
    "ano": "número ou null",
    "placa": "string ou null (formato ABC-1234 ou ABC1D23)",
    "cor": "string ou null",
    "quilometragem": "número ou null"
  },
  "itens": [
    {
      "tipo": "SERVICO ou PECA",
      "descricao": "descrição do item",
      "quantidade": "número (padrão 1)",
      "precoUnitarioCentavos": "número em centavos ou null se não informado"
    }
  ],
  "observacoes": "qualquer outra informação relevante",
  "confianca": "ALTA, MEDIA ou BAIXA dependendo da legibilidade/clareza"
}

Regras importantes:
- Se um campo não estiver presente ou não for legível, use null
- Peças (ex: filtro de óleo, pastilha de freio, pneu) → tipo PECA
- Serviços (ex: troca de óleo, alinhamento, revisão) → tipo SERVICO
- Preços: converta para centavos (ex: R$ 50,00 → 5000)
- Placa: normalize para formato com hífen (ex: ABC1234 → ABC-1234)
- Telefone: mantenha apenas dígitos com DDD
- confianca: ALTA = tudo claro, MEDIA = algumas dúvidas, BAIXA = muito difícil de ler`;

export async function extractFromText(text: string): Promise<ExtractedData> {
  const prompt = `${PROMPT_SISTEMA}\n\nTexto para analisar:\n${text}`;
  const result = await geminiFlash.generateContent(prompt);
  const responseText = result.response.text().trim();
  const json = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(json);
  return { ...parsed, textoOriginal: text };
}

export async function extractFromImage(
  imageBase64: string,
  mimeType: string,
  extraText?: string,
): Promise<ExtractedData> {
  const contentParts = [
    { text: PROMPT_SISTEMA + (extraText ? `\n\nInformação adicional: ${extraText}` : "") },
    {
      inlineData: {
        data: imageBase64,
        mimeType,
      },
    },
  ];

  const result = await geminiFlash.generateContent({ contents: [{ role: "user", parts: contentParts }] });
  const responseText = result.response.text().trim();
  const json = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(json);
  return { ...parsed, textoOriginal: extraText ?? "[imagem]" };
}
