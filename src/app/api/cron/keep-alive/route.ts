import { NextResponse } from "next/server";
import { pool } from "@/lib/db/pool";

/**
 * Ping para manter o projeto Supabase ativo — o plano gratuito pausa
 * automaticamente após 7 dias sem atividade. Disparado pelo Vercel Cron
 * (vercel.json) e, redundantemente, por um workflow do GitHub Actions
 * (.github/workflows/supabase-keep-alive.yml). A Vercel injeta o header
 * Authorization: Bearer $CRON_SECRET automaticamente quando a env var
 * CRON_SECRET existe no projeto; o workflow do GitHub manda o mesmo
 * header manualmente — em ambos os casos isso também impede chamadas
 * públicas não autorizadas a esta rota.
 *
 * Faz DOIS tipos de ping de propósito: uma query direta no Postgres
 * (via pool/pg, bypassa a API Gateway do Supabase) E uma chamada à API
 * REST pública do Supabase (PostgREST). A documentação deles fala em
 * "atividade"/"chamadas de API" para evitar a pausa — não está claro se
 * uma conexão Postgres crua (fora da API Gateway) é contabilizada da
 * mesma forma, então cobrimos os dois caminhos em vez de confiar só em
 * um.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  await pool.query("SELECT 1");

  let restPing: { ok: boolean; status?: number; error?: string } = { ok: false };
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (projectRef && anonKey) {
    try {
      // A raiz "/rest/v1/" exige service_role key (expõe o schema
      // inteiro); uma consulta real a uma tabela existente é o que
      // funciona com a anon key — e é isso que precisa contar como
      // "atividade" de qualquer forma.
      const res = await fetch(`https://${projectRef}.supabase.co/rest/v1/users?select=id&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      restPing = { ok: res.ok, status: res.status };
    } catch (err) {
      restPing = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString(), restPing });
}
