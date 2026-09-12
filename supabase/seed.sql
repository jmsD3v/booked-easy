-- Local-dev-only seed data: one demo business at /b/demo with real services,
-- staff and hours, so "Ver demo" on the landing page and the review/testing
-- workflow have something real to click through. Never run against a
-- production project — this creates a fake auth.users row directly.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
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
  now(), now()
);

-- The on_auth_user_created_business trigger already created a business row
-- with a random slug — point it at the friendly "/b/demo" slug instead.
update public.businesses
set slug = 'demo',
    description = 'Cortes clásicos y degradados. Turnos de lunes a sábado.',
    phone = '+54 9 11 5555-0123',
    category = 'barberia'
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
