# ORCAMENTO_TRES_CAMADAS_ESPECIFICACAO.md

Nenhum código foi escrito. Nenhum schema, migração ou banco foi alterado. Li integralmente `docs/BRIEFING_BOX02_IDENTIDADE_OPERACAO.md` e `docs/brand/INDEX.md` antes de montar esta análise, e reli o schema/serviço de orçamento atuais (`quote_items`, `quote_versions`, `quote_approvals`, `quote_access_links`, `computeQuoteTotals`, `submitPublicQuoteDecisionService`) para fundamentar cada decisão em fato, não suposição.

Convenção: **[FATO]** já verdadeiro pelo que já existe · **[DECISÃO JÁ TOMADA]** aprovada em etapa anterior · **[RECOMENDAÇÃO]** minha proposta técnica · **[PENDENTE]** precisa da decisão de vocês · **[RISCO]** trade-off registrado.

---

## 1. OBJETIVO

Evoluir o orçamento para suportar três categorias obrigatórias de item — **NECESSÁRIO**, **RECOMENDADO**, **INFORMATIVO** — refletindo o Método BOX 02, sem quebrar o fluxo de aprovação já construído e testado (Ciclo 4 completo + Ciclo B).

---

## 2. CONTEXTO ATUAL — o que já existe, lido diretamente do código

**[FATO]** Levantamento feito agora, sem alterar nada:

- `quote_items`: `type` (SERVICO/PECA/MAO_DE_OBRA), `description`, `quantity`, `unitPriceCents`, `totalCents`, `clientDecision` (PENDENTE/APROVADO/RECUSADO), `serviceId` (Ciclo B). **Nenhum campo de categoria/urgência existe.**
- `quote_versions.totalCents`: calculado por `computeQuoteTotals`, que **soma todos os itens da versão sem distinção nenhuma** (nenhum filtro por decisão nem por qualquer outra coisa) — é o valor total **proposto**, não o valor aprovado.
- `submitPublicQuoteDecisionService`: exige decisão (APROVADO ou RECUSADO) em **absolutamente todos os itens da versão** antes de aceitar a submissão. O resultado agregado (`APROVADO`/`APROVADO_PARCIAL`/`RECUSADO`) também é calculado sobre **todos os itens sem distinção**.
- `createWorkOrderFromQuoteService`: só itens com `clientDecision = APROVADO` viram item de OS — isso já é, por construção, o filtro que vai decidir naturalmente quais categorias podem virar OS (seção 17).
- Indicadores (`getQuoteIndicatorsService`): valor aprovado/recusado somam por item via `clientDecision`; valor total orçado soma `totalCents` da versão vigente de todo orçamento enviado.
- Nenhum campo de "diagnóstico" existe em `Quote`/`QuoteVersion` — só `customerMessage` (mensagem livre mostrada ao cliente) e `internalNotes` (só a oficina vê).
- Link público, versionamento, revogação ao criar nova versão, trava de linha contra dupla submissão: tudo já construído e testado (Ciclo 4).

Esses fatos determinam quase todas as respostas desta especificação — a maioria dos cenários pedidos já tem resposta **só de olhar o que existe**, sem precisar inventar nada novo.

---

## 3. BRIEFING BOX 02 — o que puxa esta especificação

Do Método BOX 02: **Orçamos** é a 5ª etapa, depois de Identificamos/Diagnosticamos/Registramos/Explicamos. O briefing pede três categorias obrigatórias, com a regra central: **só NECESSÁRIO e RECOMENDADO aprovados geram execução e cobrança; INFORMATIVO nunca gera cobrança.** PDF e link de aprovação devem mostrar as três seções separadas — mas PDF está fora do escopo desta especificação (é saída de documento, não modelo de dado/regra; ver seção 27).

---

## 4. PRINCÍPIOS

Mesmos já aplicados em todo o projeto: simplicidade para dois mecânicos, mobile-first, poucos toques, digital first, WhatsApp como transporte (nunca API paga), link seguro, rastreabilidade, histórico congelado. Nenhum princípio novo — só reafirmado no contexto do orçamento em camadas.

---

## 5. ARQUITETURA ATUAL DO ORÇAMENTO

Ver seção 2 — não repito aqui para não duplicar.

---

## 6. CONCEITO DAS TRÊS CAMADAS

- **NECESSÁRIO**: corrige o problema identificado. Precisa de decisão do cliente. Aprovado → gera execução e cobrança.
- **RECOMENDADO**: desgaste/atenção, não impede a execução do necessário. Precisa de decisão do cliente. Aprovado → gera execução e cobrança.
- **INFORMATIVO**: registro de transparência para manutenção futura. **Nunca precisa de decisão do cliente** — não é algo a aprovar ou recusar, é algo a **saber**. Nunca gera execução nem cobrança.

**[RECOMENDAÇÃO central desta especificação]**: tratar NECESSÁRIO e RECOMENDADO como **irmãos** no fluxo de decisão (ambos passam pela mesma mecânica de aprovação por item já existente, só com peso visual diferente) e tratar INFORMATIVO como **fora do fluxo de decisão** (nunca aparece no "faltam decidir X itens", nunca tem botão aprovar/recusar). Essa distinção é o que resolve a maioria dos cenários pedidos sem precisar inventar mecanismo novo.

---

## 7 e 8. FLUXOS OPERACIONAIS E CENÁRIOS

### Cenário 1 — troca de óleo (NECESSÁRIO) + alinhamento (RECOMENDADO) + inspeção visual (INFORMATIVO); cliente aprova só o necessário
Cliente decide APROVADO na troca de óleo, RECUSADO no alinhamento (ou simplesmente não decide, se RECOMENDADO também exigir decisão — ver Cenário 3). Inspeção visual nunca entra na decisão. Resultado: `APROVADO_PARCIAL`. Conversão em OS: só a troca de óleo vira item de OS.

### Cenário 2 — aprova necessário + recomendado, recusa informativo
**Não é uma ação válida** — informativo não tem decisão para recusar. É, na prática, o Cenário 1 com o cliente aprovando as duas coisas decidíveis. A UI simplesmente não oferece "recusar" num item informativo (seção 14).

### Cenário 3 — cliente aprova só um item recomendado (nada do necessário)
**[FATO, já suportado hoje sem nenhuma mudança]**: o mecanismo de decisão por item já permite qualquer combinação — inclusive aprovar só um recomendado e recusar o necessário. É uma decisão real e válida do cliente — o sistema não deve bloquear, só refletir fielmente.

### Cenário 4 — item passa de RECOMENDADO para NECESSÁRIO após nova avaliação
**[FATO, resolvido pela arquitetura já existente]**: se o orçamento ainda está em `RASCUNHO`, é só editar. Se já foi enviado, exige **nova versão** — mesmo mecanismo já usado para mudança de preço/descrição, que já revoga o link antigo automaticamente. A categoria viaja dentro desse versionamento já provado — nenhum mecanismo novo.

### Cenário 5 — item INFORMATIVO com valor estimado
**[PENDENTE — decisão de negócio real, não técnica]**. Ver seção 9 e ORC-2 na seção 24. Não pode ser aprovado, não pode gerar cobrança (excluído do cálculo de total), não pode virar OS. A única pergunta real é se **mostra um número estimado** ao cliente ou não.

### Cenário 6 — item INFORMATIVO sem preço
Aparece só com descrição, sem nenhum valor — como uma nota. Ver seção 14.

### Cenário 7 — aprovação parcial com as três categorias
A OS recebe só os itens NECESSÁRIO/RECOMENDADO com `clientDecision = APROVADO`. INFORMATIVO nunca entra — nem aparece como "recusado", porque nunca foi candidato a decisão nenhuma.

### Cenário 8 — item NECESSÁRIO recusado, pode fechar a OS mesmo assim?
**[FATO, já é o comportamento hoje]**: sim. A OS já é criada só com os itens aprovados — um NECESSÁRIO recusado nunca chega a fazer parte da OS, então não há nada para "impedir o fechamento" por causa dele. Categoria do orçamento não introduz nenhuma trava nova aqui.

### Cenário 9 — recomendado recusado vira adicional durante a execução depois
Não é uma "transformação" de dado existente — é a criação de um item **novo e independente** via `createAdditionalItemService`, exatamente como já funciona hoje. **[RECOMENDAÇÃO, não implementada agora]**: quando adicionais ganharem categoria (fora deste ciclo), valeria um campo opcional `sourceQuoteItemId` no adicional para rastrear o contexto, sem fingir que é o mesmo registro.

### Cenário 10 — orçamento enviado, depois mecânico altera categoria/descrição/valor
**[FATO, resolvido pela arquitetura já existente]**: idêntico ao Cenário 4 — exige nova versão, link antigo revogado automaticamente (já testado). Categoria segue a mesma disciplina de nunca ser editada numa versão já enviada.

---

## 9. REGRAS DE NEGÓCIO

1. Todo item de orçamento pertence a exatamente uma categoria: `NECESSARIO`, `RECOMENDADO` ou `INFORMATIVO`.
2. Só itens `NECESSARIO`/`RECOMENDADO` participam do fluxo de decisão do cliente.
3. Itens `INFORMATIVO` nunca são decididos, nunca entram no cálculo de `totalCents` da versão, nunca podem virar item de OS.
4. **[PENDENTE — ORC-2]** Item `INFORMATIVO` pode ou não exibir um valor estimado — se exibir, esse valor nunca é somado a nenhum total.
5. A submissão de decisão do cliente exige decisão em todo item `NECESSARIO`/`RECOMENDADO` da versão — `INFORMATIVO` nunca entra nessa exigência (ajuste necessário na regra já existente, hoje ela verifica "todos os itens" sem distinção).
6. Categoria é congelada junto com o resto do item no momento da criação/versão — nunca relida de lugar nenhum depois.

---

## 10. MÁQUINA DE ESTADOS

**[FATO]** Não muda. `QuoteStatus`/`QuoteItemDecision` continuam exatamente como estão. Categoria é um atributo do item, ortogonal ao status — não é um novo eixo de estado, é uma nova coluna de classificação, do mesmo jeito que `type` (SERVICO/PECA/MAO_DE_OBRA) já é.

---

## 11. APROVAÇÃO DO CLIENTE

Reaproveita 100% o mecanismo já existente, com um ajuste de regra (não de arquitetura): a checagem "todo item precisa de decisão" e o cálculo do resultado agregado passam a considerar **só os itens `NECESSARIO`/`RECOMENDADO`** — `INFORMATIVO` fica de fora dos dois cálculos. "Aprovar todos" (se existir como atalho) também só afeta itens decidíveis.

---

## 12. VERSIONAMENTO

**[CONFIRMADO TECNICAMENTE, como vocês já esperavam]**: sim, a categoria faz parte do snapshot da versão. Não existe "editar categoria de um item já enviado" — só existe "criar nova versão com a categoria corrigida", mesma disciplina já aplicada a preço e descrição desde o Ciclo 4.

---

## 13. WHATSAPP / DIGITAL FIRST

Nada muda na arquitetura — o link público já existente continua sendo o mecanismo. A única mudança é de **conteúdo da página**, não de infraestrutura: agrupar os itens em três seções visuais em vez de uma lista única.

---

## 14. EXPERIÊNCIA MOBILE

```
[Diagnostico explicado - texto livre, ja existe como customerMessage]

NECESSARIO                              <- sempre no topo, mais destaque
  [ ] Troca de pastilhas    R$ 180
  [Aprovar] [Recusar]

RECOMENDADO                             <- peso visual secundario
  [ ] Alinhamento           R$ 120
  [Aprovar] [Recusar]

INFORMATIVO                             <- sem botao de decisao nenhum
  - Desgaste no coxim do motor observado

------------------------------
Total do orcamento: R$ 300      <- soma so NECESSARIO+RECOMENDADO
Total aprovado: R$ ...          <- so aparece apos decisao, ja existe
```

Hierarquia visual: NECESSÁRIO em destaque forte, RECOMENDADO com peso médio, INFORMATIVO em tom neutro sem call-to-action nenhum — comunica "isto precisa de você" vs "isto é só pra você saber" pela **posição e peso visual**, sem precisar de parágrafo explicativo extra.

---

## 15. FLUXO DO MECÂNICO — classificar na criação ou depois?

**[RECOMENDAÇÃO]**: na criação, no mesmo toque em que já escolhe o tipo (SERVIÇO/PEÇA/MÃO DE OBRA) — um seletor de 3 botões a mais no formulário de item já existente. Não adiar: adiar significa uma segunda passada por todos os itens antes de enviar, mais toques, mais chance de esquecer. Categoria default **NECESSARIO** (ver ORC-3) minimiza esquecimento.

---

## 16. INTEGRAÇÃO COM BIBLIOTECA DE SERVIÇOS

**[RECOMENDAÇÃO]**: a Biblioteca de Serviços não precisa de categoria própria — categoria é decisão de **contexto do orçamento** (o mesmo serviço pode ser NECESSÁRIO num carro e RECOMENDADO em outro), não propriedade do catálogo. O fluxo já existente (selecionar serviço → preenche descrição/preço → editável) ganha mais um passo: escolher a categoria, default NECESSARIO. Igual ao já garantido para preço/descrição: **mudança futura no catálogo nunca altera a categoria de um item já criado**, porque a categoria nunca é lida do catálogo.

---

## 17. INTEGRAÇÃO COM OS

| Categoria | Pode virar OS? |
|---|---|
| NECESSÁRIO aprovado | Sim |
| RECOMENDADO aprovado | Sim |
| NECESSÁRIO/RECOMENDADO recusado | Não — nunca chega a ser candidato |
| INFORMATIVO | **Nunca** |

**[FATO]**: obtido **de graça** pelo filtro já existente em `createWorkOrderFromQuoteService` (`clientDecision = APROVADO`), sem lógica nova — desde que `INFORMATIVO` nunca receba decisão (regra 5 da seção 9). Preço congelado: sem mudança. Categoria em si **não precisa** ser copiada para `work_order_items` neste ciclo (ver ORC-7).

---

## 18. INTEGRAÇÃO COM ADICIONAIS

**[DECISÃO EXPLÍCITA]**: **não alterar o Ciclo B agora**. Registro só a resposta conceitual, para quando isso virar ciclo próprio: um adicional deveria ter categoria, default **NECESSARIO** (raramente um adicional é "informativo"); deveria poder ser alterada; o cliente deveria enxergar a categoria na página pública do adicional. Nada disso é implementado agora.

---

## 19. AUDITORIA E RASTREABILIDADE — as 12 perguntas

| # | Pergunta | Onde mora a resposta |
|---|---|---|
| 1 | Qual era o item | `quote_items.description` (congelada) |
| 2 | Qual era sua classificação | `quote_items.category` **(campo novo)** |
| 3 | Quem classificou | **[RISCO/LACUNA pré-existente]** `quote_items` não guarda autor por item (só `quotes.createdByUserId` no nível do orçamento inteiro) |
| 4 | Quando | Mesma lacuna — item não tem `createdAt` próprio hoje |
| 5 | Qual era o valor | `unitPriceCents`/`totalCents` (congelados) |
| 6 | Qual versão apresentou o item | `quote_items.quoteVersionId` |
| 7 | O cliente aprovou | `clientDecision` |
| 8 | Quando aprovou | `quote_approvals.decidedAt` (nível de versão) |
| 9 | Qual canal | `quote_approvals.channel` |
| 10 | Virou OS | `work_order_items.sourceQuoteItemId` |
| 11 | Foi executado | `work_order_items.status = EXECUTADO` |
| 12 | Foi cobrado | Mesmo critério já existente: `status = EXECUTADO` |

Praticamente todas as respostas **já existem** — só a #2 é campo genuinamente novo. #3/#4 revelam uma lacuna **pré-existente**, não causada por esta especificação — registrada como risco, não bloqueia este ciclo.

---

## 20. INDICADORES — impacto

| Indicador | Impacto |
|---|---|
| Valor total orçado | Passa a excluir `INFORMATIVO`, se `computeQuoteTotals` for ajustado para não somar essa categoria |
| Valor aprovado/recusado | Já correto por construção — `INFORMATIVO` nunca tem decisão |
| Aprovação parcial | Sem mudança de definição |
| Ticket médio | Consistente com o total ajustado |
| Conversão orçamento → OS | Sem mudança — já baseada em `clientDecision = APROVADO` |

**INFORMATIVO fica fora de todo indicador monetário.** Um indicador futuro de "taxa de aprovação de recomendados" seria natural depois, mas não é pedido nem necessário agora.

---

## 21. SEGURANÇA

- Servidor rejeita qualquer tentativa de submeter decisão para item `INFORMATIVO`, mesmo chamando o serviço direto.
- Servidor rejeita item sem categoria válida (campo obrigatório, enum fechado).
- Cálculo de total sempre no servidor, nunca confiando em total calculado no cliente.

---

## 22. PROTEÇÃO CONTRA ERROS E CONCORRÊNCIA

**[FATO]**: nenhum mecanismo novo necessário — clique duplo, aprovações simultâneas, link antigo, nova versão, concorrência: tudo já resolvido pela trava de linha e pelo padrão de revogação-ao-versionar já testados. Os dois casos novos desta especificação: "item aprovado e reclassificado" não existe (reclassificar exige nova versão); "informativo tentando entrar no total" bloqueado tanto no cálculo quanto na submissão de decisão.

---

## 23. MODELO DE DADOS PROPOSTO

**A) Enum em `quote_items`** ✅ recomendada. **B) Entidade separada**: rejeitada — categoria é rótulo fechado de 3 valores, sem sub-estrutura, não precisa de tabela própria. **C) Reaproveitar `QuoteItemType`**: não viável — são eixos diferentes (o quê vs. quão urgente), fundir confundiria os dois conceitos. **D)**: nenhuma alternativa melhor.

```
enum QuoteItemCategory {
  NECESSARIO
  RECOMENDADO
  INFORMATIVO
}
```
+ coluna `category` (não-nullable, obrigatório escolher — UI pode pré-selecionar NECESSARIO como conveniência, mas o campo em si nunca é assumido silenciosamente no backend).

**Nenhuma tabela nova.** Nenhuma mudança em `quote_versions`, `quote_approvals`, `quote_access_links`, `services`, `work_order_items`.

---

## 24. DECISÕES NECESSÁRIAS

| Código | Pergunta | Alternativas | Recomendação | Impacto técnico | Impacto operacional | Bloqueia? |
|---|---|---|---|---|---|---|
| **ORC-1** | Confirmar enum como modelo de dados | Enum / entidade | Enum | Baixo | Nenhum | Não |
| **ORC-2** | INFORMATIVO pode exibir valor estimado, ou nunca tem preço? | Sim (nunca somado) / Não, só texto | — | Baixo, muda o formulário | Afeta transparência de preço percebida | **Sim** |
| **ORC-3** | Categoria padrão sem escolha explícita | NECESSARIO / obrigar escolha sempre | NECESSARIO, sempre trocável | Baixo | Menos esquecimento | Não |
| **ORC-4** | "Aprovar todos" afeta só Necessário+Recomendado | Confirmar | Confirmar | Nenhum | Nenhum | Não |
| **ORC-5** | Diagnóstico: reaproveitar `customerMessage` ou campo novo `diagnosis` | Reaproveitar / novo | Reaproveitar | Nenhum se reaproveitar | Só nomenclatura | Não |
| **ORC-6** | PDF com as 3 seções | Ciclo futuro | Confirmar | — | — | Não |
| **ORC-7** | Copiar `category` para `work_order_items` na conversão (só rastreabilidade) | Copiar / não | Copiar | Baixo | Nenhum | Não |

---

## 25. RISCOS

- **[RISCO, pré-existente]**: `quote_items` não guarda autor/data por item — já limitava rastreabilidade granular antes desta especificação, só ficou mais visível agora. Não corrigido neste ciclo.
- **[RISCO]** Se ORC-2 decidir por valor estimado em informativos, risco de confusão do cliente ("por que tem preço mas não posso aprovar?") — mitigável com rótulo claro, mas exige atenção de UX se for essa a decisão.

---

## 26. CRITÉRIOS DE ACEITE

1. Todo item tem categoria obrigatória, uma das três.
2. Total da versão nunca inclui INFORMATIVO.
3. Submissão de decisão nunca exige/aceita decisão sobre INFORMATIVO — validado no servidor.
4. Categoria congelada por versão — reclassificar após envio exige nova versão.
5. Conversão em OS só traz itens aprovados decidíveis — INFORMATIVO nunca aparece.
6. Indicadores refletem a exclusão de INFORMATIVO sem lógica nova além do ajuste do total.
7. Página pública mostra três seções com hierarquia visual clara, sem exigir decisão em informativo.

---

## 27. O QUE NÃO SERÁ IMPLEMENTADO NESTA ETAPA

Nada desta especificação foi implementado. Fora do **próximo** ciclo também: categoria funcional em adicionais/`work_order_items` (Ciclo B intocado); PDF do orçamento; Termo de Recepção; Entrega Técnica; templates de checklist; qualquer item do briefing fora do orçamento em três camadas.

---

## 28. PLANO DE IMPLEMENTAÇÃO EM CICLOS (proposta)

| Ciclo | Escopo |
|---|---|
| **C1 — Modelo e regras no servidor** | Enum + coluna, ajuste de `computeQuoteTotals` (excluir INFORMATIVO), ajuste da checagem de decisão completa e do cálculo agregado, testes dos 10 cenários |
| **C2 — Criação/edição na oficina** | Seletor de categoria no formulário de item, reaproveitando o padrão já existente |
| **C3 — Experiência pública do cliente** | As três seções em `/orcamento/[token]`, hierarquia visual, sem decisão em informativo |
| **C4 (se ORC-2 decidir por valor estimado)** | Campo de valor estimado em informativo + rótulo de transparência |

---

Aguardo aprovação da especificação — e a resposta de ORC-2 em particular, que bloqueia — antes de detalhar qualquer plano técnico ou escrever código.
