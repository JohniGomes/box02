/**
 * Limpeza dos dados DEMO criados para a visualização do estado atual do
 * sistema (Ciclos D, E, F) — DEMO A, B, C.
 *
 * NÃO É EXECUTADO AUTOMATICAMENTE. Rode manualmente quando quiser remover
 * os dados de demonstração:
 *
 *   npx tsx scripts/cleanup-demo-data.ts
 *
 * Remove EXCLUSIVAMENTE registros identificados pelo marcador "DEMO -"
 * (clientes) e pelo código "CHK-DEMO-EXEC" (checklist de execução de
 * demonstração) e o serviço de catálogo associado a ele — nunca toca
 * CHK-001, CHK-006, POP-001 a POP-005 ou qualquer cliente/veículo/OS que
 * não tenha esse marcador.
 */
import "dotenv/config";
import { pool } from "../src/lib/db/pool";

async function main() {
  const customers = await pool.query(
    `SELECT id FROM customers WHERE "legalName" LIKE 'DEMO -%'`,
  );
  const customerIds = customers.rows.map((r) => r.id);

  if (customerIds.length === 0) {
    console.log("Nenhum cliente DEMO encontrado — nada a limpar (clientes).");
  } else {
    console.log(`Encontrados ${customerIds.length} cliente(s) DEMO:`, customerIds);

    const workOrders = await pool.query(
      `SELECT id FROM work_orders WHERE "customerId" = ANY($1::text[])`,
      [customerIds],
    );
    const workOrderIds = workOrders.rows.map((r) => r.id);

    await pool.query(
      `DELETE FROM audit_logs WHERE "entityId" = ANY($1::text[]) OR "entityId" = ANY($2::text[])`,
      [workOrderIds, customerIds],
    );
    await pool.query(
      `DELETE FROM work_order_checklist_items WHERE "workOrderChecklistId" IN (
         SELECT id FROM work_order_checklists WHERE "workOrderId" = ANY($1::text[])
       )`,
      [workOrderIds],
    );
    await pool.query(`DELETE FROM work_order_checklists WHERE "workOrderId" = ANY($1::text[])`, [workOrderIds]);
    await pool.query(`DELETE FROM work_order_closures WHERE "workOrderId" = ANY($1::text[])`, [workOrderIds]);
    await pool.query(`DELETE FROM work_order_items WHERE "workOrderId" = ANY($1::text[])`, [workOrderIds]);
    await pool.query(`DELETE FROM work_orders WHERE id = ANY($1::text[])`, [workOrderIds]);
    await pool.query(`DELETE FROM vehicles WHERE "customerId" = ANY($1::text[])`, [customerIds]);
    await pool.query(`DELETE FROM customers WHERE id = ANY($1::text[])`, [customerIds]);
    console.log(`Removidas ${workOrderIds.length} OS (e dados relacionados) e ${customerIds.length} cliente(s) DEMO.`);
  }

  const demoChecklist = await pool.query(`SELECT id FROM checklists WHERE code = 'CHK-DEMO-EXEC'`);
  if (demoChecklist.rows.length > 0) {
    const checklistId = demoChecklist.rows[0].id;
    await pool.query(`UPDATE services SET "executionChecklistId" = NULL WHERE "executionChecklistId" = $1`, [checklistId]);
    await pool.query(`DELETE FROM services WHERE name LIKE 'DEMO -%'`);
    await pool.query(`DELETE FROM checklist_items WHERE "checklistId" = $1`, [checklistId]);
    await pool.query(`DELETE FROM checklists WHERE id = $1`, [checklistId]);
    console.log("Removido checklist de demonstração CHK-DEMO-EXEC e serviço de catálogo DEMO associado.");
  } else {
    console.log("Nenhum checklist CHK-DEMO-EXEC encontrado — nada a limpar (catálogo).");
  }

  console.log("\nLimpeza de dados DEMO concluída. CHK-001, CHK-006 e POP-001-005 (seed real) intocados.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
