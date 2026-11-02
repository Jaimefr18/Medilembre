-- SÓ DESENVOLVIMENTO. Código de ativação de teste: 8F72KQ (cliente da farmácia Alfa).
insert into activation_codes (code_hash, customer_id, pharmacy_id, expires_at)
select sha256(convert_to('8F72KQ','UTF8')), id, pharmacy_id, now() + interval '30 days'
from customers where name like '%(Alfa)%' order by name limit 1
on conflict do nothing;

insert into pharmacy_products (pharmacy_id, name, pack)
select '11111111-1111-1111-1111-111111111111', v.n, v.p
from (values ('Losartana 50 mg','Caixa com 30 comprimidos'),('Metformina 500 mg','Caixa com 60 comprimidos')) v(n,p)
where not exists (select 1 from pharmacy_products where pharmacy_id = '11111111-1111-1111-1111-111111111111');