import Link from "next/link";
import { notFound } from "next/navigation";
import { getPartService } from "@/lib/inventory/service";
import { PartForm, partRecordToFormValues } from "../../PartForm";

export default async function EditPartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const part = await getPartService(id);
  if (!part) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/dashboard/estoque/${id}`} className="text-sm text-muted underline-offset-2 hover:underline">
        ← Voltar
      </Link>
      <h1 className="text-lg font-semibold tracking-tight">Editar peça</h1>
      <PartForm mode="edit" partId={id} initialValues={partRecordToFormValues(part)} />
    </div>
  );
}
