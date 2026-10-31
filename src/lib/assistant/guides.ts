import type { Resposta } from "./answers";

/**
 * Guias "como usar o sistema", escritos à mão a partir das telas reais. A IA só escolhe QUAL guia
 * mostrar (pelo id); o texto nunca é gerado por ela. Se o texto de uma tela mudar, atualize aqui.
 */
export interface Guia {
  id: string;
  titulo: string;
  /** Uma linha para a IA reconhecer a pergunta. */
  sobre: string;
  passos: string[];
  aviso?: string;
  link?: { texto: string; href: string };
}

export const GUIAS: Guia[] = [
  {
    id: "CANCELAR_OS",
    titulo: "Cancelar uma OS e devolver a peça ao estoque",
    sobre: "cancelar uma OS, devolver peças ao estoque, cancelei por engano (reativar)",
    passos: [
      "Abra a OS que quer cancelar.",
      "Role a tela até achar o botão \"Cancelar OS\" (vermelho) e toque nele.",
      "Escreva o motivo do cancelamento (pelo menos 3 letras).",
      "Se a OS tiver peças que já deram baixa, aparece \"Devolver as peças ao estoque?\". Escolha \"Sim, devolver\" (o estoque volta ao que era) ou \"Não\".",
      "Toque em \"Confirmar\".",
    ],
    aviso: "Cancelou por engano? Na OS cancelada toque em \"Reativar OS (cancelada por engano)\". As peças voltam a dar baixa e o estoque pode ficar negativo se faltar saldo.",
  },
  {
    id: "REGISTRAR_COMPRA",
    titulo: "Registrar a compra de peças",
    sobre: "registrar compra de peças, dar entrada no estoque, lançar nota do fornecedor, comprar a prazo ou parcelado",
    passos: [
      "Vá em Estoque e toque em \"Registrar compra\". Se tiver a nota em foto, use \"Preencher com foto da nota\" para adiantar.",
      "1. Fornecedor e data: escolha o fornecedor (ou \"+ Novo fornecedor…\") e a data da compra.",
      "2. Itens comprados: para cada item escolha \"Peça que já está no estoque\" ou \"Peça ou insumo novo\", a quantidade e o total pago. Use \"+ Adicionar item\" para mais linhas. Se houve frete ou desconto, preencha \"Frete ou desconto\" (frete 15,00; desconto -10,00) para o total fechar com o que você pagou.",
      "3. Pagamento: \"Já paguei\" (escolha a forma e a data), \"Vou pagar depois (ou parcelado)\" (vencimento e parcelas) ou \"Não lançar despesa\" (só dá entrada no estoque).",
      "Confira o total e toque em \"Registrar compra\".",
    ],
    aviso: "A despesa é criada junto, na categoria Fornecedores/Peças, ligada à compra. Não use isto para peças já lançadas antes, senão a entrada duplica.",
    link: { texto: "Abrir Registrar compra", href: "/dashboard/estoque/compra" },
  },
  {
    id: "DESCONTO_RECEBIMENTO",
    titulo: "Dar desconto no recebimento",
    sobre: "dar desconto na hora de receber, cliente pagou menos, desconto no pagamento da OS",
    passos: [
      "Abra a aba Recebimentos (ou, na OS entregue, toque em \"Receber / ver pagamentos\"), ache a OS pela busca e toque em \"Registrar recebimento\".",
      "Escolha a forma de pagamento e o valor que o cliente pagou. Para mais de uma forma, toque em \"+ Outra forma de pagamento\".",
      "No campo \"Desconto (R$)\" digite o valor do desconto. Ele abate do saldo e não conta como dinheiro recebido.",
      "Confira a linha \"Saldo da OS … · Lançando … · Desconto …\": deve fechar em R$ 0,00 em aberto.",
      "Confira a data do recebimento e toque em \"Confirmar\".",
    ],
    aviso: "O desconto aparece no recibo e entra na conta de lucro da OS.",
  },
  {
    id: "DESFAZER_EXECUCAO",
    titulo: "Desfazer a execução de um item",
    sobre: "marquei um item como executado por engano, desfazer execução, devolver a peça que deu baixa",
    passos: [
      "Abra a OS (ela precisa estar aberta, não entregue).",
      "No item marcado como executado, ao lado de \"Executado por\", toque em \"Desfazer execução\".",
      "Escreva o motivo (pelo menos 3 letras, por exemplo: marquei o item errado).",
      "Toque em \"Desfazer execução\" para confirmar.",
    ],
    aviso: "O item volta para \"Planejado\", a peça que tinha dado baixa volta ao estoque e o motivo fica no histórico.",
  },
  {
    id: "CORRIGIR_EXECUTOR",
    titulo: "Corrigir quem executou um serviço",
    sobre: "trocar o executor, marquei o mecânico errado, executado por Carlos Eduardo e Mateus juntos",
    passos: [
      "Abra a OS e ache o item executado.",
      "Ao lado de \"Executado por\", toque em \"Corrigir\".",
      "Marque as caixinhas de quem executou (pode marcar mais de um se trabalharam juntos).",
      "Toque em \"Confirmar correção\".",
    ],
  },
  {
    id: "CORRIGIR_ADICIONAL",
    titulo: "Corrigir o valor de um adicional já aprovado",
    sobre: "corrigir valor ou descrição de um adicional aprovado pelo cliente",
    passos: [
      "Abra a OS e vá na seção \"Adicionais\".",
      "No adicional aprovado, toque em \"Corrigir valor/descrição\".",
      "Ajuste a descrição, a quantidade ou o valor e confirme.",
    ],
    aviso: "O adicional antigo é cancelado e o novo já nasce aprovado, mantendo quem autorizou e como; o valor anterior e o motivo ficam anotados.",
  },
  {
    id: "ABRIR_RETORNO",
    titulo: "Abrir um retorno (o carro voltou)",
    sobre: "cliente voltou com o carro por causa do mesmo serviço, retorno, garantia",
    passos: [
      "Abra a OS que foi entregue.",
      "Toque em \"Abrir retorno (o carro voltou)\".",
      "O sistema abre a OS de retorno, ligada à anterior, para você registrar o que foi refeito. Se já existir um retorno dessa OS, ele abre o mesmo, sem criar outro.",
    ],
  },
  {
    id: "IMPRIMIR_ESCOLHENDO",
    titulo: "Imprimir escolhendo o que sai no papel",
    sobre: "imprimir orçamento, OS ou recibo, esconder valores, não imprimir observação interna ou aprovação",
    passos: [
      "Abra o orçamento, a OS (Imprimir / Gerar PDF) ou o recibo.",
      "Toque no botão de imprimir. Abre a caixa \"O que imprimir?\".",
      "Marque ou desmarque o que entra no papel (valores por item, subtotais, observações, diagnóstico, financeiro, assinatura, aprovação do cliente…).",
      "Toque em \"Imprimir\" (ou salve em PDF na janela de impressão).",
    ],
    aviso: "Observação interna e motivo do desconto vêm desmarcados e, se você marcar, aparece um aviso: eles iriam para o papel do cliente. O sistema lembra a última escolha de cada documento.",
  },
  {
    id: "PEDIR_PERMISSAO",
    titulo: "Pedir permissão para mandar lembretes ao cliente",
    sobre: "autorização do cliente para lembretes por WhatsApp, lembrete de troca, avaliação, permissão",
    passos: [
      "Vá em Mensagens e abra \"Permissão para lembretes\".",
      "Toque em \"Pedir no WhatsApp\" para abrir a mensagem pronta; confira e envie.",
      "Volte e toque em \"Já pedi\". O cliente fica em \"Aguardando resposta\".",
      "Quando ele responder, toque em \"Autorizou\" (passa a receber lembrete de troca e pedido de avaliação) ou \"Não quer\" (nunca mais aparece).",
    ],
    aviso: "Também dá para registrar na ficha do cliente, em \"Lembretes por WhatsApp\". Confirmação de agendamento, lembrete do dia e cobrança de saldo não dependem disso.",
    link: { texto: "Abrir Mensagens", href: "/dashboard/mensagens" },
  },
  {
    id: "INTERVALO_SERVICO",
    titulo: "Configurar um serviço para lembrar a próxima troca (por tempo ou por KM)",
    sobre: "configurar serviço controlado por km ou por tempo, intervalo de troca de óleo, lembrete de próxima troca, repetir a cada meses ou quilômetros",
    passos: [
      "Vá em Configurações → Serviços e toque no serviço (por exemplo, Troca de óleo). Se ele ainda não existir, crie em \"Novo serviço\".",
      "Na tela do serviço toque em \"Editar\".",
      "Em \"Repetir a cada…\" preencha os Meses, os Quilômetros, ou os dois. Exemplo: 6 meses e 10.000 km (vale o que vencer primeiro). Salve.",
      "Ao montar o orçamento ou a OS, escolha o serviço da lista do catálogo, em vez de escrever um texto livre. Só o serviço do catálogo entra na conta das próximas trocas.",
      "Anote o KM do carro na recepção. Para serviço só por KM, o KM da OS é o que o sistema usa para calcular.",
      "Depois que a OS é entregue, a ficha do veículo mostra \"Próximas trocas\" e, quando chega a hora, o lembrete aparece em Mensagens.",
    ],
    aviso:
      "O lembrete só aparece para clientes que já aceitaram receber lembretes (veja o pedido de permissão em Mensagens). Serviços já feitos antes de você configurar o intervalo passam a contar, desde que tenham sido escolhidos do catálogo.",
    link: { texto: "Abrir Serviços", href: "/dashboard/configuracoes/servicos" },
  },
  {
    id: "QR_CAR",
    titulo: "Gerar e imprimir o QR Car de um veículo",
    sobre: "QR Code do carro, etiqueta com QR, página do cliente com histórico e próximas trocas, QR no recibo",
    passos: [
      "Abra a ficha do veículo (Veículos → toque no carro).",
      "No cartão \"QR Car\", toque em \"Gerar QR Car\".",
      "Para colar no carro ou entregar ao cliente, toque em \"Imprimir etiqueta\" e imprima.",
      "No recibo, a caixinha \"QR Car do veículo\" (no painel de imprimir) coloca o QR no papel, desde que o veículo já tenha QR.",
      "Para ver como o cliente vê, toque em \"Ver como o cliente vê\".",
    ],
    aviso:
      "A página mostra só o carro, o histórico de serviços e as próximas trocas: sem CPF, telefone, nome do cliente nem valores. Se a etiqueta cair em mãos erradas, use \"Gerar novo QR\" (o antigo para de funcionar) ou \"Desativar QR\". Para os botões de WhatsApp da página funcionarem, preencha o WhatsApp da oficina em Configurações → Regras.",
  },
  {
    id: "CODIGO_PECA",
    titulo: "Descobrir o código de uma peça",
    sobre: "achar o código ou referência de uma peça de um veículo",
    passos: [
      "Abra o robô e escreva, por exemplo: \"código da pastilha de freio dianteira do HR-V 2017\".",
      "Confira marca, modelo, ano e peça nos campos e toque em \"Sugerir códigos da peça\".",
      "Veja os cards: código, marca, fontes e confiança. Use \"Copiar\" para levar o código.",
    ],
    aviso: "É sugestão da pesquisa na internet: confirme o código e a aplicação com o fornecedor antes de comprar, principalmente quando aparecer \"Sem fonte confirmada\".",
  },
];

export function comoFazer(id: string | undefined): Resposta {
  const guia = GUIAS.find((g) => g.id === (id ?? "").trim().toUpperCase());
  if (!guia) {
    return {
      titulo: "Ainda não tenho esse passo a passo",
      linhas: GUIAS.map((g) => ({ rotulo: g.titulo, valor: "" })),
      links: [],
      aviso: "Tenho passo a passo destes assuntos (listados acima). Pergunte de um deles, por exemplo: \"como cancelo uma OS?\".",
    };
  }
  return {
    titulo: guia.titulo,
    linhas: [],
    passos: guia.passos,
    links: guia.link ? [guia.link] : [],
    aviso: guia.aviso,
  };
}
