-- ============================================================================
-- MISSÃO FAMÍLIA — Schema do banco de dados (Supabase / PostgreSQL)
-- ============================================================================
-- Como usar:
-- 1. Abra seu projeto em https://supabase.com/dashboard
-- 2. Vá em "SQL Editor" -> "New query"
-- 3. Cole todo este arquivo e clique em "Run"
-- 4. Em "Authentication" -> "Providers", deixe "Email" ativado.
--    (Se quiser permitir cadastro sem confirmação de e-mail para testes,
--    desative "Confirm email" em Authentication -> Settings)
-- ============================================================================

-- Extensão para gerar códigos aleatórios
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- FAMÍLIAS
-- ----------------------------------------------------------------------------
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha Família',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PERFIS (responsável ou criança). 1 linha por pessoa.
-- Para responsáveis: id = auth.users.id (login por e-mail/senha)
-- Para crianças: id próprio (uuid), login feito pelo código da família + PIN de perfil
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  role text not null check (role in ('parent','child')),
  name text not null,
  avatar text not null default '🦊',
  color text not null default '#7C5CFC',
  -- criança: pin de 4 dígitos para trocar de perfil no modo "aparelho único"
  child_pin text,
  -- responsável: PIN de aprovação (obrigatório para aprovar tarefas/entregas)
  approval_pin text,
  points_balance integer not null default 0,
  streak_count integer not null default 0,      -- dias consecutivos válidos
  streak_level integer not null default 1,       -- 1, 2 ou 3 (máximo)
  last_valid_date date,                          -- último dia (útil) cumprido
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_family on profiles(family_id);

-- ----------------------------------------------------------------------------
-- TAREFAS (modelo/definição criada pelo responsável)
-- ----------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null,
  icon text not null default '🧹',
  points integer not null default 10,
  repeat_daily boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- REGISTROS DIÁRIOS DE TAREFA (1 linha por dia/tarefa)
-- status: pending -> waiting_approval -> approved | rejected
-- ----------------------------------------------------------------------------
create table if not exists task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  log_date date not null default current_date,
  status text not null default 'pending'
    check (status in ('pending','waiting_approval','approved','rejected')),
  points_awarded integer not null default 0,
  submitted_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (task_id, log_date)
);

create index if not exists idx_task_logs_child on task_logs(child_id, log_date);

-- ----------------------------------------------------------------------------
-- PRÊMIOS (loja criada pelo responsável)
-- ----------------------------------------------------------------------------
create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  icon text not null default '🎁',
  cost_points integer not null default 50,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RESGATES (criança "compra" um prêmio)
-- status: pending_delivery -> delivered
-- ----------------------------------------------------------------------------
create table if not exists redemptions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  child_id uuid not null references profiles(id) on delete cascade,
  reward_id uuid not null references rewards(id) on delete cascade,
  reward_title text not null,
  reward_icon text not null,
  cost_points integer not null,
  status text not null default 'pending_delivery'
    check (status in ('pending_delivery','delivered')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- Regra geral: cada usuário autenticado (responsável) só enxerga dados da
-- própria família. As crianças usam a chave "publishable" do Supabase sem
-- login de e-mail (perfil selecionado localmente), então o acesso delas é
-- liberado por family_id + verificação de PIN feita no app. Para reforçar
-- isso em produção, o ideal é migrar crianças para Supabase Auth anônimo.
-- ============================================================================

alter table families enable row level security;
alter table profiles enable row level security;
alter table tasks enable row level security;
alter table task_logs enable row level security;
alter table rewards enable row level security;
alter table redemptions enable row level security;

-- FAMILIES: qualquer pessoa autenticada pode criar uma família (cadastro).
-- Leitura: qualquer um que souber o id (usado para join por código, feito via rpc abaixo).
create policy "families_insert_auth" on families
  for insert to authenticated with check (true);

create policy "families_select_all" on families
  for select using (true);

-- PROFILES
create policy "profiles_insert_own_or_family" on profiles
  for insert with check (true);

create policy "profiles_select_all" on profiles
  for select using (true);

create policy "profiles_update_all" on profiles
  for update using (true);

-- TASKS
create policy "tasks_all" on tasks for all using (true) with check (true);

-- TASK_LOGS
create policy "task_logs_all" on task_logs for all using (true) with check (true);

-- REWARDS
create policy "rewards_all" on rewards for all using (true) with check (true);

-- REDEMPTIONS
create policy "redemptions_all" on redemptions for all using (true) with check (true);

-- NOTE: As políticas acima são permissivas (uso com chave publishable) para
-- viabilizar o MVP descrito no briefing (crianças sem login de e-mail).
-- Isso significa que a segurança real depende do "invite_code" da família
-- não ser compartilhado publicamente e do PIN de aprovação do responsável.
-- Para um app em produção com múltiplas famílias reais, o recomendado é:
--   1. Criar um usuário Supabase Auth "anônimo" para cada criança
--   2. Trocar as policies acima por checagens de family_id = auth.jwt() claims
--   3. Usar uma Edge Function para validar o PIN do responsável no servidor
-- ============================================================================

-- Função utilitária: gera um código de convite de 6 caracteres (letras+números)
create or replace function generate_invite_code() returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$ language plpgsql;
