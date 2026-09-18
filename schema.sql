-- ============================================================
-- MISSÃO FAMÍLIA — Schema do Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (https://app.supabase.com/project/mnkpfnofxbotmsmhcody/sql/new)
-- ============================================================

create extension if not exists "pgcrypto";

-- Famílias -----------------------------------------------------
create table if not exists families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  code          text not null unique,        -- código de 6 caracteres p/ vincular aparelhos
  parent_pin    text not null,                -- senha numérica do(s) responsável(is)
  created_at    timestamptz not null default now()
);

-- Crianças -------------------------------------------------------
create table if not exists children (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families(id) on delete cascade,
  name            text not null,
  avatar          text not null default '🦊',
  pin             text not null default '0000', -- pin simples de 4 dígitos (opcional no acesso)
  points          integer not null default 0,
  streak_days     integer not null default 0,
  streak_level    integer not null default 1,   -- 1, 2 ou 3 (máximo)
  last_task_date  date,
  created_at      timestamptz not null default now()
);

-- Tarefas ----------------------------------------------------------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references families(id) on delete cascade,
  child_id     uuid references children(id) on delete cascade, -- null = tarefa para todas as crianças
  title        text not null,
  icon         text not null default '⭐',
  points       integer not null default 10,
  frequency    text not null default 'daily', -- 'daily' | 'once'
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Registros de cumprimento de tarefa (uma linha por dia/tarefa/criança) ----
create table if not exists task_completions (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references tasks(id) on delete cascade,
  child_id       uuid not null references children(id) on delete cascade,
  family_id      uuid not null references families(id) on delete cascade,
  task_date      date not null default current_date,
  status         text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  points_awarded integer not null default 0,
  submitted_at   timestamptz not null default now(),
  resolved_at    timestamptz,
  unique (task_id, child_id, task_date)
);

-- Loja de prêmios ----------------------------------------------------
create table if not exists rewards (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  title       text not null,
  icon        text not null default '🎁',
  cost        integer not null default 50,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Resgates ------------------------------------------------------------
create table if not exists redemptions (
  id            uuid primary key default gen_random_uuid(),
  reward_id     uuid not null references rewards(id) on delete cascade,
  child_id      uuid not null references children(id) on delete cascade,
  family_id     uuid not null references families(id) on delete cascade,
  cost          integer not null default 0,
  status        text not null default 'pending', -- 'pending' | 'delivered'
  requested_at  timestamptz not null default now(),
  delivered_at  timestamptz
);

create index if not exists idx_children_family on children(family_id);
create index if not exists idx_tasks_family on tasks(family_id);
create index if not exists idx_completions_family on task_completions(family_id);
create index if not exists idx_completions_status on task_completions(family_id, status);
create index if not exists idx_rewards_family on rewards(family_id);
create index if not exists idx_redemptions_family on redemptions(family_id, status);

-- Realtime (para sincronizar pai/filho em aparelhos diferentes) -------
alter publication supabase_realtime add table families, children, tasks, task_completions, rewards, redemptions;

-- ============================================================
-- RLS — modo simplificado para uso familiar
-- Cada família só é acessível por quem tem o CÓDIGO da família,
-- e a chave usada no app é a "publishable/anon key" (somente leitura
-- de estrutura, sem privilégio de administrador).
-- Isso é suficiente para um MVP de uso doméstico, mas não é um
-- isolamento multi-tenant de nível empresarial: qualquer pessoa
-- com o código da família consegue ler/escrever os dados dela.
-- Para produção real, recomenda-se Supabase Auth + policies por
-- usuário autenticado.
-- ============================================================
alter table families enable row level security;
alter table children enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table rewards enable row level security;
alter table redemptions enable row level security;

drop policy if exists "public rw families" on families;
create policy "public rw families" on families for all using (true) with check (true);

drop policy if exists "public rw children" on children;
create policy "public rw children" on children for all using (true) with check (true);

drop policy if exists "public rw tasks" on tasks;
create policy "public rw tasks" on tasks for all using (true) with check (true);

drop policy if exists "public rw task_completions" on task_completions;
create policy "public rw task_completions" on task_completions for all using (true) with check (true);

drop policy if exists "public rw rewards" on rewards;
create policy "public rw rewards" on rewards for all using (true) with check (true);

drop policy if exists "public rw redemptions" on redemptions;
create policy "public rw redemptions" on redemptions for all using (true) with check (true);
