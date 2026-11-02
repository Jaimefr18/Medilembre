-- MediLembre · app do cliente: login, sessões, lembretes, reservas, push.
-- Requer 0001_init.sql (pharmacies, customers, role medilembre_app).
-- Prefixo client_ APENAS nas 4 tabelas que colidiam com o 0001 (sessions, reminders,
-- reservations, push_subscriptions). As restantes mantêm o nome: já são específicas do domínio.
-- Sem "if not exists": se alguma tabela já existir, a migração deve falhar alto em vez de
-- ficar calada com a definição antiga.

-- Tabelas de autenticação: sem RLS (são lidas ANTES de saber a farmácia). Só guardam hashes.
create table customer_logins (
  customer_id   uuid primary key references customers(id) on delete cascade,
  pharmacy_id   uuid not null references pharmacies(id),
  identifier    text not null unique,            -- telemóvel normalizado (244...) ou email em minúsculas
  password_hash text not null,                   -- argon2id
  created_at    timestamptz not null default now()
);

create table client_sessions (
  id_hash     bytea primary key,                 -- sha256 do token do cookie (o token nunca é guardado)
  customer_id uuid not null references customers(id) on delete cascade,
  pharmacy_id uuid not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index client_sessions_expires_idx on client_sessions (expires_at);

create table activation_codes (
  code_hash   bytea primary key,                 -- sha256 do código do QR
  customer_id uuid not null references customers(id) on delete cascade,
  pharmacy_id uuid not null,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Tabelas de dados: RLS por farmácia (+ por cliente quando a app do cliente corre).
create table pharmacy_products (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id),
  name        text not null,
  pack        text not null default '',
  active      boolean not null default true
);

-- Não confundir com `reminders` do 0001 (ligado a plan_items). Unificação adiada.
create table client_reminders (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  dose        text not null default '' check (length(dose) <= 80),
  at_time     time not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index client_reminders_customer_idx on client_reminders (customer_id, at_time);

create table dose_logs (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  reminder_id uuid not null references client_reminders(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  day         date not null,                     -- dia em Africa/Luanda
  taken_at    timestamptz not null default now(),
  unique (reminder_id, day)
);

-- Não confundir com `reservations` do 0001 (ligado a plan_id).
create table client_reservations (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references pharmacy_products(id),
  status      text not null default 'pendente'
              check (status in ('pendente','confirmada','recusada','cancelada')),
  created_at  timestamptz not null default now()
);
create unique index client_reservations_open_idx
  on client_reservations (customer_id, product_id) where status = 'pendente';

-- Não confundir com `push_subscriptions` do 0001 (ligado a customer + plano da farmácia).
create table client_push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  customer_id uuid not null references customers(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['pharmacy_products','client_reminders','dose_logs','client_reservations','client_push_subscriptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant on %I
      using (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid)
      with check (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid)$p$, t);
  end loop;
  -- Restritiva: quando app.customer_id está definido, o cliente só vê as suas linhas.
  -- O painel da farmácia (sem app.customer_id) continua a ver a farmácia toda.
  foreach t in array array['client_reminders','dose_logs','client_reservations','client_push_subscriptions'] loop
    execute format($p$create policy own_customer on %I as restrictive
      using (nullif(current_setting('app.customer_id', true), '') is null
             or customer_id = nullif(current_setting('app.customer_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

-- O grant do 0001 só cobriu as tabelas que existiam nesse momento. Sem isto, a API
-- (role medilembre_app) falha com "permission denied for table ...".
grant select, insert, update, delete on
  customer_logins, client_sessions, activation_codes, pharmacy_products,
  client_reminders, dose_logs, client_reservations, client_push_subscriptions
to medilembre_app;