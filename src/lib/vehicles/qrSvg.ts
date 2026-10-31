import { headers } from "next/headers";
import QRCode from "qrcode";

/** Endereço do site (ex.: https://box02.vercel.app), para montar o link que vai dentro do QR. */
export async function publicOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function vehiclePublicUrl(origin: string, token: string): string {
  return `${origin}/v/${token}`;
}

/** QR em SVG (nítido em qualquer tamanho, bom para imprimir). */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
}
