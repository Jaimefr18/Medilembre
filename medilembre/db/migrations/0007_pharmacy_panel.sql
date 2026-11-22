-- MediLembre · painel da farmácia: códigos de ativação vs. recuperação de senha.
-- `activate` cria a conta (QR da farmácia); `reset` define uma senha nova para uma conta existente.
alter table activation_codes
  add column if not exists kind text not null default 'activate' check (kind in ('activate', 'reset'));

-- [Etapa 1] client_reminders.group_id: base para agrupamento de doses multi-dose na Fase 2
alter table client_reminders
  add column if not exists group_id uuid;

create index if not exists client_reminders_group_id_idx on client_reminders (group_id) where group_id is not null;
