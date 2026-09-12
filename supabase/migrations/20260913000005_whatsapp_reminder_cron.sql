-- Daily reminder job: finds tomorrow's non-cancelled appointments for
-- businesses with WhatsApp enabled and calls send-whatsapp for each.
--
-- EDGE_FUNCTION_BASE below is local-only: Kong's internal address on the
-- Supabase Docker network. Deploying this to a real Supabase project means
-- changing this one constant to
-- 'https://<project-ref>.supabase.co/functions/v1' — a real project would
-- also need its edge function's SUPABASE_SERVICE_ROLE_KEY set as a proper
-- secret rather than reachable with no auth the way local Kong is.
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.send_appointment_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  appt RECORD;
  base_url CONSTANT TEXT := 'http://kong:8000/functions/v1';
BEGIN
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
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object('appointment_id', appt.id, 'message_type', 'reminder')
    );
  END LOOP;
END;
$$;

-- 09:00 every day. Cron runs in UTC regardless of server timezone — this
-- lab's local Postgres is UTC by default, revisit the hour if that changes.
SELECT cron.schedule('send-appointment-reminders', '0 9 * * *', 'SELECT public.send_appointment_reminders();');
