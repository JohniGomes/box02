import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

/**
 * Ping diário no Postgres só para manter o projeto Supabase ativo — o
 * plano gratuito pausa automaticamente após 7 dias sem nenhuma consulta.
 * Disparado pelo Vercel Cron (ver "crons" em vercel.json). A Vercel
 * injeta o header Authorization: Bearer $CRON_SECRET automaticamente
 * quando a env var CRON_SECRET existe no projeto — isso também
 * impede chamadas públicas não autorizadas a esta rota.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  await pool.query("SELECT 1");
  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
