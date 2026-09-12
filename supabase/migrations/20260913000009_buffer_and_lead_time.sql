-- Two independent scheduling rules businesses asked for:
-- 1. buffer_minutes: gap required between consecutive appointments for the
--    same staff member (cleanup/travel time) — 0 keeps today's behavior.
-- 2. min_lead_hours / max_lead_days: how soon/far out a client can book.
--    min_lead_hours blocks last-minute bookings a business can't prep for;
--    max_lead_days keeps the calendar from filling up months in advance
--    with no-shows nobody remembers making.
ALTER TABLE public.businesses
  ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  ADD COLUMN min_lead_hours INTEGER NOT NULL DEFAULT 0 CHECK (min_lead_hours >= 0 AND min_lead_hours <= 168),
  ADD COLUMN max_lead_days INTEGER NOT NULL DEFAULT 30 CHECK (max_lead_days >= 1 AND max_lead_days <= 365);

-- The public booking UI already won't offer a date/slot outside these
-- rules, but that's a UX nicety, not enforcement — nothing stops a direct
-- API call from inserting an appointment for 5 minutes from now on a
-- business that requires 48h notice. This trigger is the actual boundary:
-- it runs on every insert regardless of client, including ones made from
-- the dashboard, so it exempts business-owner inserts by checking whether
-- the caller is the business owner (an owner booking a walk-in client
-- shouldn't be blocked by their own lead-time rule).
CREATE OR REPLACE FUNCTION public.check_appointment_lead_time()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz RECORD;
  appt_ts TIMESTAMPTZ;
BEGIN
  IF public.is_business_owner(NEW.business_id) THEN
    RETURN NEW;
  END IF;

  SELECT min_lead_hours, max_lead_days INTO biz FROM public.businesses WHERE id = NEW.business_id;
  appt_ts := (NEW.appointment_date + NEW.start_time)::TIMESTAMPTZ;

  IF appt_ts < now() + (biz.min_lead_hours || ' hours')::INTERVAL THEN
    RAISE EXCEPTION 'Este negocio requiere reservar con al menos % horas de anticipación', biz.min_lead_hours
      USING ERRCODE = 'check_violation';
  END IF;
  IF appt_ts > now() + (biz.max_lead_days || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'Este negocio no acepta reservas con más de % días de anticipación', biz.max_lead_days
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_appointment_lead_time
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_appointment_lead_time();
