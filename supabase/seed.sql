-- Local-dev-only seed data: one demo business at /b/demo with real services,
-- staff and hours, so "Ver demo" on the landing page and the review/testing
-- workflow have something real to click through. Never run against a
-- production project — this creates a fake auth.users row directly.
-- GoTrue scans confirmation_token/recovery_token/etc. as non-nullable
-- strings — NULL there (the column default) makes every login 500 with
-- "converting NULL to string is unsupported". Set them to '' explicitly.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'demo@turnopro.local',
  crypt('demo12345', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"business_name":"Barbería El Zorro"}',
  '', '', '', '', '', '', '', '',
  now(), now()
);

-- Segundo negocio (vacío): sirve para probar aislamiento entre negocios y
-- reservar en /b/demo con una sesión abierta de otro dueño.
-- Cuenta: otro@turnopro.local / demo12345 (solo local).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  'otro@turnopro.local',
  crypt('demo12345', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"business_name":"Peluquería Luna"}',
  '', '', '', '', '', '', '', '',
  now(), now()
);
update public.businesses set slug = 'luna' where owner_id = '00000000-0000-0000-0000-000000000002';

-- The on_auth_user_created_business trigger already created a business row
-- with a random slug — point it at the friendly "/b/demo" slug instead.
update public.businesses
set slug = 'demo',
    description = 'Cortes clásicos y degradados. Turnos de lunes a sábado.',
    phone = '+54 9 11 5555-0123',
    category = 'barberia',
    payment_alias = 'zorro.barberia.mp',
    payment_note = 'Podés pagar por transferencia al alias o en el local.'
where owner_id = '00000000-0000-0000-0000-000000000001';

do $$
declare
  biz_id uuid;
  staff_1 uuid;
  staff_2 uuid;
begin
  select id into biz_id from public.businesses where slug = 'demo';

  insert into public.services (business_id, name, description, duration_minutes, price)
  values
    (biz_id, 'Corte clásico', 'Corte con máquina y tijera', 30, 6000),
    (biz_id, 'Corte + barba', 'Corte completo y arreglo de barba', 45, 9500),
    (biz_id, 'Afeitado a navaja', 'Afeitado tradicional con toalla caliente', 25, 5500);

  insert into public.staff (business_id, name, is_active)
  values (biz_id, 'Fede', true)
  returning id into staff_1;

  insert into public.staff (business_id, name, is_active)
  values (biz_id, 'Nico', true)
  returning id into staff_2;

  insert into public.staff_schedules (staff_id, day_of_week, start_time, end_time)
  select s.id, d, '09:00', '18:00'
  from (values (staff_1), (staff_2)) as s(id)
  cross join generate_series(1, 6) as d; -- Monday-Saturday

  insert into public.business_hours (business_id, day_of_week, open_time, close_time, is_open)
  values
    (biz_id, 0, '09:00', '18:00', false), -- Sunday closed
    (biz_id, 1, '09:00', '19:00', true),
    (biz_id, 2, '09:00', '19:00', true),
    (biz_id, 3, '09:00', '19:00', true),
    (biz_id, 4, '09:00', '19:00', true),
    (biz_id, 5, '09:00', '20:00', true),
    (biz_id, 6, '09:00', '14:00', true);
end $$;

-- Turnos de demo alrededor de hoy (6 días para atrás, 3 para adelante) para
-- que la agenda, el inicio y las estadísticas del panel no arranquen vacíos.
-- Las fechas son relativas a cuando se corre el seed (`pnpm db:reset`).
-- El trigger de anticipación rechaza turnos en el pasado (correcto para
-- reservas reales), así que se apaga solo mientras se cargan estos datos.
alter table public.appointments disable trigger enforce_appointment_lead_time;

do $$
declare
  biz_id uuid;
  svc uuid[];
  svc_minutes int[];
  staff_ids uuid[];
  clients text[] := array['Martín Gómez', 'Lucía Fernández', 'Diego Pereyra', 'Sofía Romero',
                          'Julián Acosta', 'Valentina Sosa', 'Tomás Herrera', 'Camila Ríos'];
  slots time[] := array['10:00', '11:00', '12:00', '15:00', '16:30'];
  d int;
  s int;
  n int := 0;
  day date;
  svc_idx int;
  appt_status public.appointment_status;
begin
  select id into biz_id from public.businesses where slug = 'demo';
  select array_agg(id order by name), array_agg(duration_minutes order by name)
    into svc, svc_minutes from public.services where business_id = biz_id;
  select array_agg(id order by name) into staff_ids from public.staff where business_id = biz_id;

  for d in -6..3 loop
    day := current_date + d;
    continue when extract(dow from day) = 0; -- domingo cerrado

    for s in 1..array_length(slots, 1) loop
      n := n + 1;
      -- Sábado el negocio cierra a las 14: sin turnos de tarde (el seed corre
      -- como postgres y no pasa por las reglas de la reserva pública).
      continue when extract(dow from day) = 6 and slots[s] >= '13:00';
      -- Variación determinística: no todos los horarios ocupados todos los días.
      continue when (n % 4) = 0;
      svc_idx := 1 + (n % array_length(svc, 1));

      appt_status := case
        when d < 0 and n % 9 = 0 then 'no_show'
        when d < 0 and n % 11 = 0 then 'cancelled'
        when d < 0 then 'completed'
        when n % 3 = 0 then 'pending'
        else 'confirmed'
      end;

      insert into public.appointments (
        business_id, service_id, staff_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) values (
        biz_id, svc[svc_idx], staff_ids[1 + (n % 2)],
        clients[1 + (n % array_length(clients, 1))],
        '+54 9 11 5555-' || lpad((1000 + n)::text, 4, '0'),
        day, slots[s], slots[s] + make_interval(mins => svc_minutes[svc_idx]),
        appt_status
      );
    end loop;
  end loop;
end $$;

alter table public.appointments enable trigger enforce_appointment_lead_time;
