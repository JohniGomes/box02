import { auth } from "@/auth";
import { findWorkOrderEvidenceById } from "@/lib/db/repositories/workOrderEvidences";
import { createSupabaseStorageClient } from "@/lib/storage/supabase";

/**
 * Ciclo J — DEC-J6: acesso só interno. Nunca existe URL pública do R2 —
 * esta rota é o único jeito de chegar no arquivo, e exige sessão
 * autenticada antes de buscar do bucket. A evidência é sempre buscada
 * já filtrada por workOrderId (não só pelo id da evidência), para uma
 * evidência de outra OS nunca ser acessível trocando o id na URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; evidenceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Não autenticado.", { status: 401 });
  }

  const { id: workOrderId, evidenceId } = await params;
  const evidence = await findWorkOrderEvidenceById(evidenceId, workOrderId);
  if (!evidence) {
    return new Response("Evidência não encontrada.", { status: 404 });
  }

  const storageClient = createSupabaseStorageClient();
  const object = await storageClient.getObject(evidence.storageKey);
  if (!object) {
    return new Response("Arquivo não encontrado no armazenamento.", { status: 404 });
  }

  return new Response(new Uint8Array(object.body), {
    headers: { "Content-Type": object.contentType },
  });
}
