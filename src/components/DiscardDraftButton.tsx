"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDraftAction } from "@/app/dashboard/rascunhos/actions";

export function DiscardDraftButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-muted underline">
        descartar
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await deleteDraftAction(draftId);
            router.refresh();
          })
        }
        className="font-semibold text-danger underline disabled:opacity-60"
      >
        {isPending ? "…" : "sim, descartar"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-muted underline">
        não
      </button>
    </span>
  );
}
