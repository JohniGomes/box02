# Oficina OS

Sistema de gestão para oficina mecânica — Anápolis/GO (Carlim e Mateus).

Este README cobre o que existe **hoje** (Ciclo 1 — Fundação). Para o plano completo do projeto, ver `OFICINA_OS_ESPECIFICACAO.md`, `DEV_PLAN.md` e `DECISIONS.md` na raiz do repositório de documentação do projeto (fora desta pasta de código).

## O que o Ciclo 1 entrega

- Login com e-mail e senha (Auth.js / NextAuth v5, credenciais com hash bcrypt).
- Modelo de usuários, papéis e permissões (só o papel `ADMINISTRADOR` está ativo neste ciclo).
- Log de auditoria de login e criação de usuário.
- Layout mobile-first (navegação inferior em celular/tablet, lateral em desktop) e PWA instalável.

## O que o Ciclo 2 acrescenta

- Módulo completo de **Clientes** (PF e PJ): criar, editar, inativar/reativar (sem apagar), buscar e filtrar, ficha completa.
- Validação real de CPF/CNPJ (algoritmo de dígito verificador, não regex superficial) e normalização de telefone/documento.
- Bloqueio de duplicidade por CPF/CNPJ quando informado (ver `DECISIONS.md`/análise do Ciclo 2 sobre por que não há bloqueio automático sem documento).
- Formulário em etapas mobile-first (Identificação → Contato → Endereço → Observações), listagem responsiva (cards no celular, tabela no desktop), busca com debounce, links diretos `tel:`/WhatsApp.

## O que o Ciclo 3 acrescenta

- Módulo completo de **Veículos**, sempre vinculado a um cliente (`customerId` obrigatório).
- Placa opcional (nem todo cadastro prévio tem placa disponível) mas normalizada e validada nos dois formatos brasileiros (antigo `ABC1234` e Mercosul `ABC1D23`); busca por placa funciona com ou sem máscara.
- **Transferência de veículo entre clientes**: atualiza o proprietário atual e registra a transferência em `audit_logs` (não há tabela extra de histórico de propriedade — decisão registrada em `prisma/schema.prisma`).
- Inativação sem apagar (mesmo padrão do Ciclo 2).
- Ficha do cliente **atualizada**: a seção "Veículos" agora lista os veículos reais (substitui o placeholder do Ciclo 2). Ficha do veículo linka de volta para o cliente.
- Seletor de cliente por busca com debounce, reutilizado no cadastro e na transferência.

**Ainda não há**: orçamentos, OS (chegam nos próximos ciclos — a ficha do veículo já tem os pontos de integração preparados como placeholders).

## O que o Ciclo 4 / Sub-etapa 1 acrescenta

- Módulo de **Orçamento interno** (sem link público ainda — isso é a Sub-etapa 2): criar, editar (só em `RASCUNHO`), enviar, versionar, cancelar.
- **Modelo em duas camadas**: `quotes` (o processo) e `quote_versions` (o conteúdo, congelado assim que sai de `RASCUNHO`) — qualquer alteração depois disso cria uma nova versão, nunca sobrescreve.
- Itens do orçamento (`quote_items`) com `type` (Serviço/Peça/Mão de obra), preparados para vínculo opcional futuro com catálogo (`catalogItemType`/`catalogItemId`, sem FK ainda).
- Todo cálculo monetário em **centavos** (`src/lib/money`), evitando erro de arredondamento.
- Numeração do orçamento (`ORC-2026-000001`) isolada em `src/lib/quotes/numbering.ts` — implementação provisória e trocável, pendente da decisão D3.
- Validade padrão configurável via tabela `app_settings` (chave/valor), sem hardcode — hoje 7 dias, alterável sem redeploy.
- Expiração calculada **sob demanda** (sem job agendado): ao abrir/listar um orçamento vencido, o sistema reconhece e grava `EXPIRADO` naquele momento.
- Utilitário `src/lib/dateOnly.ts` para lidar corretamente com datas "só dia" (ex.: validade) em fuso horário local — evita o orçamento mostrar o dia errado.

**Ainda não há**: link público de aprovação, decisão do cliente, indicadores (chegam nas Sub-etapas 2 e 3 do Ciclo 4).

## O que o Ciclo 4 / Sub-etapa 2 acrescenta

- **Link público de aprovação** (`/orcamento/[token]`, fora do `/dashboard`, sem login): cliente vê os itens, aprova/recusa item a item (ou usa "Aprovar todos"/"Recusar todos"), confirma com nome (documento opcional).
- Token gerado com `crypto.randomBytes(32)` (256 bits) — nunca sequencial ou previsível.
- Aprovação parcial: versão vira `APROVADO_PARCIAL` quando há pelo menos um item aprovado e um recusado; `APROVADO`/`RECUSADO` nos casos totais. Nenhuma decisão é aceita com item pendente.
- **Segurança contra reenvio/concorrência**: a submissão trava a linha da versão (`SELECT ... FOR UPDATE`) — duas submissões simultâneas nunca aplicam a decisão duas vezes; a segunda é rejeitada vendo o status já alterado pela primeira.
- Criar nova versão revoga automaticamente o link da versão anterior — quem acessa um link desatualizado vê aviso claro, não erro genérico nem a proposta antiga.
- Estados tratados na página pública: pendente, já decidido (somente leitura), expirado, revogado, cancelado, token inexistente — cada um com mensagem própria, nunca expondo dado de outro orçamento.
- Ficha do orçamento (lado da oficina) agora mostra o link ativo (copiável) e o resultado da decisão quando já houver.
- **Regra de negócio documentada formalmente** (aprovada nesta etapa): acréscimo incide sobre o valor já com desconto aplicado — comentário no código (`src/lib/money/index.ts`) marcando que essa ordem deve se manter consistente em OS, faturamento e indicadores futuros.

**Ainda não há**: indicadores (Sub-etapa 3), catálogo de serviços/peças, estoque, OS, integração automática com WhatsApp/e-mail (arquitetura já preparada via enum `channel`, sem implementação).

## Ciclo 5 — Ordem de Serviço (Sub-etapa 1: OS básica)

- OS nasce **só no check-in físico** (D-OS-1) — nunca criada automaticamente por um orçamento aprovado.
- **Rastreabilidade no nível do item**, não por versionamento da OS inteira: cada `work_order_item` carrega `origin` (do orçamento / adicional durante execução — Sub-etapa 2 / sem orçamento) e `status` (planejado / executado / cancelado), nunca apagado fisicamente.
- Conversão de orçamento aprovado (total ou parcial) — só itens `APROVADO` viram itens da OS; recusados nunca entram; o orçamento original nunca é alterado.
- OS direta sem orçamento (cliente + veículo + check-in + itens digitados manualmente).
- Snapshots congelados no check-in (nome do cliente, placa/descrição do veículo, quilometragem) — edições posteriores no cadastro não afetam a OS já criada.
- D-OS-6: `vehicles.mileage` só sobe, nunca desce, por causa de uma OS.
- Máquina de estados completa (`ABERTA` → ... → `ENTREGUE`/`CANCELADA`), validada no servidor, não só escondida na interface.
- Fechamento bloqueia com item `PLANEJADO` pendente; total conta só itens `EXECUTADO`; **EXECUTADO não significa PAGO** (isso é do futuro módulo Financeiro).
- Aceite na entrega: nome obrigatório, CPF opcional mas validado quando informado, data/hora e usuário automáticos.
- Numeração contínua (`OS-000001`), reaproveitando a mesma infraestrutura de contador atômico do orçamento.

**Conscientemente fora desta sub-etapa** (por decisão explícita, não esquecimento): módulo de Atendimento/Avaliação, itens adicionais durante a execução, reabertura de OS fechada, fotos, geração de PDF, notificações, WhatsApp Business API, módulo Financeiro.

## Ciclo 5 — Ordem de Serviço (Sub-etapa 2: Adicionais durante a execução)

- Registrar item adicional identificado durante a execução (`origin = ADICIONAL_DURANTE_EXECUCAO`), com `createdByUserId` rastreando quem identificou.
- **AD-4 (bloqueio rígido)**: nenhum adicional pode ser marcado `EXECUTADO` sem `clientDecision = APROVADO` — validado no servidor, sem exceção para nenhum perfil.
- Três canais de autorização: `PRESENCIAL`, `TELEFONE` (registro direto) e `LINK` (página pública própria do item, sem login).
- **AD-2**: um item, um link — nunca compartilhado entre adicionais. **AD-3**: validade fixa de 48h.
- Botão "Enviar pelo WhatsApp" (`wa.me` com mensagem pré-preenchida) — mesmo princípio digital-first do orçamento, sem API paga.
- **AD-6 "Ajustar valor/escopo"**: cancela o item anterior e cria um novo atomicamente (`supersedesItemId`) — nunca edita um item já enviado em memória (Cenários 5 e 7 da especificação).
- **Correção de concorrência**: `setWorkOrderItemStatusService` agora usa trava de linha (`FOR UPDATE`), corrigindo um risco identificado na Sub-etapa 1.
- Rota pública `/os-item/[token]`, mesmo padrão de segurança do orçamento (token de 256 bits, trava de linha contra dupla submissão/concorrência).

**Conscientemente fora desta sub-etapa**: bundle de múltiplos adicionais num único link, reabertura de OS, fotos, PDF, notificações automáticas, WhatsApp Business API, módulo Financeiro, módulo de Atendimento/Avaliação.

## Execução Operacional — Ciclo A: Biblioteca de Serviços

- Catálogo de serviços reutilizável (`Configurações → Serviços`): nome, categoria (texto livre), preço padrão opcional, status `ATIVO`/`INATIVO`.
- Inativar nunca apaga fisicamente; reativar restaura a mesma linha, nunca duplica.
- Sem código/SKU (EX-1), sem categoria como entidade própria, sem procedimento/checklist ainda — escopo estritamente restrito ao cadastro.
- **Decisão arquitetural registrada para o Ciclo B** (não implementada aqui): a integração com `quote_items`/`work_order_items` vai usar uma coluna nova `serviceId` (FK direta), preservando `catalogItemType`/`catalogItemId` para o propósito polimórfico original (inclusive um eventual catálogo de peças) — ver `EXECUCAO_SERVICOS_CHECKLIST_ESPECIFICACAO.md`.
- Nenhuma coluna nova em `quote_items`/`work_order_items` neste ciclo — confirmado por teste automatizado dedicado.

**Conscientemente fora deste ciclo**: qualquer integração com orçamento, OS ou adicionais; procedimentos; checklists.

## Orçamento em Três Camadas — Ciclo C1

**Nota de transparência sobre a execução deste ciclo**: ao começar a implementação, a suíte de testes já estava com **57 testes falhando na baseline** (antes de qualquer alteração minha nesta execução). Investigação mostrou que boa parte do código de produção deste ciclo (schema, migração 0010, repositório, validação, `itemsForTotals`, `submitPublicQuoteDecisionService`, filtro de conversão em OS, e a UI em 3 seções) **já tinha sido implementada numa tentativa anterior**, mas os testes já existentes não tinham sido atualizados para o novo campo obrigatório `category`, e a bateria de testes dedicada ao ciclo ainda não existia. Conferi esse código já existente linha por linha contra o plano técnico aprovado antes de prosseguir — bateu exatamente — e completei o trabalho (correção dos fixtures de teste, bateria dedicada, validação HTTP/mobile) em vez de reimplementar do zero. Isso está registrado aqui para que o histórico do projeto reflita com precisão o que já existia antes desta execução específica.

- `quote_items.category` (`NECESSARIO`/`RECOMENDADO`/`INFORMATIVO`), obrigatório, congelado por versão do mesmo jeito que descrição/preço.
- **INFORMATIVO**: pode ter valor estimado (exibido separadamente, rotulado "não cobrado"), nunca soma ao `totalCents` da versão, nunca exige decisão do cliente, nunca pode ser aprovado (bloqueado no servidor mesmo por chamada direta ao serviço), nunca vira item de OS (defesa em profundidade no filtro de conversão, além do fato de nunca ter `clientDecision = APROVADO`).
- Aprovação parcial/total considera só itens NECESSÁRIO/RECOMENDADO — informativo nunca entra na exigência "todo item precisa de decisão".
- Indicadores (valor total orçado, aprovado, recusado, ticket médio) excluem informativo automaticamente, sem lógica nova além do ajuste do cálculo de total.
- Reclassificar um item depois de enviado exige nova versão — mesmo mecanismo de versionamento já usado para preço/descrição desde o Ciclo 4.

**Conscientemente fora deste ciclo**: categoria em adicionais/`work_order_items` (Ciclo B intocado), PDF do orçamento, Termo de Recepção, Entrega Técnica, checklists.

## Execução Operacional — Ciclo D: Checklists e Procedimentos

- `Procedure` e `Checklist` (com `ChecklistItem`), `code` obrigatório e único em ambos (POP-XXX/CHK-XXX) — rastreabilidade e identificação, decisão explícita deste ciclo.
- `services.procedureId`/`executionChecklistId` (nullable) — associação opcional, sem afetar nada do que já funcionava.
- **Regra de negócio central**: checklist tipo `ENTRADA`/`ENTREGA` — no máximo um `ATIVO` por vez, validada no servidor (`ActiveChecklistOfTypeAlreadyExistsError`). Tipo `EXECUCAO` não tem essa exclusividade.
- Checklist/Procedimento são **configuração livremente revisável** — nunca apagados fisicamente, só inativados/reativados. A garantia de que uma OS nunca vai depender do conteúdo *atual* do cadastro fica para o Ciclo E, que vai **copiar** (nunca referenciar) o conteúdo no momento do uso — mesmo princípio de congelamento já usado 3x no projeto.
- `Configurações` ganhou página-índice (`/dashboard/configuracoes`) com links para Serviços/Checklists/Procedimentos.
- **Carga inicial (seed)**: `npx tsx scripts/seed-checklists-procedures.ts` — cria CHK-001 (Checklist de Entrada, 7 itens), CHK-006 (Checklist de Entrega, 11 itens) e POP-001 a POP-005 (código + título + etapa do Método, sem passos técnicos — o briefing não forneceu esse conteúdo para nenhum POP). Idempotente, roda manualmente após a migração. **CHK-002 a CHK-005** do briefing não foram semeados — sem conteúdo de itens fornecido e sem mapeamento limpo no enum de 3 tipos atual; registrado como gap para decisão futura.
- **Pendência futura registrada, não implementada**: Precificação e Custos (mão de obra, horas, custo/hora, margem, preço sugerido vs. praticado) — vai conversar com o módulo Financeiro e pró-labore dos sócios quando for retomada.

**Conscientemente fora deste ciclo**: `work_orders`/`work_order_items`, execução dos checklists, Termo de Recepção, Entrega Técnica, evidências/fotos, precificação e custos, financeiro/pró-labore, CRM/captação.

## Ciclo J — Evidências/Fotos

- `WorkOrderEvidence` (migração `0017`): `type` (`GERAL`/`AVARIA`, DEC-J3/J7), `description` livre complementar, `storageKey`/`mimeType`/`fileSize`, `createdByUserId`/`createdAt` automáticos. Vinculada só à OS (DEC-J4) — sem FK pra item/serviço.
- **Armazenamento**: Cloudflare R2, compatível com S3 (DEC-J2b) — desacoplado da decisão de hospedagem de produção (DEC-J2a; `D8` segue pendente, à parte). **Conectividade com o R2 nunca foi verificada, nem neste ambiente de desenvolvimento nem em produção** — confirmado por teste real (certificado TLS emitido pelo próprio proxy de egress da Anthropic, `x-deny-reason: host_not_allowed`), não presumido. Módulo `src/lib/storage/r2.ts` com interface `StorageClient` injetável, para a lógica de negócio ser testável sem depender de credencial real.
- **Acesso só interno** (DEC-J6) — nenhuma URL pública do R2 é gerada; a aplicação sempre busca o arquivo no servidor (rota `/dashboard/os/[id]/evidence/[evidenceId]`, autenticação obrigatória) antes de servir pro navegador.
- **Mutabilidade** (DEC-J5): livre (criar/excluir) enquanto `receptionAcceptedAt` da OS for nulo; depois do aceite, evidências existentes ficam imutáveis — **adicionar continua sempre permitido**. Reaproveita o campo já existente do Ciclo F, mesmo padrão de gate já usado em `updateWorkOrderReceptionInfoService` — nenhuma coluna nova para a trava. Substituição = excluir + criar (sem função de update).
- Formato/tamanho confirmados: JPEG/PNG/HEIC, até 10MB.
- Auditoria: `WORK_ORDER_EVIDENCE_CREATED`, `WORK_ORDER_EVIDENCE_DELETED`.
- Nenhuma alteração em `CHK-001`/`CHK-004` (o checkbox "Fotos de entrada realizadas" continua existindo, sem sincronização automática com o upload real — decisão explícita), Método BOX 02, gates, máquina de estados, ou qualquer comportamento dos ciclos anteriores.
- **Pendência explícita para quando a implementação for testada em ambiente real**: configurar `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` e validar upload/leitura de verdade contra um bucket real — isso nunca aconteceu até agora.

## Ciclo I — Recebimentos (Financeiro mínimo)

- **Achado no início da implementação**: a migração `0016_work_order_payments`, o modelo `WorkOrderPayment`/enum `WorkOrderPaymentMethod`, o repositório, a validação, os erros de domínio, as funções de serviço (`getWorkOrderPaymentsSummaryService`/`registerWorkOrderPaymentService`), a Server Action e o componente de UI **já existiam no repositório e já estavam integrados na ficha da OS** quando esta etapa começou — resultado de uma sessão anterior interrompida antes de testes/validação/relatório. Tudo foi auditado, campo por campo, contra o plano técnico aprovado (H3 do Ciclo I) antes de prosseguir — bateu exatamente, sem nenhum desvio. Só os testes automatizados e a validação estavam genuinamente faltando.
- **Modelo B aprovado** (DEC-I1): lançamentos financeiros 1:N vinculados à OS (`WorkOrderPayment`), permitindo múltiplos recebimentos parciais.
- **Obrigação nasce só no fechamento** (DEC-I2, `ENTREGUE`) — orçamento aprovado e criação de OS nunca geram lançamento.
- **Só receitas neste ciclo** (DEC-I3) — sem contas a pagar, despesas, caixa ou conciliação.
- **Pagamento parcial e múltiplas formas permitidos** (DEC-I4) — `DINHEIRO`/`PIX`/`CARTAO`/`OUTRO` (DEC-I5), lista fixa.
- **Sem estorno/reembolso** (DEC-I6) — `WorkOrderPayment` é write-once por natureza (repositório só expõe `create`/`list`/`sum`, nunca `update`/`delete`).
- **Sem margem real por venda neste ciclo** (DEC-I7).
- **Valor devido nunca duplicado**: sempre lido de `WorkOrderClosure.totalAtClosureCents` (o fechamento mais recente) — o mesmo snapshot já criado desde o Ciclo 5, agora com seu primeiro uso real. Valor recebido e saldo são sempre **calculados** (`SUM`/subtração), nunca armazenados.
- **Rejeita lançamento acima do saldo restante** (DEC-I8), validado dentro de transação com lock — dois lançamentos simultâneos nunca ultrapassam o saldo juntos.
- **Seção dentro da própria ficha da OS** (DEC-I9), sem rota separada — visível só quando `ENTREGUE`.
- Custo, markup e qualquer dado de precificação interna **nunca aparecem** nesta seção nem em nenhum lugar do fluxo de recebimento — confirmado por validação HTTP real (busca precisa no HTML).
- Auditoria: `WORK_ORDER_PAYMENT_REGISTERED`.
- Nenhuma alteração em `Quote`, `QuoteItem`, `WorkOrderItem`, `Service`, gates, máquina de estados ou qualquer comportamento dos ciclos anteriores.

## Ciclo H — Precificação e Custos

- `Service.costCents` (nullable, migração `0015`) — custo interno estimado, nunca inferido de `defaultPriceCents` ou de qualquer outro campo.
- `app_settings["pricing_default_markup_percent"]` — markup padrão da oficina, reaproveitando a tabela genérica e o módulo `src/lib/settings/service.ts` já existentes. **Nasce sem valor configurado** — nenhum percentual inventado, nenhum seed em migração (decisão explícita H4-D4). Enquanto não configurado, `getDefaultMarkupPercent()` retorna `null`, nunca um fallback numérico.
- **Precedência do preço sugerido** (`src/lib/services/pricing.ts`, funções puras): `defaultPriceCents` (manual) vence sobre calculado por custo+markup; sem nenhum dos dois, sem sugestão — mesmo comportamento "Variável" de antes deste ciclo.
- **Terminologia separada, nunca tratada como sinônimo**: custo, markup padrão, preço calculado, preço sugerido, preço praticado, margem estimada. Preço sugerido usa **markup sobre custo**; margem estimada (indicador, nunca armazenada) usa **margem sobre venda** — convenções diferentes, propositalmente, conforme H4-D2.
- Custo/markup/preço calculado **nunca são gravados** em `QuoteItem`/`WorkOrderItem` — só o preço praticado, exatamente como já era antes deste ciclo. Confirmado por teste dedicado e por validação HTTP real que nenhuma rota voltada ao cliente (ficha da OS, Termo de Recepção, Entrega Técnica) exibe custo ou markup.
- Tela nova `/dashboard/configuracoes/precificacao` (markup padrão) e campo de custo nas telas já existentes de cadastro de serviço, claramente marcado como interno.
- `ServicePickerButton` e os 3 formulários que o usam (orçamento, OS direta, adicionais) agora pré-preenchem com o preço sugerido (com a fonte visível), em vez do `defaultPriceCents` bruto — sempre editável livremente antes de salvar, como já era.
- Auditoria: `SERVICE_UPDATED` (já existente) cobre alteração de custo; `PRICING_DEFAULT_MARKUP_UPDATED` é novo, para a configuração de markup.
- Nenhuma mudança em máquina de estados, gates, congelamento de orçamento/OS, Termo de Recepção, Entrega Técnica, ou qualquer comportamento dos Ciclos D-G.

**Pendências futuras seguem registradas**: hora técnica/apontamento de horas (explicitamente descartado por ora), Financeiro, CRM, permissões granulares (custo/markup hoje editável por qualquer usuário logado, como todo o resto do sistema), identidade visual BOX 02 nas telas, evidências/fotos.

## Ciclo G — Entrega Técnica

- Reaproveita `WorkOrder.technicalNotes` (já existia, nunca era usado por nenhum caller nem exibido) — **sem migração, sem coluna nova**. Registra "situação final do veículo e orientações pós-serviço".
- Edição livre a partir de `PRONTA`, continua editável depois de `ENTREGUE` — sem gate, sem write-once, isolada (nunca chamada de dentro de `closeWorkOrderService`/`setWorkOrderStatusService`).
- **Rota `/dashboard/os/[id]/entrega-tecnica`**, só leitura: cliente, veículo, placa, diagnóstico, itens `EXECUTADO` (nunca `PLANEJADO`/`CANCELADO`), adicionais executados, checklist de entrega com estado real, `technicalNotes`, e — só se `ENTREGUE` — data/hora, quem recebeu, documento, responsável interno (resolvido via `findUserById`, já existente). **Nenhum valor monetário** aparece nesta rota, por decisão explícita (DEC-G1).
- Botão "Enviar por WhatsApp" reaproveita exatamente o mecanismo `wa.me` já usado em Adicionais — sem API paga, sem SDK, sem envio automático.
- Impressão via `print:hidden`/`print:gap-3`, mesmo padrão do Termo de Recepção — sem PDF.
- Auditoria: `WORK_ORDER_TECHNICAL_NOTES_UPDATED`.
- Nenhuma mudança em máquina de estados, gates (checklist de entrega, aceite de recepção), Termo de Recepção, snapshots, diagnóstico, itens, adicionais, preços ou `totalCents` — confirmado por regressão explícita nos testes e por validação HTTP real (o gate `WorkOrderHasPendingItemsError` disparou organicamente durante a validação, confirmando que segue intacto).

## Materialização visual do Método BOX 02 na ficha da OS

- `WorkOrder.diagnosisExplanationNotes` (migração `0014`) — registro de EXPLICAMOS independente de orçamento, livre, sem gate, sem write-once (diferente do Termo de Recepção de propósito).
- Sequência fixa das 7 etapas oficiais (`IDENTIFICAMOS → DIAGNOSTICAMOS → REGISTRAMOS → EXPLICAMOS → ORÇAMOS → EXECUTAMOS → ENTREGAMOS`) sempre visível na ficha da OS, via `MethodStepper` — nunca some, mesmo quando uma etapa não é aplicável àquela OS (ex.: ORÇAMOS mostra "Não aplicável" numa OS sem orçamento).
- **Status ≠ etapa**: `workOrderStatusToActiveMethodStage` mapeia só as 4 etapas com correspondência direta com status (`ABERTA→Identificamos`, `EM_DIAGNOSTICO→Diagnosticamos`, `EM_EXECUCAO/AGUARDANDO_PECA/TESTE_FINAL/PRONTA→Executamos`, `ENTREGUE→Entregamos`, `CANCELADA→nenhuma`). Registramos/Explicamos/Orçamos nunca "acendem" por status.
- **VERIFICAMOS** nunca é uma 8ª etapa — é um selo/barreira exibido só quando `status = PRONTA`, entre Executamos e Entregamos.
- REGISTRAMOS reaproveita só o que já existe (item "Fotos de entrada realizadas" do CHK-001 + link ao Termo de Recepção) — nenhuma funcionalidade de fotos criada.
- ORÇAMOS: link ao orçamento de origem (`sourceQuoteVersionId`) quando existir; "Não aplicável" quando não existir — nunca desaparece da sequência.
- **Bloqueio antecipado (antes do clique)**: os botões de avançar para `EM_EXECUCAO` e de fechar a OS agora leem o mesmo dado que o servidor usa (aceite de recepção existe? checklist de entrega tem pendência?) e vêm desabilitados com o motivo visível — a validação definitiva continua exclusivamente no servidor, usando as regras já existentes dos Ciclos E/F (nunca duplicadas no cliente).
- Listagem de OS mostra badge "Aceite pendente" quando aplicável.
- Seções "Itens do orçamento/OS" e "Adicionais" agora são recolhíveis (`CollapsibleSection`, wrapper puramente visual) — reduz rolagem em OS longas sem tocar nenhum componente interno já testado.
- Nenhuma mudança em `diagnosis`, `customerComplaint`, itens, preços, checklists, gates ou congelamento já aprovados nos Ciclos D/E/F.

## Execução Operacional — Ciclo F: Termo de Recepção

- 8 colunas novas em `WorkOrder` (nenhuma tabela nova): `preExistingDamagesDescription` (livre até o aceite), 4 campos de aceite (`receptionAcceptedName`/`Document`/`At`, `receivedByUserId` — independente de `createdByUserId`), e 3 campos de congelamento (`receptionComplaintSnapshot`, `receptionDamagesSnapshot`, `receptionChecklistSnapshot` — JSON autossuficiente do CHK-001 no momento do aceite: código, nome, e cada item com descrição/obrigatoriedade/ordem/estado marcado).
- **Snapshot do CHK-001**: uma única coluna JSON, não uma tabela relacional — decisão justificada por ser dado só de leitura depois de escrito, sem necessidade de consulta agregada. Nunca relido de `work_order_checklists`/`work_order_checklist_items` depois de gravado; a instância operacional do checklist continua funcionando normalmente e de forma totalmente desacoplada.
- **Aceite write-once**: uma vez registrado, nunca é reescrito — segunda tentativa é rejeitada (`WorkOrderReceptionAlreadyAcceptedError`). Correção futura ficaria para um fluxo próprio, não construído neste ciclo.
- **Gate (DEC-1)**: transição para `EM_EXECUCAO` exige aceite registrado. `EM_DIAGNOSTICO` e `CANCELADA` continuam livres, sem exigir aceite.
- **Rota `/dashboard/os/[id]/termo-recepcao`**: antes do aceite, prévia dinâmica (dados atuais, aviso de pendência); depois do aceite, documento histórico congelado (lê só dos snapshots, nunca dos campos "vivos"). Sem geração de PDF — só visualização digital/imprimível (`@media print`).
- Nenhuma alteração em `customerComplaint`, diagnóstico, itens, preços ou no fluxo de criação da OS.

**Pendências futuras seguem registradas**: Precificação e Custos, Financeiro/pró-labore, CRM/Captação, Evidências/Fotos, cópia da categoria do orçamento para a OS, CHK-002 a CHK-005.

**Conscientemente fora deste ciclo**: Entrega Técnica, geração de PDF, fluxo de correção de aceite já registrado.

## Execução Operacional — Ciclo E: Execução dos Checklists na OS

- `WorkOrderChecklist` + `WorkOrderChecklistItem` — instância **congelada por cópia** no momento do uso (código, nome, itens, obrigatoriedade). Nunca relê `checklists`/`checklist_items` depois de criada — editar o molde em Configurações não afeta nenhuma OS já em andamento ou já entregue.
- **Iniciar** é idempotente (get-or-create): ENTRADA/ENTREGA usam o checklist `ATIVO` desse tipo na oficina; EXECUÇÃO usa o `executionChecklistId` do serviço vinculado ao item. Serviço sem checklist associado continua funcionando exatamente como antes.
- Marcar/desmarcar item, finalizar checklist — sem novo status em `work_order_items` (sem `EM_EXECUCAO`, como já decidido).
- **Regra crítica (EX-2)**: fechamento da OS bloqueado só quando existe uma instância de checklist de **entrega** nesta OS com item obrigatório pendente. Ausência de instância nunca bloqueia. Implementado dentro da mesma transação já existente em `closeWorkOrderService`.
- **Bug encontrado e corrigido durante a validação**: o painel de checklist de entrega tinha sido condicionado a só aparecer com a OS ainda aberta — depois de `ENTREGUE`, o histórico desaparecia da tela. Corrigido: o painel agora sempre aparece quando existe uma instância, mostrando o estado congelado (checado/não checado) mesmo depois da entrega; só a edição é que passa a ficar bloqueada.
- Nenhuma alteração em diagnóstico, queixa, itens, preços ou snapshots já existentes da OS.

**Pendências futuras registradas, não implementadas**: Precificação e Custos (mão de obra, horas, custo/hora, margem, preço sugerido vs. praticado, serviços cujo preço considere custo de mão de obra, integração futura com Financeiro, pró-labore dos sócios); CRM/Captação de clientes; Evidências/Fotos; cópia da categoria do orçamento (NECESSÁRIO/RECOMENDADO/INFORMATIVO) para a OS.

**Conscientemente fora deste ciclo**: Termo de Recepção, Entrega Técnica, evidências/fotos, precificação/custos, financeiro/pró-labore, CRM/captação.

## Execução Operacional — Ciclo B: Integração da Biblioteca de Serviços

- `serviceId` nullable, FK direta para `services.id`, em `quote_items` e `work_order_items` (`ON DELETE SET NULL`). `catalogItemType`/`catalogItemId` permanecem intocados e reservados.
- **Regra crítica validada sempre no servidor**: todo `serviceId` referenciado precisa ser de um serviço `ATIVO` no momento da criação — nunca confia que a interface só ofereceu ativos para seleção.
- Seletor de serviço reutilizável (`ServicePickerButton`) integrado em 3 pontos: item de orçamento, item de OS sem orçamento, adicional durante execução. Seleção preenche descrição/preço, que continuam 100% editáveis.
- **Princípio central preservado e testado**: o catálogo é só sugestão/preenchimento — o item já criado é sempre a fonte congelada. Conversão de orçamento aprovado em OS nunca releem o catálogo, mesmo que o preço/descrição tenham mudado no meio do caminho (cenário crítico testado: R$150 → editado para R$170 → catálogo muda para R$200 → OS permanece R$170).
- Serviço inativado: item histórico permanece intacto; novo lançamento com ele é rejeitado; reativado volta a funcionar.

**Conscientemente fora deste ciclo**: checklists, procedimentos, fotos, diagnóstico estruturado, atendimento/avaliação, estoque, financeiro, WhatsApp Business API, CRM.

## O que o Ciclo 4 / Sub-etapa 3 acrescenta

- Serviço de leitura `getQuoteIndicatorsService` (`src/lib/quotes/indicators.ts`) — os 7 indicadores da proposta original, **sem nenhuma tela** (combinado explicitamente para esta sub-etapa).
- Todo indicador usa a **versão vigente** de cada orçamento (nunca soma versões antigas já substituídas).
- Orçamento `ENVIADO` com prazo vencido é tratado como efetivamente expirado no próprio cálculo (via `CASE` no SQL), mesmo que ninguém tenha acessado aquele orçamento específico ainda para gravar isso no banco — os indicadores nunca ficam desatualizados por depender da reconciliação sob demanda (K5) ter sido "disparada" em algum outro lugar.
- Regras de borda documentadas explicitamente no código: rascunho nunca enviado não conta em nenhum indicador de valor/conversão (só na contagem bruta); cancelamento após envio conta no valor total orçado mas nunca no aprovado; aprovação parcial soma corretamente por item, não por orçamento inteiro.

**Ainda não há**: nenhuma tela ou API expondo esses números — isso fica para quando um dashboard for pedido.

## Nota importante sobre o Prisma

O plano de stack usa Prisma como ORM. O código deste ciclo foi construído e testado dentro de um ambiente de sandbox cuja rede **bloqueia o download dos binários do Prisma Engine** (`binaries.prisma.sh`). Por isso:

- `prisma/schema.prisma` continua sendo a **fonte de verdade do modelo de dados**.
- A migração inicial (`prisma/migrations/0001_cycle1_auth_foundation/migration.sql`) foi **escrita manualmente**, em paridade exata com o schema, e aplicada via `psql` em vez de `prisma migrate dev`.
- A camada de acesso a dados (`src/lib/db/repositories/*`) usa o driver `pg` diretamente, em vez do Prisma Client gerado.

**Em uma máquina de desenvolvimento normal** (sem esse bloqueio de rede), isso não é necessário. Para migrar para o Prisma de verdade:
1. Rodar `npx prisma generate` (vai baixar o engine normalmente).
2. Rodar `npx prisma migrate dev` — o Prisma vai reconhecer a migração já aplicada ou você pode usar `prisma db pull` para conferir contra o banco existente.
3. Substituir as funções em `src/lib/db/repositories/*.ts` por chamadas ao Prisma Client (`import { prisma } from "@/lib/prisma"` etc.), mantendo a mesma assinatura de função para não precisar tocar em quem usa esses repositórios (`src/auth.ts`, `scripts/seed.ts`).

Isso é dívida técnica pequena e isolada — não afeta o schema, os testes de comportamento nem a estrutura das rotas.

## Como rodar localmente

### Pré-requisitos
- Node.js 20+
- PostgreSQL 14+ rodando localmente (ou acessível via `DATABASE_URL`)

### Passo a passo
```bash
npm install

# Crie o banco (ajuste usuário/senha conforme seu ambiente):
createdb oficina_os
createdb oficina_os_test   # usado pelos testes automatizados

# Configure o .env (copie e ajuste):
cp .env.example .env

# Aplique o schema no banco, usando o mecanismo de migração do projeto
# (tabela de controle "_migrations" — nunca reaplica uma migração já
# aplicada, para no primeiro erro sem continuar silenciosamente; ver
# scripts/migrate.ts). NÃO rode `psql -f` manualmente nas migrações
# depois de usar este mecanismo — misturar os dois quebra a garantia de
# "nunca reaplicar" (o script só sabe o que está registrado em
# "_migrations", não o estado real das tabelas).
npx tsx scripts/migrate.ts
DATABASE_URL="$DATABASE_URL_TEST" npx tsx scripts/migrate.ts

# Para só consultar o que já foi aplicado, sem aplicar nada:
#   npx tsx scripts/migrate.ts --status

# Popule os dois usuários iniciais (Carlim e Mateus):
npm run seed

# Carregue os checklists e procedimentos padrão da BOX 02 (CHK-001, CHK-006, POP-001 a POP-005):
npx tsx scripts/seed-checklists-procedures.ts

# Rode em desenvolvimento:
npm run dev
# App em http://localhost:3000 — vai redirecionar para /login
```

### Rodar os testes
```bash
npm run test
```
Os testes usam `oficina_os_test` (nunca o banco de desenvolvimento) e limpam as tabelas antes/depois de cada suíte.

### Build de produção
```bash
npm run build
npm run start
```

## O que precisa ser configurado antes de uso real (não apenas de teste)

- **Credenciais de Carlim e Mateus**: o `scripts/seed.ts` cria os dois usuários com **senha placeholder**, exibida no terminal ao rodar o seed. Troquem antes de qualquer uso real — não existe ainda uma tela de "alterar senha" (fica para um próximo ciclo, se vocês quiserem).
- **`AUTH_SECRET`**: o valor em `.env` é só para desenvolvimento. Gerar um novo secreto forte para produção (`npx auth secret` ou equivalente).
- **Banco de dados de produção**: hoje aponta para um Postgres local. Decisão de provedor (Neon/Supabase/Railway/outro) segue como D8 em `DECISIONS.md` — nenhuma escolha foi feita ainda.
- **Fuso horário**: `America/Sao_Paulo`, já confirmado por vocês (D11) e configurado em `.env` (`TZ`).

## Estrutura do projeto (estado atual)

```
src/
├── app/
│   ├── login/page.tsx        # Tela de login (mobile-first)
│   ├── dashboard/
│   │   ├── layout.tsx        # Shell autenticado (nav lateral/inferior)
│   │   ├── page.tsx          # Início
│   │   ├── clientes/
│   │   │   ├── page.tsx              # Listagem (busca/filtros/paginação)
│   │   │   ├── novo/page.tsx         # Cadastro (formulário em etapas)
│   │   │   ├── [id]/page.tsx         # Ficha completa (com veículos reais)
│   │   │   ├── [id]/editar/page.tsx  # Edição
│   │   │   ├── actions.ts            # Server Actions (create/update/inativar/reativar)
│   │   │   ├── CustomerForm.tsx      # Formulário compartilhado (criar/editar)
│   │   │   └── CustomerSearchBar.tsx # Busca com debounce
│   │   └── veiculos/
│   │       ├── page.tsx              # Listagem (busca/filtros/paginação)
│   │       ├── novo/page.tsx         # Cadastro (aceita ?customerId= pré-selecionado)
│   │       ├── [id]/page.tsx         # Ficha completa (link para o cliente)
│   │       ├── [id]/editar/page.tsx  # Edição
│   │       ├── [id]/VehicleActions.tsx # Inativar/reativar/transferir
│   │       ├── actions.ts            # Server Actions
│   │       ├── VehicleForm.tsx       # Formulário compartilhado (criar/editar)
│   │       ├── VehicleSearchBar.tsx  # Busca com debounce
│   │       └── CustomerPicker.tsx    # Seletor de cliente (busca com debounce)
│   └── api/auth/[...nextauth]/route.ts
├── auth.ts                    # Configuração do Auth.js
├── proxy.ts                   # Proteção de rotas /dashboard (antigo middleware.ts)
├── components/
│   ├── ServiceWorkerRegister.tsx
│   ├── SignOutButton.tsx
│   └── DashboardNav.tsx
└── lib/
    ├── auth/
    │   ├── password.ts        # hash/verify (bcrypt)
    │   └── authenticate.ts    # lógica de autenticação testável isoladamente
    ├── customers/
    │   ├── service.ts         # regras de negócio de clientes (testável sem HTTP)
    │   └── errors.ts          # erros de domínio (duplicidade, não encontrado)
    ├── vehicles/
    │   ├── service.ts         # regras de negócio de veículos (testável sem HTTP)
    │   └── errors.ts          # erros de domínio (duplicidade, não encontrado, cliente inválido)
    ├── validation/
    │   ├── document.ts        # CPF/CNPJ: validação real + normalização
    │   ├── phone.ts           # normalização de telefone/WhatsApp
    │   ├── plate.ts           # placa: validação real (2 formatos) + normalização
    │   ├── customer.ts        # schema Zod do cadastro de cliente
    │   └── vehicle.ts         # schema Zod do cadastro de veículo
    └── db/
        ├── pool.ts            # conexão pg (ver "Nota sobre o Prisma")
        └── repositories/      # users, roles, auditLog, customers, vehicles
scripts/seed.ts                # cria papel ADMINISTRADOR + Carlim/Mateus
prisma/schema.prisma           # fonte de verdade do modelo de dados
prisma/migrations/             # migrações manuais (0001 fundação, 0002 clientes, 0003 veículos)
```
