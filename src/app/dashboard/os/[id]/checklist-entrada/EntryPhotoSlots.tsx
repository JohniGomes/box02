"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWorkOrderEvidenceAction, deleteWorkOrderEvidenceAction } from "../../evidenceActions";

const SLOTS = [
  { key: "Frente", type: "GERAL" },
  { key: "Traseira", type: "GERAL" },
  { key: "Lateral E", type: "GERAL" },
  { key: "Lateral D", type: "GERAL" },
  { key: "Painel/KM", type: "GERAL" },
  { key: "Avarias", type: "AVARIA" },
] as const;

export interface EvidenceForSlots {
  id: string;
  type: string;
  description: string | null;
}

export function EntryPhotoSlots({
  workOrderId,
  evidences,
  locked,
}: {
  workOrderId: string;
  evidences: EvidenceForSlots[];
  locked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handlePick(slotKey: string) {
    inputRefs.current[slotKey]?.click();
  }

  function handleFileChange(slotKey: string, slotType: string, file: File | undefined) {
    if (!file) return;
    setError(null);

    const formData = new FormData();
    formData.set("file", file);
    formData.set("type", slotType);
    formData.set("description", slotKey);

    startTransition(async () => {
      const result = await createWorkOrderEvidenceAction(workOrderId, formData);
      if (!result.success) {
        setError(result.error ?? "Falha ao enviar a foto.");
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(evidenceId: string) {
    setError(null);
    startTransition(async () => {
      await deleteWorkOrderEvidenceAction(workOrderId, evidenceId);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="mb-1 text-sm font-bold uppercase">Fotos de entrada</h2>
      <p className="mb-3 text-xs text-muted">
        Orientação: tire as 6 fotos nesta ordem. Em dia corrido, o mínimo são 2: frente e avarias.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SLOTS.map((slot) => {
          const evidence = evidences.find((ev) => ev.description === slot.key);
          return (
            <div key={slot.key} className="flex flex-col gap-1">
              <input
                ref={(el) => {
                  inputRefs.current[slot.key] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/heic"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileChange(slot.key, slot.type, e.target.files?.[0])}
              />
              {evidence ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida por rota autenticada própria */}
                  <img
                    src={`/dashboard/os/${workOrderId}/evidence/${evidence.id}`}
                    alt={slot.key}
                    className="aspect-square w-full rounded-lg border border-border object-cover"
                  />
                  {!locked ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(evidence.id)}
                      disabled={isPending}
                      className="absolute right-1 top-1 rounded-md bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => handlePick(slot.key)}
                  disabled={locked || isPending}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-muted disabled:opacity-50"
                >
                  <span className="text-xl">+</span>
                  <span className="text-[10px]">Foto</span>
                </button>
              )}
              <span className="text-center text-[11px] font-medium">{slot.key}</span>
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
