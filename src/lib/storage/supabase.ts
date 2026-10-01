import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Abstração de storage, para permitir testar a lógica de negócio
 * (criar/listar/excluir evidência) sem depender de credencial real —
 * os testes passam uma implementação fake; a aplicação real usa
 * `createSupabaseStorageClient()`.
 */
export interface StorageClient {
  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  deleteObject(key: string): Promise<void>;
}

/**
 * Cliente real, usando a API S3-compatível do Supabase Storage.
 * Variáveis de ambiente necessárias: SUPABASE_PROJECT_REF,
 * SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY,
 * SUPABASE_STORAGE_BUCKET. SUPABASE_S3_REGION é opcional (default "us-east-1").
 */
export function createSupabaseStorageClient(): StorageClient {
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const region = process.env.SUPABASE_S3_REGION || "us-east-1";

  if (!projectRef || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Configuração do Supabase Storage incompleta — defina SUPABASE_PROJECT_REF, SUPABASE_S3_ACCESS_KEY_ID, SUPABASE_S3_SECRET_ACCESS_KEY e SUPABASE_STORAGE_BUCKET.",
    );
  }

  const client = new S3Client({
    region,
    endpoint: `https://${projectRef}.supabase.co/storage/v1/s3`,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getObject(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!result.Body) return null;
      const chunks: Uint8Array[] = [];
      // @ts-expect-error -- Body é um stream no runtime Node do SDK v3
      for await (const chunk of result.Body) chunks.push(chunk);
      return { body: Buffer.concat(chunks), contentType: result.ContentType ?? "application/octet-stream" };
    },
    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

/** Monta a storageKey — namespaced por OS, sem depender do nome de
 * arquivo original do usuário (evita colisão e vazamento de nome). */
export function buildEvidenceStorageKey(workOrderId: string, evidenceId: string, mimeType: string): string {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/heic" ? "heic" : "jpg";
  return `work-orders/${workOrderId}/${evidenceId}.${ext}`;
}
