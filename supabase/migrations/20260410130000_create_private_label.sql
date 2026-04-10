-- =============================================================================
-- Módulo Private Label — pedidos de encomenda de atacado (CJ Rasteirinhas)
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Tabela principal de pedidos private label
-- -----------------------------------------------------------------------------
create table if not exists public.private_label_pedidos (
  id               uuid primary key default uuid_generate_v4(),
  tenant_id        uuid not null,

  -- Vínculo opcional com contato existente
  contact_id       uuid references public.clients(id) on delete set null,

  -- Dados do cliente
  cliente_nome     text,
  cliente_telefone text,
  cliente_email    text,
  cliente_cnpj     text,
  cliente_logo_url text,

  -- Endereço (preenchido via ViaCEP)
  cliente_cep      text,
  cliente_endereco text,
  cliente_bairro   text,
  cliente_cidade   text,
  cliente_estado   text,

  -- Valores
  frete            numeric(12,2) not null default 0,
  desconto         numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  prazo_entrega    text,
  observacoes      text,

  -- Status
  status text not null default 'rascunho'
    check (status in ('rascunho', 'finalizado', 'cancelado')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Itens do pedido (grade de numeração 34–40)
-- -----------------------------------------------------------------------------
create table if not exists public.private_label_itens (
  id             uuid primary key default uuid_generate_v4(),
  pedido_id      uuid not null
    references public.private_label_pedidos(id) on delete cascade,

  nome           text,
  foto_url       text,
  cores          text,
  valor_unitario numeric(12,2) not null default 0,

  -- Grade JSON: { "34": 0, "35": 0, "36": 0, "37": 0, "38": 0, "39": 0, "40": 0 }
  grade          jsonb not null
    default '{"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0}',

  total_pares    integer not null default 0,
  subtotal       numeric(12,2) not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Índices
-- -----------------------------------------------------------------------------
create index if not exists idx_pl_pedidos_tenant
  on public.private_label_pedidos(tenant_id);

create index if not exists idx_pl_pedidos_status
  on public.private_label_pedidos(status);

create index if not exists idx_pl_itens_pedido
  on public.private_label_itens(pedido_id);

-- -----------------------------------------------------------------------------
-- RLS — private_label_pedidos
-- -----------------------------------------------------------------------------
alter table public.private_label_pedidos enable row level security;

create policy "pl_pedidos_select" on public.private_label_pedidos for select
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1));

create policy "pl_pedidos_insert" on public.private_label_pedidos for insert
  with check (tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1));

create policy "pl_pedidos_update" on public.private_label_pedidos for update
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1));

create policy "pl_pedidos_delete" on public.private_label_pedidos for delete
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1));

-- -----------------------------------------------------------------------------
-- RLS — private_label_itens (acesso derivado do pedido)
-- -----------------------------------------------------------------------------
alter table public.private_label_itens enable row level security;

create policy "pl_itens_select" on public.private_label_itens for select
  using (pedido_id in (
    select id from public.private_label_pedidos
    where tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1)
  ));

create policy "pl_itens_insert" on public.private_label_itens for insert
  with check (pedido_id in (
    select id from public.private_label_pedidos
    where tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1)
  ));

create policy "pl_itens_update" on public.private_label_itens for update
  using (pedido_id in (
    select id from public.private_label_pedidos
    where tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1)
  ));

create policy "pl_itens_delete" on public.private_label_itens for delete
  using (pedido_id in (
    select id from public.private_label_pedidos
    where tenant_id = (select tenant_id from public.profiles where id = auth.uid() limit 1)
  ));
