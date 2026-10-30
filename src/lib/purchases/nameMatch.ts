/** Ligação por nome entre o que veio na nota e o que já está cadastrado (sugestão; a pessoa confere). */

const STOP = new Set(["de", "do", "da", "dos", "das", "para", "com", "e", "o", "a", "un", "und", "pc", "pca", "kit"]);

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokensOf(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter((t) => t && !STOP.has(t)));
}

/** Parecido de 0 a 1: palavras em comum dividido pelas palavras de um e de outro (sem artigos). */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/** Peça do estoque com nome muito parecido (0,75 ou mais); senão null e a linha vira peça nova. */
export function bestPartMatch<T extends { id: string; name: string }>(description: string, parts: T[]): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const p of parts) {
    const score = nameSimilarity(description, p.name);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return bestScore >= 0.75 ? best : null;
}

/** Fornecedor cadastrado com o mesmo nome (ou um contido no outro, com pelo menos 4 letras). */
export function matchSupplier<T extends { id: string; name: string }>(name: string, suppliers: T[]): T | null {
  const n = normalizeName(name);
  if (n.length < 4) return null;
  return (
    suppliers.find((s) => normalizeName(s.name) === n) ??
    suppliers.find((s) => {
      const sn = normalizeName(s.name);
      return sn.length >= 4 && (sn.includes(n) || n.includes(sn));
    }) ??
    null
  );
}
