import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Ciclo J — abstração de storage, para permitir testar a lógica de
 * negócio (criar/listar/excluir evidência) sem depender de credencial
 * real do R2 — a conectividade com o R2 nunca foi verificada (DEC-J2b),
 * nem neste ambiente de desenvolvimento nem em produção. A interface é
 * o ponto de injeção: os testes passam uma implementação fake; a
 * aplicação real usa `createR2StorageClient()`.
 */
export interface StorageClient {
  putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObject(key: string): Promise<{ body: Buffer; contentType: string } | null>;
  deleteObject(key: string): Promise<void>;
}

/**
 * Cliente real, compatível com S3, apontado para o Cloudflare R2 via
 * endpoint customizado. NUNCA testado contra credencial/bucket reais
 * (DEC-J2b) — construído conforme a documentação pública do R2, mas
 * sem validação empírica de conectividade. Variáveis de ambiente
 * necessárias: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 * R2_BUCKET_NAME.
 */
export function createR2StorageClient(): StorageClient {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Configuração do R2 incompleta — defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET_NAME.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
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
