# PAINEL DO PROJETO — BOX 02 (Oficina OS)

**Este é um documento vivo.** Atualizado ao final de cada ciclo — não é um relatório paralelo, é a fonte única de verdade sobre o estado do projeto. Última atualização: **Ciclo J concluído e aprovado** (Evidências/Fotos).

> Ver também `GOVERNANCA_E_PRINCIPIOS_BOX02.md` — o "cérebro" do projeto: a sequência de governança e os princípios arquiteturais já provados (congelamento por cópia, status≠etapa, gates nunca enfraquecidos, etc.), consultado no início de cada ciclo novo.

Também disponível como página dentro do próprio sistema, em `/dashboard/painel-projeto` (área interna, protegida por login, não é uma funcionalidade voltada ao cliente).

---

## 1. Resumo executivo

| | |
|---|---|
| Ciclos concluídos e aprovados | **15** (Ciclos 1–4, 5 Sub-etapa 1, 5 Sub-etapa 2, DT3, A, B, C1, D, E, F, Método BOX02-UI, G, H, I, J — ver linha do tempo completa na seção 4) |
| Testes automatizados | **395/395**, estáveis em 3 rodadas consecutivas |
| Migrações aplicadas | **17** (`0001` a `0017`) |
| Módulos com funcionalidade real disponível | Clientes, Veículos, Orçamento (3 camadas), Biblioteca de Serviços, OS, Adicionais, Checklists/Procedimentos (cadastro + execução), Termo de Recepção, Método BOX 02 materializado na UI, Entrega Técnica, Precificação e Custos, Recebimentos (Financeiro mínimo), Evidências/Fotos |
| Módulos só especificados (sem código) | — (nenhum pendente no momento) |
| Módulos sem especificação técnica ainda | Financeiro completo (contas a pagar/caixa/conciliação), CRM/Captação, Identidade visual BOX 02 nas telas |

---

## 2. Metodologia do progresso visual (leia antes da seção 3)

**Não é calculado por número de arquivos nem linhas de código.** É calculado por **capacidades de negócio**, listadas manualmente uma a uma (seção 3), cada uma classificada num destes 5 status:

| Símbolo | Status | Significado |
|---|---|---|
| ✅ | Implementado e validado | Código em produção, testado (automatizado + HTTP real), aprovado |
| 🟡 | Implementado parcialmente | Parte da capacidade funciona, falta complementar |
| 📘 | Especificado | Documento de especificação/plano técnico existe e foi aprovado, código ainda não escrito |
| 💡 | Identificado | Necessidade registrada (ex.: no briefing BOX 02), sem especificação técnica formal ainda |
| ⬜ | Não iniciado | Nada feito, nem análise |

O percentual da seção 3 é: **(nº de capacidades ✅) ÷ (nº total de capacidades já identificadas até agora)**. Isso **não** é "percentual do projeto inteiro" — é percentual do que **já foi mapeado como necessário**. Novas capacidades identificadas no futuro (ex.: quando o Financeiro for especificado em detalhe) vão aumentar o denominador — o percentual pode cair mesmo com mais coisa pronta, porque o escopo conhecido cresceu. Isso é intencional e deve ser lido assim, não como "falta X% para acabar o projeto".

---

## 3. Capacidades de negócio — status individual

### Cadastro e base
| Capacidade | Status | Ciclo |
|---|---|---|
| Autenticação e usuários | ✅ | Ciclo 1 |
| Cadastro de clientes (PF/PJ) | ✅ | Ciclo 2 |
| Cadastro de veículos | ✅ | Ciclo 3 |

### Orçamento
| Capacidade | Status | Ciclo |
|---|---|---|
| Criação, versionamento e link público de orçamento | ✅ | Ciclo 4 |
| Aprovação do cliente (total/parcial, por item) | ✅ | Ciclo 4 |
| Indicadores de orçamento | ✅ | Ciclo 4 |
| Orçamento em três camadas (Necessário/Recomendado/Informativo) | ✅ | Ciclo C1 |

### Biblioteca de Serviços
| Capacidade | Status | Ciclo |
|---|---|---|
| Cadastro de serviços (ativo/inativo, preço padrão) | ✅ | Ciclo A |
| Integração do serviço com orçamento/OS/adicionais (`serviceId`, congelamento) | ✅ | Ciclo B |
| Precificação e Custos (custo interno opcional, markup padrão configurável, preço sugerido derivado — sem hora técnica, decisão explícita) | ✅ | Ciclo H |

### Ordem de Serviço
| Capacidade | Status | Ciclo |
|---|---|---|
| Criação de OS (com ou sem orçamento), máquina de estados, fechamento | ✅ | Ciclo 5 (Sub-etapa 1) |
| Adicionais durante a execução (autorização, canais, bloqueio sem autorização) | ✅ | Ciclo 5 (Sub-etapa 2) |

### Checklists e Procedimentos
| Capacidade | Status | Ciclo |
|---|---|---|
| Cadastro de checklists e procedimentos (CRUD, `code` único) | ✅ | Ciclo D |
| Carga inicial CHK-001/CHK-006/POP-001–005 (conteúdo real do briefing) | ✅ | Ciclo D |
| Execução de checklist na OS (entrada/execução/entrega, congelamento por cópia) | ✅ | Ciclo E |
| Bloqueio de entrega por checklist obrigatório pendente | ✅ | Ciclo E |

### Método BOX 02
| Capacidade | Status | Ciclo |
|---|---|---|
| Sequência das 7 etapas materializada visualmente na ficha da OS (status≠etapa, VERIFICAMOS como barreira, bloqueio antecipado, badge de aceite pendente) | ✅ | Ciclo "Método BOX02-UI" |

### Identidade BOX 02
| Capacidade | Status | Ciclo |
|---|---|---|
| Briefing de identidade/operação recebido e registrado | ✅ (como documento) | — |
| Imagens de referência da marca recebidas e catalogadas | ✅ (como referência) | — |
| Aplicação da marca BOX 02 no sistema (nome, cores, logo nas telas) | ⬜ | — |

### Documentos operacionais (briefing BOX 02)
| Capacidade | Status | Ciclo |
|---|---|---|
| Termo de Recepção com assinatura (write-once, snapshot do CHK-001, rota de visualização) | ✅ | Ciclo F |
| Entrega Técnica (registro técnico + consolidação para o cliente, sem valores) | ✅ | Ciclo G |
| Evidências/Fotos (upload vinculado à OS, tipos GERAL/AVARIA, trava no aceite de recepção, acesso só interno) | ✅ | Ciclo J |

### Financeiro
| Capacidade | Status | Ciclo |
|---|---|---|
| Recebimentos (lançamentos 1:N por OS, pagamento parcial, saldo, status financeiro) — só receitas, sem contas a pagar/caixa/estorno | ✅ | Ciclo I |

### Fora do mapeamento técnico ainda
| Capacidade | Status |
|---|---|
| Financeiro completo (contas a pagar, despesas, caixa, conciliação) | ⬜ |
| CRM/Captação de clientes | ⬜ |

**Total de capacidades mapeadas até agora: 26. Implementadas e validadas: 23. → 23/26 = 88,5%** das capacidades já identificadas (não do projeto inteiro — ver seção 2).

```
[██████████████████████████████████░░░░] 88,5% das capacidades JÁ IDENTIFICADAS
(23 de 26 — o denominador cresce conforme novas frentes são especificadas)
```

---

## 4. Ciclos — linha do tempo

| Ciclo | Escopo | Status | Testes (acumulado) |
|---|---|---|---|
| 1–4 | Auth, Clientes, Veículos, Orçamento completo | ✅ Aprovado | 220 (antes do Ciclo A) |
| 5 (Sub-etapa 1) | OS básica | ✅ Aprovado | incluso acima |
| 5 (Sub-etapa 2) | Adicionais durante execução | ✅ Aprovado | 263 |
| DT3 | Correção de instabilidade de testes (não funcional) | ✅ Resolvida | 263 (sem novos testes, causa raiz corrigida) |
| A | Biblioteca de Serviços | ✅ Aprovado | 263 |
| B | Integração de Serviços (serviceId) | ✅ Aprovado | 276 |
| C1 | Orçamento em Três Camadas | ✅ Aprovado | 286 |
| D | Checklists e Procedimentos (cadastro) | ✅ Aprovado | 300 |
| E | Execução dos Checklists na OS | ✅ Aprovado | 310 |
| F | Termo de Recepção | ✅ Aprovado | 325 |
| Método BOX02-UI | Materialização visual do Método BOX 02 na ficha da OS | ✅ Aprovado | 336 |
| G | Entrega Técnica | ✅ Aprovado | 346 |
| H | Precificação e Custos | ✅ Aprovado | 373 |
| I | Recebimentos (Financeiro mínimo) | ✅ Aprovado | 385 |
| J | Evidências/Fotos | ✅ Aprovado | **395** |
| K, ... | Ver seção 10 | ⬜ Planejados, não iniciados | — |

---

## 5. Fluxo completo da oficina — o que já existe vs. o que falta

```
Captacao do cliente          [NAO ESPECIFICADO]
      |
Cadastro cliente/veiculo     [PRONTO]
      |
Orcamento (3 camadas)        [PRONTO]
      |
Aprovacao do cliente         [PRONTO]
      |
Conversao em OS              [PRONTO]
      |
Checklist de entrada         [PRONTO]
      |
Termo de Recepcao + Aceite   [PRONTO] (write-once, bloqueia EM_EXECUCAO ate existir)
      |
Execucao (com checklist      [PRONTO]
 por servico quando houver)
      |
Adicionais durante execucao  [PRONTO]
      |
Checklist de entrega         [PRONTO] (bloqueia fechamento se obrigatorio pendente)
      |
Entrega Tecnica ao cliente   [PRONTO] (registro tecnico + consolidacao, sem valores monetarios)
      |
Financeiro (recebimentos)    [PRONTO] (so receitas: lancamentos parciais, saldo, status - sem contas a pagar/caixa)
```

O sistema cobre hoje, de ponta a ponta e validado, desde a **captação manual do cliente** (cadastro) até a **entrega física do veículo com checklist obrigatório cumprido, registro técnico consolidado e controle de recebimento**. O que falta para um Financeiro completo é contas a pagar, despesas, caixa consolidado e conciliação bancária — conscientemente fora do Ciclo I.

---

## 6–7. Funcionalidades disponíveis vs. só especificadas

**Disponível de verdade (testado e em produção)**: tudo marcado ✅ na seção 3.

**Só especificada (documento existe, código não)**:
- — (nenhuma pendente no momento)

---

## 8. Pendências técnicas

- **`quote_items` não guarda autor/data por item** (só a versão inteira tem essa informação) — lacuna pré-existente, identificada durante o Ciclo C1, não corrigida ainda (não bloqueia nada, só limita rastreabilidade granular).
- **CHK-002 a CHK-005** do briefing (Diagnóstico eletrônico, Inspeção mecânica, Registro fotográfico, Conferência pós-serviço) não foram semeados — sem conteúdo de itens fornecido no briefing, e sua "etapa" não mapeia limpo no enum atual de 3 tipos de checklist. Precisa de decisão de modelagem quando for retomado.
- **Categoria do orçamento (Necessário/Recomendado/Informativo) não é copiada para a OS** — registrada como pendência explícita, não implementada.

## 9. Pendências de negócio (dependem de decisão dos sócios)

- **Precificação e Custos**: modelo DECIDIDO e implementado no Ciclo H (custo interno + markup padrão da oficina → preço sugerido; hora técnica/apontamento de horas explicitamente descartado). O que resta é operacional, não técnico: os sócios cadastrarem o custo real dos serviços (opcional, hoje todos em branco) e definirem o markup padrão em Configurações → Precificação (hoje não configurado).
- **Estrutura financeira completa**: contas a pagar, despesas, fornecedores, caixa consolidado, conciliação bancária, parcelamento programado, inadimplência automática, estorno/reembolso, margem real por venda, pró-labore dos dois sócios. Recebimentos simples (só receitas) já implementados no Ciclo I.
- **CRM/Captação de clientes**: como o sistema deve (ou não) ajudar a captar/reter clientes.
- **Evidências/fotos**: DECIDIDO e implementado no Ciclo J (upload vinculado à OS, tipos GERAL/AVARIA, trava no aceite de recepção reaproveitando `receptionAcceptedAt`, acesso só interno via Cloudflare R2). O que resta é operacional: configurar credenciais reais do R2 em produção e validar conectividade de verdade — nunca testada até agora, nem em desenvolvimento nem em produção.
- **Aplicação da marca BOX 02**: quando trocar "Oficina OS" pela identidade visual definitiva no sistema.
- **Permissões granulares**: custo/markup hoje são editáveis por qualquer usuário logado (mesmo padrão do resto do sistema) — decisão explícita de não criar RBAC no Ciclo H; considerar só se os sócios quiserem restringir no futuro.

---

## 10. Próximos ciclos recomendados (proposta, não iniciada)

| Ordem | Ciclo | Por quê nessa ordem |
|---|---|---|
| 1 | **Identidade BOX 02 no sistema** | Cosmético — não bloqueia nada funcional, pode entrar a qualquer momento sem depender de outra coisa |
| 2+ | CRM, Financeiro completo (contas a pagar/caixa/estorno) | Menor urgência percebida até agora, sem pressão explícita registrada |

---

## 11. Riscos e decisões arquiteturais já tomadas (não reabertas sem causa nova)

- **Congelamento por cópia** é o princípio central repetido em 4 lugares (orçamento→OS, item→item, checklist→instância, categoria→versão) — qualquer novo módulo que precise de "snapshot" deve seguir o mesmo padrão, não inventar um novo.
- **Gate de mutabilidade reaproveitável entre domínios diferentes** (Ciclo J) — a regra "livre antes do aceite de recepção, travado depois" já existia para avarias (`updateWorkOrderReceptionInfoService`, Ciclo F) e foi reaproveitada, sem alteração, para evidências — confirma que `receptionAcceptedAt` é um ponto de trava genérico do domínio, não específico de um campo.
- **Dependência externa não verificável ainda deve ser isolada por interface** (Ciclo J) — o cliente de storage (R2) é injetável (`StorageClient`), permitindo testar toda a regra de negócio sem depender de credencial/conectividade real, que nunca foi confirmada.
- **`serviceId` é FK direta**, não reaproveita `catalogItemType`/`catalogItemId` (reservados para catálogo de peças futuro).
- **Sem `EM_EXECUCAO`** em item de OS nem em checklist — decisão consciente contra complexidade não pedida.
- **Checklist ENTRADA/ENTREGA são globais e únicos por oficina** (no máximo um ativo por vez); EXECUÇÃO não tem essa exclusividade.
- **`code` obrigatório e único** em `Procedure`/`Checklist` (POP-XXX/CHK-XXX), para rastreabilidade.
- **DT3 (risco de suíte de teste não-determinística)**: resolvida, causa raiz era um bug de teste (ordenação de CUID2), não um bug de produção — documentado em `TECH_DEBT.md`.
- **Snapshot do CHK-001 no Termo de Recepção é uma coluna JSON**, não tabela relacional — dado só de leitura depois de escrito, sem necessidade de consulta agregada; nunca relido de `work_order_checklists`/`work_order_checklist_items` depois de gravado.
- **Aceite de recepção é write-once** — uma vez registrado, nunca reescrito; correção futura exigiria um fluxo próprio, ainda não construído.
- **Gate de recepção é só sobre `EM_EXECUCAO`** — `EM_DIAGNOSTICO`/`CANCELADA` continuam livres sem aceite, por decisão explícita (DEC-1).
- **Peças existentes e nunca usadas são achados, não lacunas a inventar** (Ciclo G) — `technicalNotes` existia havia ciclos sem nenhum caller real; reaproveitado sem migração nova.
- **Configuração de negócio nunca nasce com valor inventado** (Ciclo H) — o markup padrão de precificação não tem fallback numérico; enquanto não configurado pelos sócios, o sistema retorna "sem sugestão calculada" explicitamente, nunca um percentual chutado.
- **Preço sugerido nunca é armazenado, sempre derivado na leitura** (Ciclo H) — precedência: preço manual cadastrado > calculado por custo+markup > nenhum. Custo e markup nunca aparecem em nenhum documento voltado ao cliente (confirmado por construção: as rotas públicas/de documento nunca leem a Biblioteca de Serviços).

---

## 12. Últimos resultados de validação (Ciclo J)

- Testes automatizados: **395/395**, 3 rodadas consecutivas.
- Lint: limpo.
- Typecheck: limpo.
- Build: limpo, 37 rotas (+1 — rota de arquivo `/dashboard/os/[id]/evidence/[evidenceId]`, autenticação obrigatória, sem URL pública).
- Validação HTTP real: cenário com evidências antes e depois do aceite de recepção — antes do aceite, botão "Excluir" presente; depois do aceite, 0 botões "Excluir" (todas travadas), aviso de trava visível, botão "Adicionar evidência" continua disponível; confirmado por busca precisa que custo/markup nunca aparecem na seção. Rota de arquivo testada sem sessão (307, redireciona pro login) e com sessão sem credencial real de R2 (500, erro de configuração claro — não um bug silencioso).
- Mobile: confirmado (viewport).
- Banco de desenvolvimento: limpo ao final.
- **Nota permanente**: conectividade real com o Cloudflare R2 nunca foi verificada, nem neste ambiente nem em produção — confirmado por teste real de rede (certificado emitido pelo proxy de egress da Anthropic, não pelo Cloudflare). A lógica de negócio foi validada com um `StorageClient` falso (injeção de dependência); o roundtrip real com o R2 segue como validação pendente para quando houver credencial e ambiente real disponíveis.
- **Achado no início desta sessão**: o ambiente de trabalho tinha sido resetado (container novo) — código real reconstruído a partir do pacote `.tar.gz` do Ciclo I mais recente, não de memória da conversa.

---

## 13. Pacotes por ciclo

| Ciclo | Arquivo |
|---|---|
| Sub-etapa 2 (Ciclo 5) | `oficina-os-ciclo5-sub2.tar.gz` |
| A | `oficina-os-ciclo-a-servicos.tar.gz` |
| DT3 | `oficina-os-dt3-fix.tar.gz` |
| B | `oficina-os-ciclo-b-integracao.tar.gz` |
| C1 | `oficina-os-ciclo-c1-tres-camadas.tar.gz` |
| D | `oficina-os-ciclo-d-checklists.tar.gz` |
| E | `oficina-os-ciclo-e-execucao.tar.gz` |
| F | `oficina-os-ciclo-f-termo-recepcao.tar.gz` |
| Método BOX02-UI | `oficina-os-metodo-box02-ui.tar.gz` |
| G | `oficina-os-ciclo-g-entrega-tecnica.tar.gz` |
| H | `oficina-os-ciclo-h-precificacao.tar.gz` |
| I | `oficina-os-ciclo-i-recebimentos.tar.gz` |
| J | `oficina-os-ciclo-j-evidencias.tar.gz` |

---

*Este documento é atualizado ao final de cada ciclo aprovado — não crie um relatório novo em paralelo; edite este arquivo.*
