/** Busca endereço pelo CEP via ViaCEP (gratuito, sem autenticação).
 * Retorna null se o CEP for inválido, não existir, ou a API falhar —
 * o chamador trata como "não foi possível preencher automaticamente",
 * nunca bloqueia o preenchimento manual. */
export interface CepAddress {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export async function lookupCep(rawCep: string): Promise<CepAddress | null> {
  const digits = rawCep.replace(/\D/g, "");
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;

    return {
      street: data.logradouro ?? "",
      neighborhood: data.bairro ?? "",
      city: data.localidade ?? "",
      state: data.uf ?? "",
    };
  } catch {
    return null;
  }
}
