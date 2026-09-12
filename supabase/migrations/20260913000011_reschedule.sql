-- Real reschedule — moves the existing appointment to a new slot, instead
-- of the client cancelling and starting a fresh booking from scratch.
-- get_appointment_by_token needs to return enough for the client to compute
-- available slots itself (business_id, staff_id, service duration).
DROP FUNCTION IF EXISTS public.get_appointment_by_token(UUID);

CREATE FUNCTION public.get_appointment_by_token(p_token UUID)
RETURNS TABLE (
  id UUID,
  client_name TEXT,
  appointment_date DATE,
  start_time TIME,
  status public.appointment_status,
  service_name TEXT,
  business_name TEXT,
  business_slug TEXT,
  business_id UUID,
  staff_id UUID,
  service_id UUID,
  duration_minutes INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.client_name, a.appointment_date, a.start_time, a.status,
         s.name, b.name, b.slug, a.business_id, a.staff_id, a.service_id, s.duration_minutes
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.manage_token = p_token;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(UUID) TO anon;

CREATE OR REPLACE FUNCTION public.reschedule_appointment_by_token(
  p_token UUID, p_new_date DATE, p_new_start TIME, p_new_end TIME
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.appointments
  SET appointment_date = p_new_date, start_time = p_new_start, end_time = p_new_end,
      status = 'pending', updated_at = now()
  WHERE manage_token = p_token
    AND status NOT IN ('cancelled', 'completed')
    AND (appointment_date > CURRENT_DATE OR (appointment_date = CURRENT_DATE AND start_time > CURRENT_TIME));
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
  -- The staff-slot unique index and the lead-time trigger below both still
  -- apply on this UPDATE — a reschedule can't land on an already-taken slot
  -- or violate the business's min/max lead-time rules any more than a new
  -- booking could.
END;
$$;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_token(UUID, DATE, TIME, TIME) TO anon;

-- The lead-time trigger only ran BEFORE INSERT — a reschedule is an UPDATE,
-- so without this it could move an appointment to a time that violates
-- min_lead_hours/max_lead_days. Re-attach the same function to UPDATE too,
-- but only when the date/time actually changed (editing other fields, e.g.
-- a status change from the dashboard, shouldn't re-check lead time against
-- a slot that isn't moving).
CREATE TRIGGER enforce_appointment_lead_time_on_reschedule
  BEFORE UPDATE OF appointment_date, start_time ON public.appointments
  FOR EACH ROW
  WHEN (OLD.appointment_date IS DISTINCT FROM NEW.appointment_date OR OLD.start_time IS DISTINCT FROM NEW.start_time)
  EXECUTE FUNCTION public.check_appointment_lead_time();
