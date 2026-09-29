/**
 * Cria os dados DEMO A, B, C para visualização do estado atual do sistema
 * (Ciclos D, E, F) — usa EXCLUSIVAMENTE funções de serviço já existentes,
 * nenhuma lógica nova. Roda uma vez; para limpar depois, use
 * scripts/cleanup-demo-data.ts.
 *
 * Uso: npx tsx scripts/seed-demo-data.ts
 */
import "dotenv/config";
import { pool } from "../src/lib/db/pool";
import { createCustomerService } from "../src/lib/customers/service";
import { createVehicleService } from "../src/lib/vehicles/service";
import { createServiceService, setServiceProcedureAndChecklistService } from "../src/lib/services/service";
import { createChecklistService, addChecklistItemService } from "../src/lib/checklists/checklistService";
import {
  createWorkOrderWithoutQuoteService,
  registerWorkOrderReceptionAcceptanceService,
  setWorkOrderItemStatusService,
  setWorkOrderStatusService,
  updateWorkOrderReceptionInfoService,
  closeWorkOrderService,
} from "../src/lib/workOrders/service";
import {
  checkWorkOrderChecklistItemService,
  startWorkOrderChecklistService,
} from "../src/lib/workOrders/checklistService";

async function main() {
  const [user] = (await pool.query(`SELECT id FROM users WHERE email = 'carlim@oficina-os.local'`)).rows;
  if (!user) throw new Error("Usuário base não encontrado — rode npm run seed primeiro.");

  console.log("=== Catálogo de demonstração (aditivo, não toca o seed real) ===");
  const demoExecChecklist = await createChecklistService(user.id, {
    code: "CHK-DEMO-EXEC",
    name: "DEMO - Checklist de Execução",
    type: "EXECUCAO",
  });
  await addChecklistItemService(user.id, demoExecChecklist.id, { description: "Calibrar pneus", required: true, sortOrder: 0 });
  await addChecklistItemService(user.id, demoExecChecklist.id, { description: "Conferir aperto das rodas", required: true, sortOrder: 1 });
  await addChecklistItemService(user.id, demoExecChecklist.id, { description: "Testar direção em movimento", required: false, sortOrder: 2 });
  console.log("Checklist CHK-DEMO-EXEC criado:", demoExecChecklist.id);

  const demoService = await createServiceService(user.id, {
    name: "DEMO - Alinhamento e Balanceamento",
    category: "Suspensão",
    defaultPriceReais: "150,00",
  });
  await setServiceProcedureAndChecklistService(user.id, demoService.id, { executionChecklistId: demoExecChecklist.id });
  console.log("Serviço DEMO criado:", demoService.id);

  console.log("\n=== DEMO A — recepção sem aceite ===");
  const customerA = await createCustomerService(user.id, { type: "PF", legalName: "DEMO - Cliente A (recepção sem aceite)" });
  const vehicleA = await createVehicleService(user.id, { customerId: customerA.id, plate: "DEA1001", brand: "Fiat", model: "Argo" });
  const osA = await createWorkOrderWithoutQuoteService(user.id, {
    customerId: customerA.id,
    vehicleId: vehicleA.id,
    mileageAtEntry: 32000,
    customerComplaint: "DEMO - Barulho ao frear em baixa velocidade",
  });
  await updateWorkOrderReceptionInfoService(user.id, osA.workOrder.id, {
    preExistingDamagesDescription: "DEMO - Risco na porta traseira direita, farol esquerdo com trinca leve",
  });
  const checklistA = await startWorkOrderChecklistService(user.id, osA.workOrder.id, "ENTRADA");
  await checkWorkOrderChecklistItemService(user.id, checklistA.checklist.id, checklistA.items[0].id, true);
  await checkWorkOrderChecklistItemService(user.id, checklistA.checklist.id, checklistA.items[1].id, true);
  console.log("Customer A:", customerA.id, "| Vehicle A:", vehicleA.id, "| OS A:", osA.workOrder.id, osA.workOrder.number);
  console.log("Estado: aceite NÃO registrado (propositalmente) — Termo deve mostrar prévia dinâmica.");

  console.log("\n=== DEMO B — execução e checklist de entrega pendente (bloqueio) ===");
  const customerB = await createCustomerService(user.id, { type: "PF", legalName: "DEMO - Cliente B (execução e bloqueio)" });
  const vehicleB = await createVehicleService(user.id, { customerId: customerB.id, plate: "DEB1001", brand: "Honda", model: "Civic" });
  const osB = await createWorkOrderWithoutQuoteService(user.id, {
    customerId: customerB.id,
    vehicleId: vehicleB.id,
    mileageAtEntry: 48000,
    customerComplaint: "DEMO - Vibração no volante em alta velocidade",
    items: [
      { type: "SERVICO", description: "DEMO - Alinhamento e Balanceamento", quantity: 1, unitPriceReais: "150,00", serviceId: demoService.id },
    ],
  });
  await updateWorkOrderReceptionInfoService(user.id, osB.workOrder.id, {
    preExistingDamagesDescription: "DEMO - Amassado leve no para-choque dianteiro",
  });
  const checklistBEntrada = await startWorkOrderChecklistService(user.id, osB.workOrder.id, "ENTRADA");
  for (const item of checklistBEntrada.items) {
    await checkWorkOrderChecklistItemService(user.id, checklistBEntrada.checklist.id, item.id, true);
  }
  await registerWorkOrderReceptionAcceptanceService(user.id, osB.workOrder.id, {
    receptionAcceptedName: "DEMO - Cliente B (aceite)",
    receptionAcceptedDocument: "52998224725",
  });
  await setWorkOrderStatusService(user.id, osB.workOrder.id, "EM_EXECUCAO");

  const itemB = osB.items[0];
  const checklistBExec = await startWorkOrderChecklistService(user.id, osB.workOrder.id, "EXECUCAO", itemB.id);
  await checkWorkOrderChecklistItemService(user.id, checklistBExec.checklist.id, checklistBExec.items[0].id, true);

  await setWorkOrderItemStatusService(user.id, osB.workOrder.id, itemB.id, "EXECUTADO");
  await setWorkOrderStatusService(user.id, osB.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(user.id, osB.workOrder.id, "PRONTA");

  const checklistBEntrega = await startWorkOrderChecklistService(user.id, osB.workOrder.id, "ENTREGA");
  for (const item of checklistBEntrega.items.slice(0, 3)) {
    await checkWorkOrderChecklistItemService(user.id, checklistBEntrega.checklist.id, item.id, true);
  }

  try {
    await closeWorkOrderService(user.id, osB.workOrder.id, { deliveryAcceptedName: "Não deveria funcionar" });
    console.log("ATENÇÃO: fechamento NÃO deveria ter funcionado — investigar.");
  } catch (err) {
    console.log("Fechamento bloqueado como esperado:", (err as Error).message);
  }

  console.log("Customer B:", customerB.id, "| Vehicle B:", vehicleB.id, "| OS B:", osB.workOrder.id, osB.workOrder.number);
  console.log("Estado: PRONTA, aceite registrado, checklist de entrega com itens obrigatórios pendentes.");

  console.log("\n=== DEMO C — checklist de entrega completo, OS entregue ===");
  const customerC = await createCustomerService(user.id, { type: "PF", legalName: "DEMO - Cliente C (entregue)" });
  const vehicleC = await createVehicleService(user.id, { customerId: customerC.id, plate: "DEC1001", brand: "Chevrolet", model: "Onix" });
  const osC = await createWorkOrderWithoutQuoteService(user.id, {
    customerId: customerC.id,
    vehicleId: vehicleC.id,
    mileageAtEntry: 61000,
    customerComplaint: "DEMO - Revisão preventiva de rotina",
    items: [{ type: "SERVICO", description: "DEMO - Troca de óleo e filtros", quantity: 1, unitPriceReais: "180,00" }],
  });
  await updateWorkOrderReceptionInfoService(user.id, osC.workOrder.id, {
    preExistingDamagesDescription: "DEMO - Nenhuma avaria aparente registrada",
  });
  const checklistCEntrada = await startWorkOrderChecklistService(user.id, osC.workOrder.id, "ENTRADA");
  for (const item of checklistCEntrada.items) {
    await checkWorkOrderChecklistItemService(user.id, checklistCEntrada.checklist.id, item.id, true);
  }
  await registerWorkOrderReceptionAcceptanceService(user.id, osC.workOrder.id, {
    receptionAcceptedName: "DEMO - Cliente C (aceite)",
  });
  await setWorkOrderStatusService(user.id, osC.workOrder.id, "EM_EXECUCAO");
  await setWorkOrderItemStatusService(user.id, osC.workOrder.id, osC.items[0].id, "EXECUTADO");
  await setWorkOrderStatusService(user.id, osC.workOrder.id, "TESTE_FINAL");
  await setWorkOrderStatusService(user.id, osC.workOrder.id, "PRONTA");

  const checklistCEntrega = await startWorkOrderChecklistService(user.id, osC.workOrder.id, "ENTREGA");
  for (const item of checklistCEntrega.items) {
    await checkWorkOrderChecklistItemService(user.id, checklistCEntrega.checklist.id, item.id, true);
  }
  const closedC = await closeWorkOrderService(user.id, osC.workOrder.id, {
    deliveryAcceptedName: "DEMO - Cliente C (retirada)",
  });
  console.log("Customer C:", customerC.id, "| Vehicle C:", vehicleC.id, "| OS C:", osC.workOrder.id, osC.workOrder.number);
  console.log("Estado final:", closedC.status, "— checklist de entrada/entrega devem continuar visíveis no histórico.");

  console.log("\n=== RESUMO DE IDs ===");
  console.log(JSON.stringify(
    {
      demoExecChecklistId: demoExecChecklist.id,
      demoServiceId: demoService.id,
      demoA: { customerId: customerA.id, vehicleId: vehicleA.id, workOrderId: osA.workOrder.id, number: osA.workOrder.number },
      demoB: { customerId: customerB.id, vehicleId: vehicleB.id, workOrderId: osB.workOrder.id, number: osB.workOrder.number },
      demoC: { customerId: customerC.id, vehicleId: vehicleC.id, workOrderId: osC.workOrder.id, number: osC.workOrder.number },
    },
    null,
    2,
  ));

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
