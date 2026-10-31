/**
 * Perguntas prontas do robô (botões), por grupo. `enviar: false` só preenche a caixa,
 * para a pessoa completar (nome da OS, da peça ou do cliente).
 */
export interface PerguntaFrequente {
  rotulo: string;
  texto: string;
  enviar: boolean;
}

export const GRUPOS_PERGUNTAS: { grupo: string; perguntas: PerguntaFrequente[] }[] = [
  {
    grupo: "Dinheiro",
    perguntas: [
      { rotulo: "Quanto entrou e saiu esse mês?", texto: "Quanto entrou e saiu esse mês?", enviar: true },
      { rotulo: "Como foi o mês passado?", texto: "Como foi o financeiro do mês passado?", enviar: true },
      { rotulo: "Quanto tenho a receber?", texto: "Quanto tenho a receber e de quem?", enviar: true },
      { rotulo: "Taxa de cartão do mês", texto: "Quanto paguei de taxa de cartão esse mês?", enviar: true },
      { rotulo: "Lucro de uma OS…", texto: "Qual o lucro da OS-", enviar: false },
    ],
  },
  {
    grupo: "Oficina",
    perguntas: [
      { rotulo: "Quais OS estão abertas?", texto: "Quais OS estão abertas na oficina agora?", enviar: true },
      { rotulo: "Quem atendo hoje?", texto: "Quem eu atendo hoje?", enviar: true },
      { rotulo: "Quem atendo amanhã?", texto: "Quem eu atendo amanhã?", enviar: true },
      { rotulo: "Histórico de um cliente…", texto: "O que o cliente já fez aqui: ", enviar: false },
    ],
  },
  {
    grupo: "Estoque",
    perguntas: [
      { rotulo: "Quais peças estão acabando?", texto: "Quais peças estão acabando?", enviar: true },
      { rotulo: "Saldo de uma peça…", texto: "Quanto tenho de ", enviar: false },
    ],
  },
  {
    grupo: "Mensagens",
    perguntas: [
      { rotulo: "Mensagens pendentes", texto: "Quantas mensagens tenho para enviar?", enviar: true },
      { rotulo: "Trocas chegando", texto: "Quais clientes estão com troca chegando ou vencida?", enviar: true },
    ],
  },
];
