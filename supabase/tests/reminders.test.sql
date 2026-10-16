-- Recordatorios diarios: solo los dispara el cron, nunca un cliente por la
-- API, y la URL de la edge function sale de Vault cuando el proyecto es real.
begin;
select plan(4);

set local role anon;
select throws_ok(
  'select public.send_appointment_reminders()',
  '42501', null,
  'anon no puede disparar los recordatorios por RPC'
);
reset role;

set local role authenticated;
select throws_ok(
  'select public.send_appointment_reminders()',
  '42501', null,
  'un usuario logueado tampoco puede dispararlos'
);
reset role;

select is(
  public.edge_functions_base_url(),
  'http://kong:8000/functions/v1',
  'sin secret project_url en Vault usa el Kong del stack local'
);

select vault.create_secret('https://abcd1234.supabase.co', 'project_url');
select is(
  public.edge_functions_base_url(),
  'https://abcd1234.supabase.co/functions/v1',
  'con project_url en Vault apunta al proyecto real'
);

select * from finish();
rollback;
