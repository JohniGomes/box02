/**
 * Nome do veículo para exibir em documentos: usa marca e modelo do cadastro;
 * se o cadastro estiver vazio, cai para o texto que a OS guardou na criação.
 * Devolve null quando não há nenhum dos dois (quem chama mostra a placa).
 */
export function vehicleDisplayName(
  vehicle: { brand?: string | null; model?: string | null } | null | undefined,
  snapshotDescription: string | null | undefined,
): string | null {
  const live = [vehicle?.brand, vehicle?.model]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (live) return live;
  const snap = (snapshotDescription ?? "").trim();
  return snap || null;
}
