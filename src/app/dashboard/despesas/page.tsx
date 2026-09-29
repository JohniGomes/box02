import { listExpensesService } from "@/lib/expenses/service";
import { ExpensesClient } from "./ExpensesClient";

export default async function DespesasPage() {
  const expenses = await listExpensesService();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold tracking-tight">Despesas</h1>
      <p className="text-sm text-muted">
        Contas a pagar da oficina — independentes de OS (aluguel, salários, fornecedores, impostos e outros custos
        fixos/variáveis). Visão de caixa simples: não substitui conciliação bancária nem contabilidade formal.
      </p>
      <ExpensesClient
        expenses={expenses.map((e) => ({
          id: e.id,
          category: e.category,
          description: e.description,
          supplierName: e.supplierName,
          amountCents: e.amountCents,
          dueDate: e.dueDate,
          paidAt: e.paidAt ? e.paidAt.toISOString() : null,
          paymentMethod: e.paymentMethod,
          notes: e.notes,
          status: e.status,
        }))}
      />
    </div>
  );
}
