import Link from "next/link";
import { PartForm } from "../PartForm";

export default function NewPartPage() {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/dashboard/estoque" className="text-sm text-muted underline-offset-2 hover:underline">
        ← Estoque
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Nova peça</h1>
      <PartForm mode="create" />
    </div>
  );
}
