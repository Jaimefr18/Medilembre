-- MediLembre · envio de lembretes do cliente (um registo por lembrete e por dia).
-- Escrito só pelo worker (role admin, que ignora RLS). A API (medilembre_app) não tem acesso:
-- por isso não há GRANT. RLS fica ativa por defesa em profundidade.
create table client_reminder_sends (
  id              uuid primary key default gen_random_uuid(),
  pharmacy_id     uuid not null references pharmacies(id),
  reminder_id     uuid not null references client_reminders(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  day             date not null,                 -- dia local da farmácia
  due_at          timestamptz not null,          -- instante exato (UTC) do lembrete
  status          text not null default 'pending'
                  check (status in ('pending','sent','failed','skipped','no_subscription','expired')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (reminder_id, day)                      -- idempotência: nunca duas vezes no mesmo dia
);
create index client_reminder_sends_pending_idx
  on client_reminder_sends (next_attempt_at) where status = 'pending';

alter table client_reminder_sends enable row level security;
alter table client_reminder_sends force row level security;
create policy tenant on client_reminder_sends
  using (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid)
  with check (pharmacy_id = nullif(current_setting('app.pharmacy_id', true), '')::uuid);
