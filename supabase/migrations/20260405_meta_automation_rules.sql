-- Meta Automation Rules — regras automáticas de gestão de campanhas
-- Criado em: 2026-04-05

create table if not exists meta_automation_rules (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references auth.users(id) on delete cascade,
  nome              text not null,
  ativa             boolean not null default true,
  condicao          jsonb not null,
  -- exemplo: { "metrica": "cpl", "operador": "maior_que", "valor": 30, "janela_dias": 2 }
  acao              jsonb not null,
  -- exemplo: { "tipo": "pausar_campanha" } ou { "tipo": "escalar_orcamento", "incremento_pct": 0.2 }
  ultima_execucao   timestamptz,
  vezes_executada   integer not null default 0,
  created_at        timestamptz not null default now()
);

-- Índice para busca por tenant
create index if not exists meta_automation_rules_tenant_idx
  on meta_automation_rules(tenant_id);

-- RLS: cada tenant só vê e edita suas próprias regras
alter table meta_automation_rules enable row level security;

create policy "tenant isolation" on meta_automation_rules
  for all using (tenant_id = auth.uid());
