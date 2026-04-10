-- =============================================================================
-- Migration: Módulo de Pedidos de Atacado — CJ Rasteirinhas / VEXX CRM
-- Data: 2026-04-10
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tabela principal de pedidos
-- ---------------------------------------------------------------------------
create table if not exists public.pedidos (
  id                  uuid          default gen_random_uuid() primary key,
  tenant_id           uuid          not null references public.tenants(id) on delete cascade,
  contact_id          uuid          references public.contacts(id) on delete set null,

  -- Dados do cliente
  cliente_nome        text,
  cliente_telefone    text,
  cliente_cnpj        text,
  cliente_cep         text,
  cliente_endereco    text,
  cliente_cidade      text,
  cliente_estado      text,
  cliente_logo_url    text,

  -- Financeiro
  frete               numeric(12,2) not null default 0,
  desconto            numeric(12,2) not null default 0,
  prazo_entrega       text          not null default '15 a 20 dias úteis',

  -- Controle
  status              text          not null default 'rascunho'
                        check (status in ('rascunho', 'finalizado', 'cancelado')),
  total               numeric(12,2) not null default 0,

  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

-- ---------------------------------------------------------------------------
-- Itens do pedido (um por modelo/referência de calçado)
-- ---------------------------------------------------------------------------
create table if not exists public.pedido_itens (
  id              uuid          default gen_random_uuid() primary key,
  pedido_id       uuid          not null references public.pedidos(id) on delete cascade,

  -- Produto
  foto_url        text,
  cores           text          not null default '',
  valor_unitario  numeric(12,2) not null default 0,

  -- Grade de numerações (34 a 40) armazenada como JSONB
  -- Exemplo: {"34":2,"35":4,"36":3,"37":1,"38":0,"39":0,"40":0}
  grade           jsonb         not null default '{"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0}',

  -- Totais calculados pela aplicação ao salvar
  total_pares     integer       not null default 0,
  subtotal        numeric(12,2) not null default 0,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------------
alter table public.pedidos      enable row level security;
alter table public.pedido_itens enable row level security;

-- Política: usuário só acessa pedidos do próprio tenant
create policy "tenant_pedidos" on public.pedidos
  for all
  using (
    tenant_id = (
      select tenant_id
      from public.profiles
      where id = auth.uid()
    )
  );

-- Política: usuário só acessa itens de pedidos do próprio tenant
create policy "tenant_pedido_itens" on public.pedido_itens
  for all
  using (
    pedido_id in (
      select id
      from public.pedidos
      where tenant_id = (
        select tenant_id
        from public.profiles
        where id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Índices para performance
-- ---------------------------------------------------------------------------
create index if not exists idx_pedidos_tenant_id
  on public.pedidos (tenant_id);

create index if not exists idx_pedidos_status
  on public.pedidos (status);

create index if not exists idx_pedidos_created_at
  on public.pedidos (created_at desc);

create index if not exists idx_pedido_itens_pedido_id
  on public.pedido_itens (pedido_id);

-- ---------------------------------------------------------------------------
-- Trigger: atualiza updated_at automaticamente
-- ---------------------------------------------------------------------------
-- (Reutiliza a função set_updated_at() se já existir, cria caso contrário)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pedidos_updated_at
  before update on public.pedidos
  for each row execute function public.set_updated_at();

create trigger pedido_itens_updated_at
  before update on public.pedido_itens
  for each row execute function public.set_updated_at();
