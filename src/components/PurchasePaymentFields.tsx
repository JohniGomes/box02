"use client";

export type QuickPayMode = "PAGO" | "DEPOIS" | "NENHUM";
export type QuickPayMethod = "DINHEIRO" | "PIX" | "CARTAO" | "OUTRO";

export interface QuickPayment {
  mode: QuickPayMode;
  method: QuickPayMethod;
  paidOn: string;
  dueDate: string;
}

export function defaultQuickPayment(): QuickPayment {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return { mode: "PAGO", method: "PIX", paidOn: today, dueDate: "" };
}

/** Converte o que a tela guarda no formato que o servidor espera. */
export function quickPaymentToInput(p: QuickPayment) {
  return {
    mode: p.mode,
    method: p.mode === "PAGO" ? p.method : undefined,
    paidOn: p.mode === "PAGO" ? p.paidOn : undefined,
    dueDate: p.mode === "DEPOIS" ? p.dueDate : undefined,
  };
}

export function quickPaymentIsValid(p: QuickPayment): boolean {
  return p.mode !== "DEPOIS" || Boolean(p.dueDate);
}

const fieldClass = "h-10 rounded-lg border border-border bg-background px-3 text-sm";

/**
 * Bloco "como foi pago" dos formulários de peça comprada: gera a despesa de
 * Fornecedores/Peças junto com a entrada no estoque (ou nenhuma, se já foi lançada).
 */
export function PurchasePaymentFields({
  value,
  onChange,
}: {
  value: QuickPayment;
  onChange: (next: QuickPayment) => void;
}) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <span className="text-xs font-medium text-muted">Pagamento da compra</span>
      <select
        value={value.mode}
        onChange={(e) => onChange({ ...value, mode: e.target.value as QuickPayMode })}
        className={fieldClass}
      >
        <option value="PAGO">Já paguei (lança a despesa como paga)</option>
        <option value="DEPOIS">Vou pagar depois (lança a despesa em aberto)</option>
        <option value="NENHUM">Não lançar despesa</option>
      </select>
      {value.mode === "PAGO" ? (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={value.method}
            onChange={(e) => onChange({ ...value, method: e.target.value as QuickPayMethod })}
            className={fieldClass}
          >
            <option value="PIX">Pix</option>
            <option value="CARTAO">Cartão</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="OUTRO">Outro</option>
          </select>
          <input
            type="date"
            max={today}
            value={value.paidOn}
            onChange={(e) => onChange({ ...value, paidOn: e.target.value })}
            className={fieldClass}
          />
        </div>
      ) : null}
      {value.mode === "DEPOIS" ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">Vencimento</label>
          <input
            type="date"
            value={value.dueDate}
            onChange={(e) => onChange({ ...value, dueDate: e.target.value })}
            className={fieldClass}
          />
        </div>
      ) : null}
    </div>
  );
}
