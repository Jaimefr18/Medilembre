insert into pharmacies (id, name, phone, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'Farmácia Alfa', '+244900000001', 'Africa/Luanda'),
  ('22222222-2222-2222-2222-222222222222', 'Farmácia Beta', '+244900000002', 'Africa/Luanda')
on conflict do nothing;
insert into customers (id, pharmacy_id, name, phone) values
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Ana (Alfa)', '+244911000001'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'Bento (Alfa)', '+244911000002'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Carla (Beta)', '+244922000001'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', 'Davi (Beta)', '+244922000002');
