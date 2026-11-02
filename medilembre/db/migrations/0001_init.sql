-- MediLembre: schema inicial + RLS por pharmacy_id
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'medilembre_app') then
    create role medilembre_app login;
  end if;
end $$;

create table pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null, nif text, phone text,
  status text not null default 'trial',
  timezone text not null default 'Africa/Luanda',
  created_at timestamptz not null default now()
);

-- pharmacy_users e sessions: consultadas no login, antes de existir tenant -> sem RLS (só o módulo auth lhes toca)
create table pharmacy_users (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  name text not null, email text not null unique,
  role text not null default 'pharmacist' check (role in ('admin','pharmacist')),
  password_hash text not null
);
create table sessions (
  id text primary key,
  user_id uuid not null references pharmacy_users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  name text not null, phone text, email text,
  status text not null default 'active'
);
create table medication_plans (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  start_date date not null, end_date date not null,
  status text not null default 'rascunho'
);
create table plan_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  plan_id uuid not null references medication_plans on delete cascade,
  medication text not null, dosage text,
  schedule_rule text not null default 'daily',
  times_local time[] not null
);
create table reminders (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  plan_item_id uuid not null references plan_items on delete cascade,
  due_at_utc timestamptz not null,
  status text not null default 'pending',
  confirmed_at timestamptz,
  unique (plan_item_id, due_at_utc)
);
create index reminders_due_idx on reminders (status, due_at_utc);
create table activation_tokens (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  plan_id uuid not null references medication_plans on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null, used_at timestamptz
);
create table consents (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  type text not null, granted boolean not null, granted_at timestamptz not null default now()
);
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  platform text, last_ok_at timestamptz
);
create table reservations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  customer_id uuid not null references customers on delete cascade,
  plan_id uuid references medication_plans,
  status text not null default 'pending',
  requested_at timestamptz not null default now(), decided_at timestamptz
);
create table delivery_logs (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  reminder_id uuid not null references reminders on delete cascade,
  channel text not null, result text not null, attempted_at timestamptz not null default now()
);
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references pharmacies on delete cascade,
  actor text not null, action text not null, at timestamptz not null default now()
);

-- Spike de Web Push (dias 2-3). Sem dados pessoais; apagar depois do go/no-go.
create table spike_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique, p256dh text not null, auth text not null,
  user_agent text, created_at timestamptz not null default now()
);
create table spike_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references spike_subscriptions on delete cascade,
  label text, due_at timestamptz not null, sent_at timestamptz, result text
);

-- RLS: a API define app.pharmacy_id por transação; sem isso, zero linhas.
alter table pharmacies enable row level security;
alter table pharmacies force row level security;
create policy tenant on pharmacies
  using (id = nullif(current_setting('app.pharmacy_id', true), '')::uuid);

do $$
declare t text;
begin
  foreach t in array array['customers','medication_plans','plan_items','reminders','activation_tokens',
    'consents','push_subscriptions','reservations','delivery_logs','audit_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format($p$create policy tenant on %I
      using (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid)
      with check (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid)$p$, t);
  end loop;
end $$;

grant usage on schema public to medilembre_app;
grant select, insert, update, delete on all tables in schema public to medilembre_app;
