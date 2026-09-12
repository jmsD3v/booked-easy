-- Lets a client manage the appointment they just booked (view + cancel)
-- without needing a client account, which this app doesn't have. The
-- appointments table's anon SELECT is intentionally restricted to
-- non-PII columns (see the PII-leak fix earlier), so RLS alone can't
-- expose "your own" appointment by a URL token — RLS policies can't
-- condition on a value the caller supplies in a query filter. Instead,
-- two SECURITY DEFINER functions do the token check themselves and
-- return/mutate only the one matching row.
ALTER TABLE public.appointments
  ADD COLUMN manage_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE OR REPLACE FUNCTION public.get_appointment_by_token(p_token UUID)
RETURNS TABLE (
  id UUID,
  client_name TEXT,
  appointment_date DATE,
  start_time TIME,
  status public.appointment_status,
  service_name TEXT,
  business_name TEXT,
  business_slug TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.client_name, a.appointment_date, a.start_time, a.status,
         s.name, b.name, b.slug
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.cancel_appointment_by_token(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE manage_token = p_token
    AND status NOT IN ('cancelled', 'completed')
    -- Can't cancel something that already happened.
    AND (appointment_date > CURRENT_DATE OR (appointment_date = CURRENT_DATE AND start_time > CURRENT_TIME));
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- Both functions are SECURITY DEFINER and don't check auth.role(), so
-- anon needs EXECUTE — the token itself (a UUID, unguessable, sent only
-- to the client who booked) is what restricts access, the same trust
-- model as a password-reset link.
GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(UUID) TO anon;
