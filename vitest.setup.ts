import "dotenv/config";

// Os testes de integração usam um banco de dados de teste separado do de
// produção/desenvolvimento, nunca o banco real. SEM EXCEÇÃO: sem
// DATABASE_URL_TEST configurado, os testes recusam-se a rodar — a
// alternativa (cair silenciosamente para DATABASE_URL) já apagou dados de
// produção duas vezes por falta dessa separação. Nunca reverta este guard
// para "silenciosamente seguir usando DATABASE_URL".
if (!process.env.DATABASE_URL_TEST) {
  throw new Error(
    "DATABASE_URL_TEST não configurado. Os testes de integração truncam tabelas inteiras a cada " +
      "execução — rodá-los contra DATABASE_URL (produção) já apagou dados reais duas vezes. " +
      "Configure um banco de teste separado e defina DATABASE_URL_TEST no .env antes de rodar `vitest`.",
  );
}
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
