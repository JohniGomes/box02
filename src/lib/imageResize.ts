/**
 * Reduz uma foto no navegador antes de enviar (celular tira fotos de vários MB; o envio ao servidor
 * aceita cerca de 1 MB). Devolve JPEG em base64, sem o prefixo "data:".
 */
export async function fileToResizedJpegBase64(
  file: File,
  maxSide = 1600,
  quality = 0.8,
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a foto.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" };
}
