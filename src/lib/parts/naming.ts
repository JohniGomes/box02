/**
 * Nome da peça para o CLIENTE (orçamento, recibo): o "Nome para o cliente" quando existe,
 * senão o nome técnico da peça. O nome técnico (código, aplicação) fica só para a equipe.
 */
export function customerFacingPartName(part: { name: string; customerName?: string | null }): string {
  const custom = part.customerName?.trim();
  return custom ? custom : part.name;
}
