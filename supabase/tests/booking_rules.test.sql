-- Reglas de la capa de datos que no pueden depender de la UI: privacidad de
-- datos personales, doble reserva, anticipación y autogestión por token.
-- Corre con `pnpm db:test` (pgTAP, cada archivo en una transacción que se
-- descarta al final). Usa el negocio demo de supabase/seed.sql.
begin;
select plan(13);

-- Datos de prueba: un servicio de 45 min del negocio demo y un empleado.
create temp table ctx on commit drop as
select b.id as biz_id,
       (select id from public.services where business_id = b.id and duration_minutes = 45 limit 1) as svc_id,
       (select id from public.staff where business_id = b.id order by name limit 1) as staff_id,
       -- Un lunes a 8-14 días (abierto, lejos de los turnos del seed).
       (current_date + (8 - extract(isodow from current_date))::int + 7) as day
from public.businesses b where b.slug = 'demo';
grant select on ctx to anon;

-- --- Alta de negocio por trigger -----------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'nuevo@turnopro.local', '{"business_name":"Peluquería Ñandú"}');

select is(
  (select slug from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000aa'),
  'peluqueria-nandu-00000000',
  'el signup crea el negocio con slug sin acentos'
);

-- --- Privacidad: anon no ve datos personales ------------------------------
insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
select biz_id, svc_id, staff_id, 'Ana', '1155550000', day, '10:00', '10:45' from ctx;

set local role anon;

select throws_ok(
  'select client_name from public.appointments',
  '42501', null,
  'anon no puede leer client_name de appointments'
);
select throws_ok(
  'select client_phone from public.appointments',
  '42501', null,
  'anon no puede leer client_phone de appointments'
);
select lives_ok(
  $$select * from public.get_booked_slots((select biz_id from ctx), (select day from ctx))$$,
  'anon sí puede ver horarios ocupados para calcular disponibilidad (por RPC)'
);
select throws_ok(
  'select email, phone from public.staff',
  '42501', null,
  'anon no puede leer contacto personal del staff'
);
select throws_ok(
  $$insert into public.whatsapp_messages (business_id, message_type, to_phone, body, status)
    select biz_id, 'confirmation', '1', 'x', 'sent' from ctx$$,
  '42501', null,
  'anon no puede fabricar registros de WhatsApp enviados'
);

-- --- Doble reserva ---------------------------------------------------------
select throws_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select biz_id, svc_id, staff_id, 'Beto', '1155550001', day, '10:00', '10:45' from ctx$$,
  null, null,
  'mismo empleado, misma hora de inicio: rechazado'
);
select throws_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select biz_id, svc_id, staff_id, 'Caro', '1155550002', day, '10:30', '11:15' from ctx$$,
  null, null,
  'mismo empleado, turno que se superpone (10:30 con uno de 10:00 a 10:45): rechazado'
);
select lives_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select biz_id, svc_id, staff_id, 'Dani', '1155550003', day, '10:45', '11:30' from ctx$$,
  'turno que empieza justo cuando termina el anterior: permitido'
);

-- --- Anticipación ----------------------------------------------------------
reset role;
update public.businesses set min_lead_hours = 168 where id = (select biz_id from ctx);
set local role anon;

select throws_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select biz_id, svc_id, staff_id, 'Eli', '1155550004', day - 7, '15:00', '15:45' from ctx$$,
  '23514', null,
  'reserva con menos anticipación que min_lead_hours: rechazada'
);

-- --- Autogestión por token -------------------------------------------------
reset role;
update public.businesses set min_lead_hours = 0 where id = (select biz_id from ctx);
create temp table tok on commit drop as
select manage_token from public.appointments where client_name = 'Ana';
grant select on tok to anon;
set local role anon;

select is(
  (select client_name from public.get_appointment_by_token((select manage_token from tok))),
  'Ana',
  'con el token el cliente ve su propio turno'
);
select is(
  public.cancel_appointment_by_token(gen_random_uuid()),
  false,
  'un token inventado no cancela nada'
);
select is(
  public.cancel_appointment_by_token((select manage_token from tok)),
  true,
  'con el token correcto el cliente cancela su turno'
);

select * from finish();
rollback;
