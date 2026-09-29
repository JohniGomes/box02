# BRIEFING_BOX02_IDENTIDADE_OPERACAO.md

**Status**: registro de decisões de negócio para consulta futura. Nenhum item deste documento foi implementado ainda — é o briefing recebido, salvo como referência para os próximos ciclos de desenvolvimento.

---

## 1. Identidade da empresa — atualização oficial

Nome da oficina:

```
BOX 02
DIAGNÓSTICO & MECÂNICA
Anápolis – GO
```

Substitui "Oficina OS" em todos os documentos gerados pelo sistema: OS, orçamento, checklist, PDF, comprovante de entrega, cabeçalho de tela e configurações da empresa.

Os dados configuráveis da empresa (nome, CNPJ, contato, logo) já estavam previstos na arquitetura. "BOX 02 | DIAGNÓSTICO & MECÂNICA" será o valor padrão inicial quando essa configuração for implementada.

---

## 2. O Método BOX 02 — fluxo operacional oficial

7 etapas obrigatórias e sequenciais — o DNA operacional da BOX 02, referência para nomenclatura de módulos, status da OS, checklists e documentos gerados pelo sistema:

| Método BOX 02 | Módulo no sistema |
|---|---|
| Identificamos | Check-in + queixa do cliente |
| Diagnosticamos | Diagnóstico eletrônico e mecânico |
| Registramos | Fotos + evidências vinculadas à OS |
| Explicamos | Comunicação do diagnóstico ao cliente |
| Orçamos | Módulo de orçamento |
| Executamos | Módulo de execução |
| Entregamos | Finalização + checklist de entrega |

---

## 3. Requisito novo — Orçamento em três camadas

O módulo de orçamento precisa suportar três categorias obrigatórias de item, além da separação já existente entre serviços e peças:

- **NECESSÁRIO** — o que precisa ser feito para corrigir o problema identificado; o que o cliente precisa aprovar para o serviço ser executado.
- **RECOMENDADO** — itens com desgaste ou que merecem atenção, mas não impedem a execução naquele momento; o cliente pode aprovar ou não.
- **INFORMATIVO** — observações para manutenção futura; não gera item de cobrança, é registro de transparência.

Regras:
- Todo item do orçamento deve pertencer a uma dessas três categorias.
- Só itens NECESSÁRIOS e RECOMENDADOS aprovados pelo cliente geram execução e cobrança.
- Itens INFORMATIVOS nunca geram cobrança — são registro apenas.
- O PDF do orçamento deve exibir as três seções separadas e identificadas.
- O link de aprovação enviado ao cliente deve mostrar claramente as três seções.

Diferencial central do posicionamento da BOX 02 — a separação entre urgente e opcional não pode ser simplificada.

---

## 4. Arquitetura de checklists — sistema operacional BOX 02

Templates a serem criados como checklists padrão no sistema, editáveis pela administração.

| Código | Documento | Etapa do Método |
|---|---|---|
| POP-001 | Recepção e identificação do veículo | Identificamos |
| CHK-001 | Checklist de entrada | Identificamos |
| POP-002 | Diagnóstico técnico | Diagnosticamos |
| CHK-002 | Diagnóstico eletrônico | Diagnosticamos |
| CHK-003 | Inspeção mecânica | Diagnosticamos |
| CHK-004 | Registro fotográfico e evidências | Registramos |
| POP-003 | Comunicação do diagnóstico | Explicamos |
| FRM-001 | Orçamento BOX 02 | Orçamos |
| POP-004 | Execução dos serviços | Executamos |
| CHK-005 | Conferência pós-serviço | Executamos |
| POP-005 | Entrega técnica | Entregamos |
| CHK-006 | Checklist de entrega | Entregamos |
| FRM-002 | Registro de aprovação do cliente | Entregamos |

### CHK-001 — Checklist de Entrada (template inicial)

**Identificação**: cliente, telefone, veículo, marca/modelo, ano, placa, quilometragem, data/hora, responsável.

**Queixa do cliente**: campo aberto para relato. Quando ocorre: Sempre / Às vezes / Com motor frio / Com motor quente / Ao acelerar / Ao frear / Ao esterçar / Em piso irregular / Em determinada velocidade / Outro.

**Condição de entrada**:
- Estado geral da carroceria registrado
- Avarias preexistentes registradas
- Rodas/pneus registrados quando necessário
- Luzes de advertência no painel
- Nível aparente de combustível
- Objetos relevantes no interior
- Fotos de entrada realizadas

### CHK-006 — Checklist de Entrega (template inicial)

- Serviço executado conferido
- Veículo testado quando aplicável
- Ferramentas/objetos retirados do veículo
- Avarias de entrada conferidas
- Peças substituídas separadas quando solicitado
- Serviço realizado explicado ao cliente
- Recomendações futuras informadas
- Próxima manutenção recomendada
- Cliente recebeu orçamento/OS
- Cliente recebeu evidências quando aplicável
- Entrega registrada

---

## 5. Requisito novo — Entrega Técnica

Na etapa de entrega, além do checklist CHK-006, o sistema deve gerar um documento **Entrega Técnica** — distinto da OS completa, formato resumido para o cliente.

Conteúdo:
- O que fizemos no seu carro hoje (3 a 5 tópicos)
- O que você deve acompanhar (1 a 2 tópicos)
- Próxima manutenção recomendada (data ou quilometragem)

Formato: cabe em meia folha A4 ou mensagem de WhatsApp. Não é laudo técnico — comunicação simples e direta para o cliente levar para casa.

---

## 6. Requisito novo — Termo de Recepção com assinatura

O CHK-001 deve gerar um **Termo de Recepção** com assinatura do cliente na entrada. Sem esse documento, o registro de avarias preexistentes não tem valor jurídico.

Conteúdo mínimo:
- Identificação do veículo e cliente
- Declaração da queixa relatada
- Registro de avarias preexistentes
- Autorização de diagnóstico
- Assinatura do cliente

A assinatura pode usar o mecanismo já previsto na arquitetura (nome + CPF + data/hora + aceite) — não precisa de novo desenvolvimento, só aplicação no momento da recepção.

---

## 7. Tom de voz — padrão para comunicações do sistema

Todas as mensagens geradas pelo sistema para o cliente — link de aprovação, confirmação de entrega, notificações — seguem o tom de voz oficial da BOX 02.

**Princípio**: especialista que respeita quem não é técnico.

Regras:
- Explica, não impressiona — sem termos técnicos desnecessários
- Mostra, não promete — evidência antes de conclusão
- É direta, mas não seca
- É humana, sem ser informal demais

Exemplos:
- Em vez de "Foi constatada anomalia no sistema de suspensão dianteira." → "Identificamos uma folga no pivô da suspensão dianteira. Veja no vídeo onde está o problema."
- Em vez de "Necessária substituição dos componentes." → "A peça apresenta desgaste e recomendamos a substituição para evitar que o problema avance."

Aplicar em: mensagens do link de aprovação, texto da Entrega Técnica, notificações automáticas e modelos de documento.

---

## 8. Prioridade de implementação (ordem sugerida no briefing)

1. Atualização do orçamento para três camadas (NECESSÁRIO / RECOMENDADO / INFORMATIVO).
2. Termo de Recepção com assinatura integrado ao CHK-001.
3. Templates CHK-001 e CHK-006 carregados como padrão no módulo de checklists.
4. Documento de Entrega Técnica como saída da etapa de entrega.
5. Atualização do nome para "BOX 02 | DIAGNÓSTICO & MECÂNICA" nas configurações e documentos.

---

*Documento recebido como briefing de decisões já validadas pela gestão — não é uma proposta a avaliar, é a referência a seguir quando estes itens entrarem em ciclo de desenvolvimento. Nenhuma implementação foi feita a partir deste documento até o momento em que ele foi salvo.*
