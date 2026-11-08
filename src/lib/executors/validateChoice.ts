import { parseExecutorValue } from "@/lib/executors/value";

type Lookup = (id: string) => Promise<{ status: string } | null>;

/**
 * Confere, antes de criar qualquer coisa, se o "quem executou" escolhido é válido.
 * Aceita um executor, ou vários marcados juntos (nesse caso cada um pode ser um
 * nome da lista de executores ou um usuário ativo, igual ao que a OS já faz ao
 * marcar um item como executado). `onInvalid` cria o erro de domínio.
 *
 * As consultas ao banco entram por parâmetro para a regra poder ser testada sem banco.
 */
export async function assertExecutorChoiceValid(
  value: string,
  lookups: { executor: Lookup; user: Lookup },
  onInvalid: () => Error,
): Promise<void> {
  const choice = parseExecutorValue(value);

  if (choice.executorIds) {
    for (const id of choice.executorIds) {
      const executor = await lookups.executor(id);
      if (executor && executor.status === "ATIVO") continue;
      const user = await lookups.user(id);
      if (user && user.status === "ATIVO") continue;
      throw onInvalid();
    }
    return;
  }

  if (choice.executorId) {
    const executor = await lookups.executor(choice.executorId);
    if (!executor || executor.status !== "ATIVO") throw onInvalid();
    return;
  }

  const user = await lookups.user(choice.executedByUserId ?? "");
  if (!user || user.status !== "ATIVO") throw onInvalid();
}
