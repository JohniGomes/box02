/**
 * Uma sessão (cookie de login) guarda só o id do usuário. Se esse usuário não
 * existe mais no banco (banco recriado, usuário removido) ou foi inativado, a
 * sessão não pode seguir valendo: as gravações falhariam por chave estrangeira
 * (auditoria, "criada por" da OS) e deixariam dados salvos pela metade.
 *
 * `lookup` é injetado para a regra poder ser testada sem banco.
 *
 * Se a consulta ao banco falhar (queda momentânea), a sessão é mantida: derrubar
 * todo mundo por uma falha de rede seria pior do que deixar a próxima gravação
 * falhar sozinha.
 */
export async function isSessionUserValid(
  userId: string | undefined | null,
  lookup: (id: string) => Promise<{ status: string } | null>,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await lookup(userId);
    return user !== null && user.status === "ATIVO";
  } catch {
    return true;
  }
}
