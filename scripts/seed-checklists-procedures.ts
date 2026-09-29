/**
 * Seed do Ciclo D — carga inicial de CHK-001, CHK-006 e POP-001 a POP-005.
 *
 * Conteúdo extraído literalmente de docs/BRIEFING_BOX02_IDENTIDADE_OPERACAO.md
 * (seção 4) — nenhum passo técnico foi inventado para preencher lacunas.
 *
 * Decisões de mapeamento tomadas aqui (documentadas, não escondidas):
 * - CHK-001: só a seção "Condição de entrada" do briefing vira itens de
 *   checklist (são os únicos itens genuinamente no formato check/confirmar
 *   do briefing). "Identificação" (cliente, telefone, veículo, placa, km)
 *   e "Queixa do cliente" já são campos de dado que existem em outro lugar
 *   do sistema (cliente/veículo/OS), não itens a marcar — não foram
 *   duplicados aqui como ChecklistItem.
 * - CHK-006: os 11 itens do briefing mapeiam 1:1, sem nenhuma adaptação.
 * - POP-001 a POP-005: o briefing só dá código + título + etapa do
 *   Método para cada um — nenhum passo técnico foi fornecido. `steps`
 *   fica em branco (null) de propósito; `objective` recebe só a etapa do
 *   Método já explicitamente associada na tabela do briefing (não é
 *   conteúdo inventado, é a mesma tabela, só reorganizada).
 * - CHK-002 a CHK-005 (Diagnóstico eletrônico, Inspeção mecânica, Registro
 *   fotográfico, Conferência pós-serviço): NÃO SEMEADOS. O briefing não dá
 *   conteúdo de itens para eles, e sua "etapa" não mapeia limpo no enum
 *   atual de 3 tipos (ENTRADA/EXECUCAO/ENTREGA) — fica registrado aqui
 *   como gap para decisão futura, não inventado.
 *
 * Idempotente: roda várias vezes sem duplicar (checa por `code` antes de
 * criar). Não é migração — roda manualmente, depois da migração de schema.
 *
 * Uso: npx tsx scripts/seed-checklists-procedures.ts
 */
import "dotenv/config";
import { pool } from "../src/lib/db/pool";
import { createChecklistService, addChecklistItemService } from "../src/lib/checklists/checklistService";
import { createProcedureService } from "../src/lib/checklists/procedureService";
import { findChecklistByCode } from "../src/lib/db/repositories/checklists";
import { findProcedureByCode } from "../src/lib/db/repositories/procedures";

async function main() {
  const [user] = (await pool.query(`SELECT id FROM users ORDER BY "createdAt" ASC LIMIT 1`)).rows;
  if (!user) {
    console.error("Nenhum usuário encontrado — rode o seed de usuários primeiro.");
    process.exit(1);
  }

  // ---- CHK-001 — Checklist de Entrada ----
  const chk001Existing = await findChecklistByCode("CHK-001");
  if (chk001Existing) {
    console.log("CHK-001 já existe, pulando criação.");
  } else {
    const chk001 = await createChecklistService(user.id, {
      code: "CHK-001",
      name: "Checklist de entrada",
      type: "ENTRADA",
    });
    const chk001Items = [
      "Estado geral da carroceria registrado",
      "Avarias preexistentes registradas",
      "Rodas/pneus registrados quando necessário",
      "Luzes de advertência no painel",
      "Nível aparente de combustível",
      "Objetos relevantes no interior",
      "Fotos de entrada realizadas",
    ];
    for (let i = 0; i < chk001Items.length; i++) {
      await addChecklistItemService(user.id, chk001.id, {
        description: chk001Items[i],
        required: true,
        sortOrder: i,
      });
    }
    console.log("CHK-001 criado com", chk001Items.length, "itens.");
  }

  // ---- CHK-006 — Checklist de Entrega ----
  const chk006Existing = await findChecklistByCode("CHK-006");
  if (chk006Existing) {
    console.log("CHK-006 já existe, pulando criação.");
  } else {
    const chk006 = await createChecklistService(user.id, {
      code: "CHK-006",
      name: "Checklist de entrega",
      type: "ENTREGA",
    });
    const chk006Items = [
      "Serviço executado conferido",
      "Veículo testado quando aplicável",
      "Ferramentas/objetos retirados do veículo",
      "Avarias de entrada conferidas",
      "Peças substituídas separadas quando solicitado",
      "Serviço realizado explicado ao cliente",
      "Recomendações futuras informadas",
      "Próxima manutenção recomendada",
      "Cliente recebeu orçamento/OS",
      "Cliente recebeu evidências quando aplicável",
      "Entrega registrada",
    ];
    for (let i = 0; i < chk006Items.length; i++) {
      await addChecklistItemService(user.id, chk006.id, {
        description: chk006Items[i],
        required: true,
        sortOrder: i,
      });
    }
    console.log("CHK-006 criado com", chk006Items.length, "itens.");
  }

  // ---- POP-001 a POP-005 ----
  const pops = [
    { code: "POP-001", title: "Recepção e identificação do veículo", stage: "Identificamos" },
    { code: "POP-002", title: "Diagnóstico técnico", stage: "Diagnosticamos" },
    { code: "POP-003", title: "Comunicação do diagnóstico", stage: "Explicamos" },
    { code: "POP-004", title: "Execução dos serviços", stage: "Executamos" },
    { code: "POP-005", title: "Entrega técnica", stage: "Entregamos" },
  ];
  for (const pop of pops) {
    const existing = await findProcedureByCode(pop.code);
    if (existing) {
      console.log(`${pop.code} já existe, pulando criação.`);
      continue;
    }
    await createProcedureService(user.id, {
      code: pop.code,
      title: pop.title,
      objective: `Etapa do Método BOX 02: ${pop.stage}.`,
    });
    console.log(`${pop.code} criado.`);
  }

  console.log("\nSeed concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
