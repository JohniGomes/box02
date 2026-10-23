import { z } from "zod";
import { isValidCnpj, isValidCpf, onlyDigits } from "./document";

const optionalTrimmed = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const workOrderItemInputSchema = z.object({
  type: z.enum(["SERVICO", "PECA", "MAO_DE_OBRA"]),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  quantity: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().positive()),
  unitPriceReais: z.union([z.string(), z.number()]),
  serviceId: z.string().trim().optional(),
  partId: z.string().trim().optional(),
});

/** Check-in — usado tanto na criação a partir de orçamento quanto sem orçamento. */
export const workOrderCheckInSchema = z.object({
  /** Opcional: vazio vira undefined (OS sem km informado). */
  mileageAtEntry: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : Number(v)))
    .pipe(z.number().int().min(0, "Quilometragem inválida").optional()),
  customerComplaint: optionalTrimmed,
  diagnosis: optionalTrimmed,
});

/** Correção de queixa e KM depois da criação da OS (até o aceite do Termo). */
export const updateWorkOrderCheckInSchema = workOrderCheckInSchema.pick({
  mileageAtEntry: true,
  customerComplaint: true,
});

export const createWorkOrderWithoutQuoteSchema = workOrderCheckInSchema.extend({
  customerId: z.string().min(1, "Selecione o cliente"),
  vehicleId: z.string().min(1, "Selecione o veículo"),
  items: z.array(workOrderItemInputSchema).optional().default([]),
  discountType: z.enum(["PERCENTUAL", "FIXO"]).optional(),
  discountValue: z.union([z.string(), z.number()]).optional(),
  surchargeType: z.enum(["PERCENTUAL", "FIXO"]).optional(),
  surchargeValue: z.union([z.string(), z.number()]).optional(),
});

export type WorkOrderItemInput = z.infer<typeof workOrderItemInputSchema>;
export type WorkOrderCheckInInput = z.infer<typeof workOrderCheckInSchema>;
export type CreateWorkOrderWithoutQuoteInput = z.infer<typeof createWorkOrderWithoutQuoteSchema>;

/** Aceite na entrega (D-OS-5) — nome obrigatório, CPF opcional mas validado quando informado. */
export const workOrderDeliverySchema = z
  .object({
    deliveryAcceptedName: z.string().trim().min(2, "Informe o nome de quem está recebendo"),
    deliveryAcceptedDocument: optionalTrimmed,
  })
  .superRefine((data, ctx) => {
    if (data.deliveryAcceptedDocument) {
      const digits = onlyDigits(data.deliveryAcceptedDocument);
      if (digits.length !== 11 || !isValidCpf(digits)) {
        ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["deliveryAcceptedDocument"] });
      }
    }
  })
  .transform((data) => ({
    ...data,
    deliveryAcceptedDocument: data.deliveryAcceptedDocument
      ? onlyDigits(data.deliveryAcceptedDocument)
      : undefined,
  }));

export type WorkOrderDeliveryInput = z.infer<typeof workOrderDeliverySchema>;

// ============================================================
// Ciclo F — Termo de Recepção
// ============================================================

/** Atualização livre das avarias preexistentes — sem validação de
 * conteúdo além do trim, sem limite de reenvio (só o aceite é
 * write-once, não este passo). */
export const updatePreExistingDamagesSchema = z.object({
  preExistingDamagesDescription: optionalTrimmed,
});
export type UpdatePreExistingDamagesInput = z.infer<typeof updatePreExistingDamagesSchema>;

/** Duplicado conscientemente de workOrderDeliverySchema (não reaproveitado
 * por composição) — zero risco de uma mudança futura num afetar o outro
 * silenciosamente; os dois já eram testados/estáveis antes deste ciclo. */
export const workOrderReceptionAcceptanceSchema = z
  .object({
    receptionAcceptedName: z.string().trim().min(2, "Informe o nome de quem está recebendo o veículo"),
    receptionAcceptedDocument: optionalTrimmed,
    receptionAwareness1: z.boolean(),
    receptionAwareness2: z.boolean(),
    receptionAwareness3: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.receptionAcceptedDocument) {
      const digits = onlyDigits(data.receptionAcceptedDocument);
      if (digits.length !== 11 || !isValidCpf(digits)) {
        ctx.addIssue({ code: "custom", message: "CPF inválido", path: ["receptionAcceptedDocument"] });
      }
    }
    if (!data.receptionAwareness1 || !data.receptionAwareness2 || !data.receptionAwareness3) {
      ctx.addIssue({
        code: "custom",
        message: "O cliente precisa confirmar ciência dos 3 itens antes do aceite.",
        path: ["receptionAwareness1"],
      });
    }
  })
  .transform((data) => ({
    ...data,
    receptionAcceptedDocument: data.receptionAcceptedDocument
      ? onlyDigits(data.receptionAcceptedDocument)
      : undefined,
  }));
export type WorkOrderReceptionAcceptanceInput = z.infer<typeof workOrderReceptionAcceptanceSchema>;

export const cancelWorkOrderSchema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo do cancelamento"),
});

export const reactivateWorkOrderSchema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo da reativação"),
});

export const cancelWorkOrderItemSchema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo do cancelamento"),
});

// ============================================================
// Ciclo L — Rastreabilidade de Execução por Mecânico
// ============================================================

/** Quem executou: um usuário (executedByUserId) OU um nome da lista de
 * executores (executorId). Um dos dois é obrigatório. */
const executorChoiceShape = {
  executedByUserId: z.string().trim().optional(),
  executorId: z.string().trim().optional(),
};
const executorChoiceRefine = (d: { executedByUserId?: string; executorId?: string }) =>
  Boolean(d.executedByUserId) || Boolean(d.executorId);
const executorChoiceMessage = { message: "Selecione quem executou", path: ["executedByUserId"] };

export const executeWorkOrderItemSchema = z.object(executorChoiceShape).refine(executorChoiceRefine, executorChoiceMessage);

export const correctWorkOrderItemExecutorSchema = z
  .object(executorChoiceShape)
  .refine(executorChoiceRefine, executorChoiceMessage);

// ============================================================
// Sub-etapa 2 — Adicionais durante a execução
// ============================================================

export const createAdditionalItemSchema = z.object({
  type: z.enum(["SERVICO", "PECA", "MAO_DE_OBRA"]),
  description: z.string().trim().min(1, "Descrição obrigatória"),
  quantity: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().positive()),
  unitPriceReais: z.union([z.string(), z.number()]),
  serviceId: z.string().trim().optional(),
  partId: z.string().trim().optional(),
});
export type CreateAdditionalItemInput = z.infer<typeof createAdditionalItemSchema>;

/** Autorização direta (presencial/telefone) — sem link. */
export const authorizeAdditionalItemDirectlySchema = z.object({
  decision: z.enum(["APROVADO", "RECUSADO"]),
  authorizedBy: z.string().trim().min(2, "Informe quem autorizou/recusou"),
  channel: z.enum(["PRESENCIAL", "TELEFONE"]),
  notes: optionalTrimmed,
});
export type AuthorizeAdditionalItemDirectlyInput = z.infer<typeof authorizeAdditionalItemDirectlySchema>;

/** Decisão via link público (AD-5: CPF opcional, validado quando informado
 * — mesmo padrão do orçamento, reaproveitando o mesmo validador). */
export const additionalItemDecisionSchema = z
  .object({
    decision: z.enum(["APROVADO", "RECUSADO"]),
    approverName: z.string().trim().min(2, "Informe seu nome"),
    approverDocument: optionalTrimmed,
    notes: optionalTrimmed,
    ipAddress: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.approverDocument) {
      const digits = onlyDigits(data.approverDocument);
      const validCpf = digits.length === 11 && isValidCpf(digits);
      const validCnpj = digits.length === 14 && isValidCnpj(digits);
      if (!validCpf && !validCnpj) {
        ctx.addIssue({ code: "custom", message: "CPF/CNPJ inválido", path: ["approverDocument"] });
      }
    }
  })
  .transform((data) => ({
    ...data,
    approverDocument: data.approverDocument ? onlyDigits(data.approverDocument) : undefined,
  }));
export type AdditionalItemDecisionInput = z.infer<typeof additionalItemDecisionSchema>;

/** AD-6: ação assistida "Ajustar valor/escopo" — os dados do item novo. */
export const adjustAdditionalItemSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória"),
  quantity: z.union([z.string(), z.number()]).transform((v) => Number(v)).pipe(z.number().positive()),
  unitPriceReais: z.union([z.string(), z.number()]),
  adjustReason: z.string().trim().min(3, "Informe o motivo do ajuste"),
});
export type AdjustAdditionalItemInput = z.infer<typeof adjustAdditionalItemSchema>;

// ============================================================
// UI do Método BOX 02 — EXPLICAMOS (independente de orçamento)
// ============================================================

export const updateDiagnosisExplanationSchema = z.object({
  diagnosisExplanationNotes: optionalTrimmed,
});
export type UpdateDiagnosisExplanationInput = z.infer<typeof updateDiagnosisExplanationSchema>;

// ============================================================
// Ciclo G — Entrega Técnica
// ============================================================

export const updateTechnicalNotesSchema = z.object({
  technicalNotes: optionalTrimmed,
});
export type UpdateTechnicalNotesInput = z.infer<typeof updateTechnicalNotesSchema>;

// ============================================================
// Ciclo I — Recebimentos (Financeiro mínimo)
// ============================================================

export const registerWorkOrderPaymentSchema = z.object({
  amountReais: z.union([z.string(), z.number()]),
  method: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
  notes: optionalTrimmed,
  /** Data em que foi recebido (AAAA-MM-DD). Vazio = agora. Serve para lançar
   * um pagamento que aconteceu em outro dia. */
  receivedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data do recebimento inválida")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type RegisterWorkOrderPaymentInput = z.infer<typeof registerWorkOrderPaymentSchema>;

/** Vários recebimentos de uma vez (ex.: parte no Pix, parte no cartão). */
export const registerWorkOrderPaymentsSchema = z.object({
  payments: z
    .array(
      z.object({
        amountReais: z.union([z.string(), z.number()]),
        method: z.enum(["DINHEIRO", "PIX", "CARTAO", "OUTRO"], { message: "Selecione a forma de pagamento" }),
      }),
    )
    .min(1, "Informe pelo menos um pagamento"),
  notes: optionalTrimmed,
  receivedOn: registerWorkOrderPaymentSchema.shape.receivedOn,
});
export type RegisterWorkOrderPaymentsInput = z.infer<typeof registerWorkOrderPaymentsSchema>;

// ============================================================
// Ciclo M — Estorno de recebimento (DEC-I6 revisitada)
// ============================================================

export const refundWorkOrderPaymentSchema = z.object({
  refundReais: z.union([z.string(), z.number()]),
  reason: z.string().trim().min(3, "Informe o motivo do estorno"),
});
export type RefundWorkOrderPaymentInput = z.infer<typeof refundWorkOrderPaymentSchema>;

// ============================================================
// Ciclo J — Evidências/Fotos
// ============================================================

/** Formatos e tamanho confirmados (não mais recomendação): JPEG/PNG/HEIC,
 * até 10MB. Validação de MIME real do arquivo, não só da extensão do nome. */
export const ACCEPTED_EVIDENCE_MIME_TYPES = ["image/jpeg", "image/png", "image/heic"] as const;
export const MAX_EVIDENCE_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const createWorkOrderEvidenceMetadataSchema = z.object({
  type: z.enum(["GERAL", "AVARIA"], { message: "Selecione o tipo de evidência" }),
  description: optionalTrimmed,
  mimeType: z.enum(ACCEPTED_EVIDENCE_MIME_TYPES, { message: "Formato de arquivo não aceito (use JPEG, PNG ou HEIC)" }),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(MAX_EVIDENCE_FILE_SIZE_BYTES, "Arquivo maior que o limite de 10MB"),
});
export type CreateWorkOrderEvidenceMetadataInput = z.infer<typeof createWorkOrderEvidenceMetadataSchema>;
