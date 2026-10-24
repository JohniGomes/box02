import Link from "next/link";
import { listSuppliersService } from "@/lib/purchases/service";
import { SuppliersClient } from "./SuppliersClient";

export default async function SuppliersPage() {
  const suppliers = await listSuppliersService(false);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/configuracoes" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Configurações
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Fornecedores</h1>
      <p className="text-sm text-muted">
        Quem vende peças e serviços para a oficina. Cadastrado aqui, o fornecedor aparece para escolher na compra de
        estoque e na despesa, sem digitar de novo.
      </p>
      <SuppliersClient
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, phone: s.phone, notes: s.notes, status: s.status }))}
      />
    </div>
  );
}
