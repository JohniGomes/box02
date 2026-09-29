# GUIA DE NAVEGAÇÃO — Visualização do estado atual (Ciclos D, E, F)

Este guia acompanha 3 OS's de demonstração (DEMO A, B, C), criadas exclusivamente com funções de serviço já existentes (`scripts/seed-demo-data.ts`) — nenhuma funcionalidade nova. Todos os clientes/veículos/serviços de demonstração começam com o marcador **"DEMO -"**.

**Pré-requisito**: rodar o sistema (`npm run build && npm run start`, ou `npm run dev`) e logar com um dos usuários já existentes (ex.: `carlim@oficina-os.local`).

**IDs desta rodada** (mudam se o script for rodado de novo):

| | ID |
|---|---|
| OS DEMO A | `czfmuzex12rxnhee2uphqtjf` (OS-000001) |
| OS DEMO B | `b63o85zpj81ahumwdr5vyf3b` (OS-000002) |
| OS DEMO C | `h1wtg0by711aqr3gur4ovlyo` (OS-000003) |

---

## 1. Ficha da OS
`/dashboard/os` → tocar em qualquer uma das 3 OS (ou usar o número direto acima).
**O que ver**: cliente, veículo, itens, status, seções de Recepção/Checklists — tudo na mesma tela, mobile-first.

## 2. Recepção/Identificação
Ficha da **OS-000001** (DEMO A) → seção "Recepção".
**O que ver**: avarias preexistentes declaradas ("Risco na porta traseira direita..."), botão "Registrar aceite de recepção" ainda disponível (aceite não foi registrado nesta OS de propósito).

## 3. Checklist de entrada
Mesma tela (OS-000001) → seção "Checklist de entrada".
**O que ver**: CHK-001 real do seed, 7 itens, 2 já marcados.

## 4. Termo de Recepção — ANTES do aceite
`/dashboard/os/[id-da-OS-000001]/termo-recepcao`.
**O que ver**: banner "Prévia dinâmica — Termo ainda pendente de aceite", dados atuais (queixa, avarias, checklist de entrada com o estado atual), seção de aceite dizendo "Aceite ainda não registrado".

## 5. Termo de Recepção — DEPOIS do aceite
Ficha da **OS-000002** (DEMO B) → link "Ver Termo de Recepção →", ou direto em `/dashboard/os/[id-da-OS-000002]/termo-recepcao`.
**O que ver**: banner "Documento congelado", nome de quem aceitou ("DEMO - Cliente B (aceite)"), data/hora do aceite, checklist de entrada mostrado como estava **no momento do aceite** (todos os 7 itens marcados).

## 6. Checklist de execução por serviço
Ficha da **OS-000002** (DEMO B) → dentro do item "DEMO - Alinhamento e Balanceamento".
**O que ver**: checklist `CHK-DEMO-EXEC` (criado só para esta demonstração), com "Calibrar pneus" marcado e "Conferir aperto das rodas" **propositalmente pendente** — mostra o checklist de execução em andamento.

## 7. Checklist de entrega
Mesma ficha (OS-000002) → seção "Checklist de entrega", perto do botão de entregar.
**O que ver**: CHK-006 real (11 itens), só os 3 primeiros marcados, badge "8 obrigatório(s) pendente(s)".

## 8. Bloqueio/liberação da entrega
Mesma ficha (OS-000002) → tentar tocar em "Entregar".
**O que ver**: o sistema recusa e mostra o motivo (itens obrigatórios pendentes) — já confirmado no servidor durante a criação dos dados (`WorkOrderDeliveryChecklistPendingError`), e a UI reflete a mesma pendência através do badge da seção 7.
Para ver a **liberação** de verdade, use a **OS-000003** (DEMO C) — já está `ENTREGUE`, prova que quando os itens obrigatórios são todos marcados, o fechamento funciona (e o histórico do checklist continua visível na ficha mesmo depois da entrega — era exatamente o bug corrigido no Ciclo E).

## 9. Configurações dos checklists
`/dashboard/configuracoes/checklists`.
**O que ver**: CHK-001, CHK-006 (reais, seed) e `CHK-DEMO-EXEC` (criado só para esta demonstração) lado a lado — prova que checklist de demonstração convive com o real sem interferir.

## 10. Painel geral do projeto
`/dashboard/configuracoes` → "Painel do Projeto BOX 02", ou direto em `/dashboard/painel-projeto`.
**O que ver**: 13 ciclos aprovados, 325/325 testes, Termo de Recepção já marcado como disponível (Ciclo F).

---

## Limpeza (quando quiserem remover os dados DEMO)

```bash
npx tsx scripts/cleanup-demo-data.ts
```

Remove só os registros marcados "DEMO -" e o checklist `CHK-DEMO-EXEC` — nunca toca CHK-001, CHK-006, POP-001-005 ou qualquer dado real.
