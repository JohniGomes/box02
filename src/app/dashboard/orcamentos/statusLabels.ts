import type { QuoteStatus } from "@/lib/db/repositories/quotes";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado",
  APROVADO: "Aprovado",
  APROVADO_PARCIAL: "Parcial",
  RECUSADO: "Recusado",
  EXPIRADO: "Expirado",
  CANCELADO: "Cancelado",
};

export const QUOTE_STATUS_CLASS: Record<QuoteStatus, string> = {
  RASCUNHO: "bg-muted/20 text-muted",
  ENVIADO: "bg-accent/15 text-foreground",
  APROVADO: "bg-success/15 text-success",
  APROVADO_PARCIAL: "bg-accent/15 text-foreground",
  RECUSADO: "bg-danger/15 text-danger",
  EXPIRADO: "bg-muted/20 text-muted",
  CANCELADO: "bg-muted/20 text-muted",
};
