alter table client_reminders
  add column start_date date not null default ((now() at time zone 'Africa/Luanda')::date),
  add column end_date date,
  add constraint client_reminders_range check (end_date is null or end_date >= start_date);
update client_reminders set start_date = (created_at at time zone 'Africa/Luanda')::date;
