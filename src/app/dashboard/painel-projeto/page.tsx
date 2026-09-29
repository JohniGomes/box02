/**
 * Painel do Projeto — BOX 02 (Oficina OS)
 *
 * ÁREA INTERNA/ADMINISTRATIVA — não é uma funcionalidade voltada ao
 * cliente da oficina. É a versão navegável, dentro do próprio sistema,
 * do documento vivo docs/PAINEL_PROJETO_BOX02.md — mesma fonte de
 * verdade, sem duplicar lógica de negócio nenhuma.
 *
 * Propositalmente 100% estático: os dados abaixo são atualizados à mão
 * ao final de cada ciclo aprovado, junto com o .md. Esta página não faz
 * nenhuma consulta ao banco nem introduz nenhuma capacidade de negócio
 * nova — é só apresentação. Protegida pela mesma autenticação de todo
 * o /dashboard (ver src/app/dashboard/layout.tsx).
 */

type CapabilityStatus = "done" | "partial" | "specified" | "identified" | "not_started";

interface Capability {
  name: string;
  status: CapabilityStatus;
  cycle?: string;
}

const STATUS_META: Record<CapabilityStatus, { label: string; symbol: string; className: string }> = {
  done: { label: "Implementado e validado", symbol: "✅", className: "bg-success/15 text-success" },
  partial: { label: "Implementado parcialmente", symbol: "🟡", className: "bg-amber-500/15 text-amber-600" },
  specified: { label: "Especificado", symbol: "📘", className: "bg-accent/15 text-accent" },
  identified: { label: "Identificado", symbol: "💡", className: "bg-muted/20 text-muted" },
  not_started: { label: "Não iniciado", symbol: "⬜", className: "bg-muted/10 text-muted" },
};

const CAPABILITY_GROUPS: { title: string; items: Capability[] }[] = [
  {
    title: "Cadastro e base",
    items: [
      { name: "Autenticação e usuários", status: "done", cycle: "Ciclo 1" },
      { name: "Cadastro de clientes (PF/PJ)", status: "done", cycle: "Ciclo 2" },
      { name: "Cadastro de veículos", status: "done", cycle: "Ciclo 3" },
    ],
  },
  {
    title: "Orçamento",
    items: [
      { name: "Criação, versionamento e link público", status: "done", cycle: "Ciclo 4" },
      { name: "Aprovação do cliente (total/parcial, por item)", status: "done", cycle: "Ciclo 4" },
      { name: "Indicadores de orçamento", status: "done", cycle: "Ciclo 4" },
      { name: "Três camadas (Necessário/Recomendado/Informativo)", status: "done", cycle: "Ciclo C1" },
    ],
  },
  {
    title: "Biblioteca de Serviços",
    items: [
      { name: "Cadastro de serviços (ativo/inativo, preço padrão)", status: "done", cycle: "Ciclo A" },
      { name: "Integração com orçamento/OS/adicionais (serviceId)", status: "done", cycle: "Ciclo B" },
      { name: "Precificação e Custos (custo interno, markup padrão, preço sugerido)", status: "done", cycle: "Ciclo H" },
    ],
  },
  {
    title: "Ordem de Serviço",
    items: [
      { name: "Criação, máquina de estados, fechamento", status: "done", cycle: "Ciclo 5.1" },
      { name: "Adicionais durante a execução", status: "done", cycle: "Ciclo 5.2" },
    ],
  },
  {
    title: "Checklists e Procedimentos",
    items: [
      { name: "Cadastro (CRUD, código único)", status: "done", cycle: "Ciclo D" },
      { name: "Carga inicial CHK-001/CHK-006/POP-001–005", status: "done", cycle: "Ciclo D" },
      { name: "Execução na OS (entrada/execução/entrega, congelamento)", status: "done", cycle: "Ciclo E" },
      { name: "Bloqueio de entrega por item obrigatório pendente", status: "done", cycle: "Ciclo E" },
    ],
  },
  {
    title: "Método BOX 02",
    items: [
      { name: "Sequência das 7 etapas materializada visualmente na ficha da OS (status≠etapa, VERIFICAMOS como barreira)", status: "done", cycle: "Ciclo Método BOX02-UI" },
    ],
  },
  {
    title: "Identidade BOX 02",
    items: [
      { name: "Briefing de identidade/operação registrado", status: "done" },
      { name: "Imagens de referência catalogadas", status: "done" },
      { name: "Aplicação da marca no sistema (nome, cores, logo)", status: "not_started" },
    ],
  },
  {
    title: "Documentos operacionais",
    items: [
      { name: "Termo de Recepção com assinatura", status: "done", cycle: "Ciclo F" },
      { name: "Entrega Técnica (resumo ao cliente)", status: "done", cycle: "Ciclo G" },
      { name: "Evidências/Fotos (upload por OS, trava no aceite, acesso só interno)", status: "done", cycle: "Ciclo J" },
    ],
  },
  {
    title: "Fora do mapeamento técnico ainda",
    items: [
      { name: "Financeiro completo (contas a pagar, despesas, caixa, conciliação)", status: "not_started" },
      { name: "CRM/Captação de clientes", status: "not_started" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { name: "Recebimentos (lançamentos 1:N por OS, pagamento parcial, saldo, status financeiro — só receitas)", status: "done", cycle: "Ciclo I" },
    ],
  },
];

const allCapabilities = CAPABILITY_GROUPS.flatMap((g) => g.items);
const doneCount = allCapabilities.filter((c) => c.status === "done").length;
const totalCount = allCapabilities.length;
const donePercent = Math.round((doneCount / totalCount) * 100);

const CYCLES = [
  { name: "1–4", scope: "Auth, Clientes, Veículos, Orçamento completo", tests: 220 },
  { name: "5.1", scope: "OS básica", tests: 220 },
  { name: "5.2", scope: "Adicionais durante execução", tests: 263 },
  { name: "DT3", scope: "Correção de instabilidade de testes (não funcional)", tests: 263 },
  { name: "A", scope: "Biblioteca de Serviços", tests: 263 },
  { name: "B", scope: "Integração de Serviços (serviceId)", tests: 276 },
  { name: "C1", scope: "Orçamento em Três Camadas", tests: 286 },
  { name: "D", scope: "Checklists e Procedimentos (cadastro)", tests: 300 },
  { name: "E", scope: "Execução dos Checklists na OS", tests: 310 },
  { name: "F", scope: "Termo de Recepção", tests: 325 },
  { name: "UX", scope: "Materialização visual do Método BOX 02 na ficha da OS", tests: 336 },
  { name: "G", scope: "Entrega Técnica", tests: 346 },
  { name: "H", scope: "Precificação e Custos", tests: 373 },
  { name: "I", scope: "Recebimentos (Financeiro mínimo)", tests: 385 },
  { name: "J", scope: "Evidências/Fotos", tests: 395 },
];

/** Total de testes da suíte atual — sempre o do ciclo mais recente em
 * CYCLES (a contagem só cresce ciclo a ciclo). Reaproveitado aqui em
 * vez de hardcoded, para nunca dessincronizar do resultado do último
 * ciclo relatado. */
const latestTestCount = CYCLES[CYCLES.length - 1].tests;

const FLOW = [
  { label: "Captação do cliente", status: "not_started" as CapabilityStatus },
  { label: "Cadastro cliente/veículo", status: "done" as CapabilityStatus },
  { label: "Orçamento (3 camadas)", status: "done" as CapabilityStatus },
  { label: "Aprovação do cliente", status: "done" as CapabilityStatus },
  { label: "Conversão em OS", status: "done" as CapabilityStatus },
  { label: "Checklist de entrada", status: "done" as CapabilityStatus },
  { label: "Execução (com checklist por serviço)", status: "done" as CapabilityStatus },
  { label: "Adicionais durante execução", status: "done" as CapabilityStatus },
  { label: "Checklist de entrega (bloqueia se pendente)", status: "done" as CapabilityStatus },
  { label: "Entrega Técnica ao cliente", status: "done" as CapabilityStatus },
  { label: "Financeiro (cobrança/caixa)", status: "not_started" as CapabilityStatus },
];

const NEXT_CYCLES = [
  { order: 1, name: "Identidade BOX 02 no sistema", why: "Cosmético, não bloqueia nada, pode entrar a qualquer momento" },
  { order: 2, name: "CRM, Financeiro completo (contas a pagar/caixa/estorno)", why: "Menor urgência percebida até agora" },
  { order: 3, name: "Hora técnica / apontamento de horas", why: "Explicitamente descartado no Ciclo H — só reconsiderar se a operação real mostrar necessidade" },
  { order: 4, name: "Permissões granulares (RBAC)", why: "Hoje custo/markup/recebimentos são editáveis por qualquer usuário logado — considerar se vocês decidirem restringir" },
];

const PACKAGES = [
  { cycle: "Sub-etapa 2 (Ciclo 5)", file: "oficina-os-ciclo5-sub2.tar.gz" },
  { cycle: "A", file: "oficina-os-ciclo-a-servicos.tar.gz" },
  { cycle: "DT3", file: "oficina-os-dt3-fix.tar.gz" },
  { cycle: "B", file: "oficina-os-ciclo-b-integracao.tar.gz" },
  { cycle: "C1", file: "oficina-os-ciclo-c1-tres-camadas.tar.gz" },
  { cycle: "D", file: "oficina-os-ciclo-d-checklists.tar.gz" },
  { cycle: "E", file: "oficina-os-ciclo-e-execucao.tar.gz" },
  { cycle: "F", file: "oficina-os-ciclo-f-termo-recepcao.tar.gz" },
  { cycle: "Método BOX 02 na UI", file: "oficina-os-metodo-box02-ui.tar.gz" },
  { cycle: "G", file: "oficina-os-ciclo-g-entrega-tecnica.tar.gz" },
  { cycle: "H", file: "oficina-os-ciclo-h-precificacao.tar.gz" },
];

function StatusBadge({ status }: { status: CapabilityStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
      <span>{meta.symbol}</span>
      {meta.label}
    </span>
  );
}

export default function PainelProjetoPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">Área interna — não é uma tela para clientes</p>
        <p className="mt-1 text-xs text-muted">
          Documentação viva do projeto, atualizada ao final de cada ciclo. Fonte completa em{" "}
          <code className="rounded bg-background px-1 py-0.5">docs/PAINEL_PROJETO_BOX02.md</code>.
        </p>
      </div>

      <div>
        <h1 className="text-lg font-semibold tracking-tight">Painel do Projeto — BOX 02</h1>
        <p className="text-sm text-muted">Última atualização: Ciclo I concluído e aprovado (Recebimentos — Financeiro mínimo)</p>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Ciclos aprovados", value: String(CYCLES.length) },
          { label: "Testes automatizados", value: `${latestTestCount}/${latestTestCount}` },
          { label: "Migrações aplicadas", value: "17" },
          { label: "Capacidades prontas", value: `${doneCount}/${totalCount}` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted">{stat.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Progresso por capacidades de negócio</h2>
        <p className="mb-3 text-xs text-muted">
          Calculado por capacidades mapeadas manualmente (não por linhas de código). O denominador cresce
          conforme novas frentes são especificadas — ver metodologia completa no .md.
        </p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-background">
          <div className="h-full rounded-full bg-success" style={{ width: `${donePercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {donePercent}% das {totalCount} capacidades já identificadas estão implementadas e validadas ({doneCount}/{totalCount})
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Fluxo completo da oficina</h2>
        <ol className="flex flex-col gap-2">
          {FLOW.map((step, idx) => (
            <li key={step.label} className="flex items-center gap-2 rounded-xl border border-border bg-background p-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/20 text-[11px] font-semibold text-muted">
                {idx + 1}
              </span>
              <span className="flex-1 text-sm">{step.label}</span>
              <StatusBadge status={step.status} />
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Capacidades por módulo</h2>
        {CAPABILITY_GROUPS.map((group) => (
          <div key={group.title} className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{group.title}</h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {item.name}
                    {item.cycle ? <span className="ml-1.5 text-xs text-muted">({item.cycle})</span> : null}
                  </span>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Ciclos — linha do tempo</h2>
        <ul className="flex flex-col gap-2">
          {CYCLES.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3 text-sm">
              <div>
                <span className="font-mono text-xs font-semibold text-accent">Ciclo {c.name}</span>
                <p className="text-sm">{c.scope}</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{c.tests} testes</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Pendências técnicas</h2>
        <ul className="list-inside list-disc text-sm text-muted">
          <li>quote_items não guarda autor/data por item (lacuna pré-existente, não bloqueia nada)</li>
          <li>CHK-002 a CHK-005 do briefing não foram semeados — sem conteúdo fornecido e sem mapeamento claro no enum atual</li>
          <li>Categoria do orçamento não é copiada para a OS (pendência registrada)</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Pendências de negócio (dependem dos sócios)</h2>
        <ul className="list-inside list-disc text-sm text-muted">
          <li>Precificação e Custos: DECIDIDO no Ciclo H (custo + markup padrão, sem hora técnica) — o que resta é os sócios cadastrarem custo real dos serviços e definirem o markup em Configurações → Precificação</li>
          <li>Estrutura financeira completa: contas a pagar, despesas, caixa, conciliação, pró-labore dos dois sócios (recebimentos simples já implementados no Ciclo I)</li>
          <li>CRM/Captação de clientes</li>
          <li>Evidências/fotos: DECIDIDO e implementado no Ciclo J — falta configurar credenciais reais do R2 em produção e validar conectividade (nunca testada)</li>
          <li>Quando aplicar a identidade visual BOX 02 no sistema</li>
          <li>Se/quando restringir edição de custo/markup a só os sócios (permissões granulares não existem hoje)</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Próximos ciclos recomendados</h2>
        <ol className="flex flex-col gap-2">
          {NEXT_CYCLES.map((c) => (
            <li key={c.order} className="rounded-xl border border-border bg-background p-3 text-sm">
              <span className="font-semibold">{c.order}. {c.name}</span>
              <p className="text-xs text-muted">{c.why}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Decisões arquiteturais já tomadas</h2>
        <ul className="list-inside list-disc text-sm text-muted">
          <li>Congelamento por cópia é o princípio central, repetido em 4 lugares — qualquer novo snapshot segue o mesmo padrão</li>
          <li>serviceId é FK direta, não reaproveita catalogItemType/catalogItemId (reservados para peças)</li>
          <li>Sem EM_EXECUCAO em item de OS nem em checklist</li>
          <li>Checklist ENTRADA/ENTREGA são globais e únicos por oficina; EXECUÇÃO não tem exclusividade</li>
          <li>code obrigatório e único em Procedure/Checklist (POP-XXX/CHK-XXX)</li>
          <li>DT3 resolvida — causa raiz era bug de teste, não de produção</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Últimos resultados de validação (Ciclo J — Evidências/Fotos)</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>✅ Testes: 395/395, 3 rodadas consecutivas</li>
          <li>✅ Lint limpo</li>
          <li>✅ Typecheck limpo</li>
          <li>✅ Build limpo (37 rotas — +1, rota de arquivo autenticada, sem URL pública)</li>
          <li>✅ Validação HTTP real: evidências antes e depois do aceite de recepção — antes, botão &quot;Excluir&quot; presente; depois, 0 botões (tudo travado), aviso de trava visível, &quot;Adicionar evidência&quot; continua disponível; confirmado por busca precisa que custo/markup nunca aparecem; rota de arquivo testada sem sessão (401/307) e com sessão sem credencial real de R2 (500, erro de configuração claro)</li>
          <li>✅ Mobile confirmado</li>
          <li>✅ Banco de dev limpo ao final</li>
          <li>⚠️ Conectividade real com o Cloudflare R2 nunca foi verificada — nem neste ambiente, nem em produção (confirmado por teste real: certificado TLS emitido pelo proxy de egress da Anthropic, não pelo Cloudflare). Lógica de negócio validada com storage falso injetado</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Validação anterior (Materialização do Método BOX 02 na UI)</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>✅ Testes: 336/336, 3 rodadas consecutivas</li>
          <li>✅ Lint limpo</li>
          <li>✅ Typecheck limpo</li>
          <li>✅ Build limpo (34 rotas)</li>
          <li>✅ Validação HTTP real: sequência das 7 etapas, ORÇAMOS &quot;não aplicável&quot;, barreira Verificando, bloqueio antecipado do botão, badge de aceite pendente — todos confirmados usando as DEMOs A/B/C</li>
          <li>✅ Mobile confirmado</li>
          <li>✅ Banco de dev limpo (seed + DEMOs A/B/C intactos, nenhum resíduo de teste)</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Pacotes por ciclo</h2>
        <ul className="flex flex-col gap-1.5 text-sm">
          {PACKAGES.map((p) => (
            <li key={p.file} className="flex items-center justify-between gap-2">
              <span className="text-muted">Ciclo {p.cycle}</span>
              <code className="text-xs">{p.file}</code>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
