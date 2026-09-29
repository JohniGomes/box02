# GOVERNANÇA E PRINCÍPIOS — PROJETO BOX 02

> **Este é o "cérebro" do projeto.** Diferente do `PAINEL_PROJETO_BOX02.md` (que registra **o que já foi feito**, ciclo a ciclo), este documento registra **como o projeto trabalha** — a sequência de governança e os princípios arquiteturais que já se provaram, repetidos e estáveis, ao longo dos Ciclos D até H. Deve ser consultado por Claude no início de qualquer ciclo novo, antes de propor qualquer diagnóstico ou plano.

**Criado em**: 02/09/2026, depois do H2 do Ciclo H (Precificação e Custos), no momento em que o padrão de governança já tinha se repetido de forma estável nos Ciclos F, G e H.

---

## 1. A sequência de governança (não pular etapas)

Todo ciclo de trabalho segue esta sequência. Cada etapa produz um artefato de texto que precisa ser aprovado explicitamente antes da próxima:

```
1. DIAGNÓSTICO       -> investigar o código REAL, nunca por suposição
2. MODELO DE NEGÓCIO  -> só quando o ciclo envolve decisão de produto real
                         (nem todo ciclo precisa desta etapa separada)
3. PLANO TÉCNICO      -> modelo de dados, fluxos, arquivos, testes, riscos
4. APROVAÇÃO          -> o humano aprova ou pede ajuste — Claude nunca avança sozinho
5. IMPLEMENTAÇÃO      -> só depois da aprovação explícita
6. TESTES             -> suite completa + testes novos dedicados
7. VALIDAÇÃO          -> lint, typecheck, build, HTTP real, mobile
8. RELATÓRIO FINAL    -> arquivos alterados, resultados, desvios, o que NÃO mudou
```

**Regra de ouro**: Claude nunca pula da etapa 1 direto para a 5. Mesmo quando o pedido "parece simples", o diagnóstico e o plano vêm antes do código — sem exceção, a menos que o humano explicitamente autorize pular (e mesmo assim, Claude deve confirmar o que está pulando).

**Quando a etapa 2 (Modelo de Negócio) é necessária**: só quando o ciclo envolve uma decisão de produto genuína, com alternativas reais (ex.: como calcular preço sugerido). Ciclos que só materializam algo já decidido (ex.: Ciclo F, Termo de Recepção, uma vez que "usar o mecanismo de aceite já existente" já estava definido) podem ir direto de Diagnóstico para Plano Técnico.

---

## 2. Regra fundamental: Claude nunca escolhe modelo de negócio sozinho

Quando existe mais de uma forma legítima de resolver um problema de produto (ex.: como calcular margem, o que fica visível ao cliente, quando um gate deve bloquear), Claude:
- Apresenta as alternativas, com prós/contras de cada uma, contra os critérios que o humano definiu.
- Recomenda uma, com justificativa objetiva — mas a decisão final é sempre do humano.
- Nunca implementa a alternativa "mais sofisticada" por padrão — a prioridade declarada do projeto é sempre simplicidade operacional antes de completude técnica.

Se durante a investigação Claude achar necessário reabrir uma decisão já tomada (ex.: um gate já aprovado), ele **para e explica o conflito**, mostrando a evidência no código — nunca resolve por conta própria.

---

## 3. Princípios arquiteturais já provados (não reabrir sem decisão explícita)

Estes princípios já se repetiram, com sucesso, em Ciclos D, E, F, G e H — são tratados como **decisões de arquitetura estáveis**, não hipóteses a testar de novo a cada ciclo.

### 3.1 Congelamento por cópia, nunca por referência viva
Todo ponto de aprovação/uso (orçamento → OS, catálogo → item, checklist → instância, recepção → Termo) **copia** o dado no momento do uso, e nunca mais relê a fonte depois disso. Editar o cadastro depois nunca reescreve um documento/histórico já criado. Este é o princípio mais repetido do projeto — aplicado em preço (`QuoteItem`/`WorkOrderItem`), checklists (`WorkOrderChecklist`), e no Termo de Recepção (`receptionChecklistSnapshot`).

### 3.2 Configuração é sempre livremente editável; a integridade vem do congelamento, não de travar o cadastro
Serviços, Checklists, Procedimentos podem ser editados/inativados a qualquer momento — a proteção histórica nunca vem de impedir a edição do cadastro, sempre vem do princípio 3.1 (o que já foi congelado não lê mais o cadastro).

### 3.3 Status da máquina de estados ≠ etapa conceitual do Método BOX 02
O status técnico da OS (`ABERTA`, `EM_EXECUCAO` etc.) e a etapa do Método (`IDENTIFICAMOS`, `EXECUTAMOS` etc.) são coisas diferentes, mapeadas por uma função pura, nunca tratadas como sinônimos. Algumas etapas do Método (`REGISTRAMOS`, `EXPLICAMOS`, `ORÇAMOS`) **não têm** status próprio — aparecem sempre, mostrando o que existe ou "não aplicável", nunca "acendem" por causa de transição de estado.

### 3.4 Barreiras internas não viram etapas novas
`VERIFICAMOS` é uma barreira entre `EXECUTAMOS` e `ENTREGAMOS` — nunca tratada como uma 8ª etapa numerada. O mesmo cuidado se aplica a qualquer futura barreira: representar como selo/condição, não inflar a sequência oficial do Método.

### 3.5 Write-once só quando o domínio pede formalmente
Nem toda edição precisa ser write-once — o Termo de Recepção é (envolve aceite formal do cliente); EXPLICAMOS/registro técnico da entrega não são (são registro interno, editável livremente). Write-once é decisão caso a caso, nunca padrão automático.

### 3.6 Gates nunca são enfraquecidos silenciosamente
Qualquer gate já aprovado (aceite de recepção bloqueando `EM_EXECUCAO`, checklist de entrega bloqueando `ENTREGUE`) é tratado como protegido — mudanças em ciclos novos incluem testes de regressão explícitos confirmando que o gate continua intacto, não só "não deveria ter mudado".

### 3.7 Bloqueio antecipado na UI nunca substitui a validação do servidor
Quando a interface antecipa um bloqueio (mostrar um botão desabilitado antes do clique), ela sempre **lê o mesmo dado** que o servidor usaria para decidir — nunca reimplementa a regra em paralelo no cliente, para nunca divergir.

### 3.8 Peças já existentes e nunca usadas são achados, não lacunas a inventar
Antes de criar campo/coluna nova, Claude verifica se já existe algo pronto e não aproveitado (ex.: `technicalNotes`, que existia havia ciclos sem nenhum caller real, reaproveitado no Ciclo G sem migração nova).

### 3.9 Nenhum dado é inferido silenciosamente
Quando falta um dado (ex.: custo de um serviço), o sistema nunca inventa um valor a partir de outro campo (ex.: nunca inferir custo a partir do preço praticado) — fica em branco/opcional até alguém informar de verdade.

---

## 4. Como Claude deve investigar (nunca por suposição)

- Ler o código real (schema, repositórios, serviços) antes de responder qualquer pergunta sobre "o que já existe".
- Nunca presumir que algo existe porque apareceu em documentação anterior, nem presumir que não existe porque não foi mencionado.
- Buscar em todo o `src/` antes de declarar um campo "morto" ou "nunca usado" — declarações desse tipo exigem grep completo, não memória.
- Se encontrar uma imprecisão na própria fala anterior (ex.: dizer que uma função tinha um comportamento que na verdade pertence a outra), corrigir explicitamente, por transparência — mesmo que isso não mude nenhuma decisão.

---

## 5. Como Claude deve validar antes de reportar concluído

Rigor mínimo, repetido em todos os ciclos desde D:
1. Baseline da suíte de testes **antes** de qualquer alteração.
2. Suíte completa **3 vezes consecutivas** depois da implementação.
3. Lint, typecheck, build limpos.
4. Testes novos dedicados ao ciclo, cobrindo especificamente as regras de negócio decididas.
5. Validação HTTP real contra um servidor rodando de verdade (não só testes unitários) — incluindo cenários específicos pedidos (ex.: uma OS PRONTA, uma ENTREGUE).
6. Confirmação de mobile (viewport, conteúdo renderizado).
7. Confirmação explícita de que nada fora do escopo foi alterado — regra especialmente aplicada a gates e comportamentos de ciclos anteriores.
8. Banco de desenvolvimento limpo ao final (sem dados de teste residuais, preservando seed real e dados de demonstração intencionais).
9. Atualização do `PAINEL_PROJETO_BOX02.md` (documento vivo) e do README ao final de cada ciclo concluído.

### 5.1 Limite honesto do que "validado" significa
Claude relata fielmente o que rodou no próprio ambiente (testes, HTTP, mobile) — mas esses resultados são **relato do executor**, não algo que o pacote de código sozinho comprova de forma independente para quem só lê o `.tar.gz` depois. O que o pacote comprova por leitura direta é: implementação, arquitetura, e os testes escritos (o código dos testes, não a garantia de que rodaram exatamente como descrito). Claude deve manter essa distinção clara em todo relatório final, sem inflar a confiabilidade do que é só relato.

---

## 6. Formato dos relatórios finais

Todo ciclo concluído recebe um relatório com, no mínimo: arquivos criados/alterados, se houve mudança de schema/banco, funcionalidades que passaram a existir, contagem de testes (antes/depois/resultado), typecheck/lint/build, cenários HTTP realmente validados, confirmação mobile, confirmação de regressão dos ciclos anteriores, desvios entre o plano e a implementação (se houver), confirmação explícita do que ficou fora do escopo, e o estado final (concluído/não concluído) — nunca só "funcionou".

---

## 7. O que Claude nunca faz sem autorização explícita

- Iniciar o próximo ciclo automaticamente depois de um relatório aprovado.
- Escolher modelo de negócio, fórmula, ou regra de produto por conta própria quando há alternativas legítimas.
- "Aproveitar a oportunidade" para refatorar algo fora do escopo pedido.
- Enfraquecer, contornar ou reinterpretar um gate/regra já aprovado sem sinalizar o conflito primeiro.
- Presumir urgência de frentes explicitamente adiadas (Financeiro, CRM, PDF, integrações pagas) — essas só entram em escopo quando o humano abrir o ciclo correspondente.

---

## 8. Como este documento evolui

Assim como o Painel do Projeto, este é um documento vivo — mas atualizado com menos frequência: só quando um novo princípio arquitetural genuinamente novo se prova estável (repetido com sucesso em pelo menos um ciclo), ou quando a sequência de governança em si muda por decisão explícita do humano. Não é reescrito a cada ciclo — é o Painel do Projeto que registra o dia a dia; este documento registra só o que já virou regra.
