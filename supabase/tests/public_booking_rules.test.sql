-- Fase 1: la base es el límite real de la reserva pública. Cada test
-- corresponde a una amenaza de .planning/phases/01-endurecer-reserva/01-PLAN.md.
begin;
select plan(37);

-- --- Fixtures (como postgres) ----------------------------------------------
-- Un lunes a 8-14 días: lejos de los turnos del seed. Lunes: negocio 09-19,
-- Fede y Nico 09-18.
create temp table ctx on commit drop as
select b.id as biz_id,
       b.owner_id,
       (select id from public.services where business_id = b.id and name = 'Corte clásico') as svc_id,      -- 30 min
       (select id from public.staff where business_id = b.id and name = 'Fede') as fede,
       (select id from public.staff where business_id = b.id and name = 'Nico') as nico,
       (current_date + (8 - extract(isodow from current_date))::int + 7) as monday
from public.businesses b where b.slug = 'demo';

-- Otro negocio con su servicio y su empleado, y un servicio inactivo del demo.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'ajeno@turnopro.local', '{"business_name":"Otro"}');
alter table ctx add column other_biz uuid, add column other_svc uuid, add column other_staff uuid,
                add column inactive_svc uuid;
update ctx set other_biz = (select id from public.businesses where owner_id = '00000000-0000-0000-0000-0000000000bb');
insert into public.services (business_id, name, duration_minutes, price) select other_biz, 'Ajeno', 30, 1 from ctx;
insert into public.staff (business_id, name) select other_biz, 'Ajena' from ctx;
insert into public.services (business_id, name, duration_minutes, price, is_active) select biz_id, 'Viejo', 30, 1, false from ctx;
update ctx set other_svc = (select id from public.services where name = 'Ajeno'),
               other_staff = (select id from public.staff where name = 'Ajena'),
               inactive_svc = (select id from public.services where name = 'Viejo');
-- Bloqueos: el negocio cierra el martes; Nico falta el lunes.
insert into public.schedule_blocks (business_id, staff_id, block_date) select biz_id, null, monday + 1 from ctx;
insert into public.schedule_blocks (business_id, staff_id, block_date) select biz_id, nico, monday from ctx;
grant select on ctx to anon, authenticated;

-- Atajo para insertar como cliente en el negocio demo (schema descartable,
-- se va con el rollback).
create schema t;
create function t.book(p_name text, p_svc uuid, p_staff uuid, p_date date, p_start time, p_end time,
                             p_status public.appointment_status default 'pending', p_phone text default '1155550000')
returns void language sql as $fn$
  insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone,
                                   appointment_date, start_time, end_time, status)
  select biz_id, p_svc, p_staff, p_name, p_phone, p_date, p_start, p_end, p_status from ctx;
$fn$;
grant usage on schema t to anon, authenticated;
grant execute on function t.book to anon, authenticated;

-- --- Hora local del negocio (T11) ------------------------------------------
select is(
  public.appointment_starts_at((select biz_id from ctx), '2026-10-20', '10:00'),
  '2026-10-20 13:00:00+00'::timestamptz,
  'T11: las 10:00 de un negocio en Buenos Aires son las 13:00 UTC'
);

-- --- Como cliente anónimo --------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- T1 / T3: estado y fin los decide la base.
select lives_ok(
  $$select t.book('T1', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '10:00', '23:59', 'completed')$$,
  'una reserva válida entra aunque mande status y fin inventados'
);
-- T6: campos internos.
select throws_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time, notes)
    select biz_id, svc_id, fede, 'T6', '1155550000', monday, '11:00', '11:30', 'nota falsa' from ctx$$,
  '23514', null,
  'T6: el cliente no puede escribir notas internas'
);

-- T2: horarios.
select throws_ok(
  $$select t.book('T2a', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '08:00', '08:30')$$,
  '23514', null, 'T2: antes de que abra el negocio: rechazado'
);
select throws_ok(
  $$select t.book('T2b', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '18:15', '18:45')$$,
  '23514', null, 'T2: fuera del horario del empleado (aunque el negocio siga abierto): rechazado'
);
select throws_ok(
  $$select t.book('T2c', (select svc_id from ctx), (select fede from ctx), (select monday from ctx) - 1, '10:00', '10:30')$$,
  '23514', null, 'T2: domingo, negocio cerrado: rechazado'
);
select throws_ok(
  $$select t.book('T2d', (select svc_id from ctx), (select fede from ctx), (select monday from ctx) + 1, '10:00', '10:30')$$,
  '23514', null, 'T2: día bloqueado para todo el negocio: rechazado'
);
select throws_ok(
  $$select t.book('T2e', (select svc_id from ctx), (select nico from ctx), (select monday from ctx), '10:00', '10:30')$$,
  '23514', null, 'T2: día bloqueado para ese empleado: rechazado'
);

-- T4: pertenencia.
select throws_ok(
  $$select t.book('T4a', (select other_svc from ctx), (select fede from ctx), (select monday from ctx), '12:00', '12:30')$$,
  '23514', null, 'T4: servicio de otro negocio: rechazado'
);
select throws_ok(
  $$select t.book('T4b', (select inactive_svc from ctx), (select fede from ctx), (select monday from ctx), '12:00', '12:30')$$,
  '23514', null, 'T4: servicio inactivo: rechazado'
);
select throws_ok(
  $$select t.book('T4c', (select svc_id from ctx), (select other_staff from ctx), (select monday from ctx), '12:00', '12:30')$$,
  '23514', null, 'T4: empleado de otro negocio: rechazado'
);
select throws_ok(
  $$select t.book('T4d', (select svc_id from ctx), null, (select monday from ctx), '12:00', '12:30')$$,
  '23514', null, 'T4: negocio con personal y turno sin empleado: rechazado'
);

-- T7: datos del cliente.
select throws_ok(
  $$select t.book(repeat('x', 101), (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '13:00', '13:30')$$,
  '23514', null, 'T7: nombre de más de 100 caracteres: rechazado'
);
select throws_ok(
  $$select t.book('T7b', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '13:00', '13:30', 'pending', 'llamame')$$,
  '23514', null, 'T7: teléfono que no es un teléfono: rechazado'
);

-- T9: sin lectura directa de turnos; la disponibilidad sale del RPC.
select throws_ok(
  'select start_time from public.appointments',
  '42501', null, 'T9: anon ya no lee la tabla de turnos'
);
select results_eq(
  $$select staff_id, start_time, end_time from public.get_booked_slots((select biz_id from ctx), (select monday from ctx))$$,
  $$select fede, '10:00'::time, '10:30'::time from ctx$$,
  'T9: get_booked_slots devuelve solo empleado, inicio y fin'
);

-- --- Como postgres: lo que quedó guardado ----------------------------------
reset role;
select results_eq(
  $$select status::text, end_time, notes, reminder_sent_at from public.appointments where client_name = 'T1'$$,
  $$values ('pending'::text, '10:30'::time, null::text, null::timestamptz)$$,
  'T1/T3: quedó pendiente y con fin = inicio + duración del servicio'
);

-- T5: buffer de 15 min.
update public.businesses set buffer_minutes = 15 where id = (select biz_id from ctx);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select t.book('T5a', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '10:30', '11:00')$$,
  '23P01', null, 'T5: pegado al turno anterior sin respetar el buffer: rechazado'
);
select lives_ok(
  $$select t.book('T5b', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '10:45', '11:15')$$,
  'T5: respetando el buffer: permitido'
);
reset role;
update public.businesses set buffer_minutes = 0 where id = (select biz_id from ctx);

-- --- T8: reprogramar por token ---------------------------------------------
create temp table tok on commit drop as
select manage_token from public.appointments where client_name = 'T1';
grant select on tok to anon;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.reschedule_appointment_by_token((select manage_token from tok), (select monday from ctx), '07:00', '07:30')$$,
  '23514', null, 'T8: reprogramar fuera de horario: rechazado'
);
select is(
  public.reschedule_appointment_by_token((select manage_token from tok), (select monday from ctx), '15:00', '22:00'),
  true, 'T8: reprogramar a un horario válido funciona'
);
reset role;
select is(
  (select end_time from public.appointments where client_name = 'T1'),
  '15:30'::time,
  'T8: el fin lo recalcula la base, no el p_new_end del cliente'
);

-- --- T12: cliente con sesión abierta (dueño de otro negocio) ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000bb"}', true);
select lives_ok(
  $$select t.book('T12', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '16:00', '16:30', 'confirmed')$$,
  'T12: con sesión de otro negocio se puede reservar'
);
select ok(
  (select count(*) from public.get_booked_slots((select biz_id from ctx), (select monday from ctx))) >= 2,
  'T12: y ve los horarios ocupados'
);
select is(
  (select count(*)::int from public.appointments where client_name = 'T12'),
  0,
  'T12: pero no puede leer el turno (ni ningún dato personal) del otro negocio'
);
-- La página pública tiene que cargar igual que para anon.
select is(
  (select count(*)::int from public.businesses where slug = 'demo'),
  1, 'T12: ve el negocio por slug'
);
select ok(
  (select count(*) from public.services where business_id = (select biz_id from ctx)) >= 3
  and (select count(*) from public.business_hours where business_id = (select biz_id from ctx)) = 7
  and (select count(*) from public.staff_schedules where staff_id = (select fede from ctx)) = 6
  and (select count(*) from public.schedule_blocks where business_id = (select biz_id from ctx)) = 2,
  'T12: ve servicios, horarios, horarios del personal y bloqueos'
);
select results_eq(
  $$select name from public.get_public_staff((select biz_id from ctx)) order by name$$,
  $$values ('Fede'::text), ('Nico'::text)$$,
  'T12: ve el personal activo por RPC'
);
select is(
  (select count(*)::int from public.staff where business_id = (select biz_id from ctx)),
  0, 'T12: pero no lee la tabla staff del otro negocio (email/teléfono del personal)'
);
reset role;
select is(
  (select status::text from public.appointments where client_name = 'T12'),
  'pending',
  'T12: y el estado igual queda pendiente'
);

-- --- Dueño: exento (carga a mano / walk-in) --------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}', true);
select lives_ok(
  $$select t.book('Dueño', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '08:00', '08:30', 'confirmed')$$,
  'el dueño puede cargar un turno fuera de horario'
);
reset role;

-- --- Hallazgos de la revisión de seguridad (01-SECURITY.md) ----------------
-- T4 entre negocios: el dueño de otro negocio no puede colgar turnos del
-- servicio o del empleado de un tercero (le bloquearía la agenda sin que
-- el negocio afectado lo vea).
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000bb"}', true);
select throws_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select other_biz, svc_id, fede, 'Cruzado', '1155550000', monday + 7, '00:00', '23:59' from ctx$$,
  '23503', null,
  'T4: el dueño de otro negocio no puede usar el empleado ni el servicio del demo'
);
select lives_ok(
  $$insert into public.appointments (business_id, service_id, staff_id, client_name, client_phone, appointment_date, start_time, end_time)
    select other_biz, other_svc, other_staff, 'Propio', '1155550000', monday, '10:00', '10:30' from ctx$$,
  'T4: sí puede cargar turnos con su propio servicio y empleado'
);
select throws_ok(
  $$update public.appointments set staff_id = (select fede from ctx) where client_name = 'Propio'$$,
  '23503', null,
  'T4: ni moverlos después a un empleado ajeno'
);
reset role;

-- W1: la disponibilidad solo se puede pedir para la ventana en que se
-- puede reservar (hoy .. hoy + max_lead_days), no para el historial.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from public.get_booked_slots((select biz_id from ctx), current_date - 1)),
  0, 'W1: no devuelve turnos de días pasados'
);
select is(
  (select count(*)::int from public.get_booked_slots((select biz_id from ctx), current_date + 400)),
  0, 'W1: ni más allá de max_lead_days'
);
reset role;

-- W3: sin claims de JWT, el rol de la sesión (SET ROLE) también cuenta como cliente.
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$select t.book('SinClaims', (select svc_id from ctx), (select fede from ctx), (select monday from ctx), '03:00', '23:00', 'completed')$$,
  '23514', null,
  'W3: anon sin JWT no queda exento de las reglas'
);
reset role;

select * from finish();
rollback;
