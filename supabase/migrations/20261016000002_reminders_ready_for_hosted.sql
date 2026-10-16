-- Recordatorios listos para un proyecto Supabase real, sin tocar código.
--
-- 1. La URL de las edge functions estaba fija al Kong del stack local
--    (http://kong:8000). Ahora se lee de Vault: con los secrets
--    `project_url` y `anon_key` cargados (ver README, "Activar en un
--    proyecto real") el cron le pega al proyecto de verdad, con el header
--    Authorization que exige verify_jwt. Sin esos secrets sigue andando
--    igual que antes en local.
-- 2. send_appointment_reminders() se podía ejecutar por RPC desde anon y
--    authenticated (Postgres da EXECUTE a PUBLIC por defecto). La
--    idempotencia de send-whatsapp evitaba duplicados, pero igual no tiene
--    sentido que un cliente dispare envíos: ahora solo lo corre el cron.

CREATE OR REPLACE FUNCTION public.edge_functions_base_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT rtrim(decrypted_secret, '/') || '/functions/v1'
       FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1),
    'http://kong:8000/functions/v1'
  );
$$;

CREATE OR REPLACE FUNCTION public.send_appointment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt RECORD;
  base_url TEXT := public.edge_functions_base_url();
  api_key TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1);
  req_headers JSONB := jsonb_build_object('Content-Type', 'application/json');
BEGIN
  IF api_key IS NOT NULL THEN
    req_headers := req_headers || jsonb_build_object('Authorization', 'Bearer ' || api_key);
  END IF;

  FOR appt IN
    SELECT a.id
    FROM public.appointments a
    JOIN public.whatsapp_configs wc ON wc.business_id = a.business_id AND wc.is_active = true
    WHERE a.appointment_date = (CURRENT_DATE + INTERVAL '1 day')::date
      AND a.status IN ('pending', 'confirmed')
      AND a.reminder_sent_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := base_url || '/send-whatsapp',
      headers := req_headers,
      body := jsonb_build_object('appointment_id', appt.id, 'message_type', 'reminder')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_appointment_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.edge_functions_base_url() FROM PUBLIC, anon, authenticated;
