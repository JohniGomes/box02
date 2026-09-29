import "dotenv/config";

// Os testes de integração usam um banco de dados de teste separado do de
// desenvolvimento (oficina_os_test), nunca o banco real.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
