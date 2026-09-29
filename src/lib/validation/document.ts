/** Remove tudo que não for dígito. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Valida CPF pelo algoritmo padrão dos dígitos verificadores. */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais

  const digits = cpf.split("").map(Number);

  const calcCheckDigit = (base: number[]): number => {
    let sum = 0;
    let weight = base.length + 1;
    for (const d of base) {
      sum += d * weight;
      weight -= 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const dv1 = calcCheckDigit(digits.slice(0, 9));
  const dv2 = calcCheckDigit(digits.slice(0, 10));

  return dv1 === digits[9] && dv2 === digits[10];
}

/** Valida CNPJ pelo algoritmo padrão dos dígitos verificadores. */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digits = cnpj.split("").map(Number);

  const calcCheckDigit = (base: number[]): number => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += base[i] * weights[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const dv1 = calcCheckDigit(digits.slice(0, 12));
  const dv2 = calcCheckDigit(digits.slice(0, 13));

  return dv1 === digits[12] && dv2 === digits[13];
}

/** Formata para exibição: 000.000.000-00 (CPF) ou 00.000.000/0000-00 (CNPJ). */
export function formatDocument(digitsOnly: string): string {
  const d = onlyDigits(digitsOnly);
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return digitsOnly;
}
