CREATE EXTENSION IF NOT EXISTS unaccent;

-- Fix 1: business creation must happen server-side, not client-side.
--
-- signUp() previously did auth.signUp() then immediately inserted into
-- businesses from the client using the just-created user's id. With email
-- confirmation enabled (the Supabase default), there is no active session
-- yet at that point, so auth.uid() is null and the RLS check
-- "owner_id = auth.uid()" on businesses fails — the insert is rejected,
-- the new auth user is left with no business, and the client sees a raw
-- RLS error instead of "check your email".
--
-- Fix: create the business from a trigger on auth.users, which runs with
-- the row already committed and doesn't depend on the caller's session.
CREATE OR REPLACE FUNCTION public.handle_new_business_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  biz_name TEXT;
  base_slug TEXT;
BEGIN
  biz_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), ''), 'Mi Negocio');
  -- unaccent() first so "Barbería" -> "barberia-don-carlos", not "barber-a-don-carlos"
  base_slug := lower(regexp_replace(public.unaccent(biz_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN
    base_slug := 'negocio';
  END IF;

  INSERT INTO public.businesses (owner_id, name, slug, category)
  VALUES (NEW.id, biz_name, base_slug || '-' || substr(NEW.id::text, 1, 8), 'general');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_business
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_business_signup();

-- Fix 2: appointments leaked client PII to anyone, unauthenticated.
--
-- "Public can view own appointments" was named as if scoped to the caller's
-- own booking, but its USING clause was just `true` — any anonymous caller
-- hitting the REST API directly (not through this app's UI) could read
-- client_name, client_phone, client_email and notes for every appointment
-- of every business on the platform. The app itself only ever needs
-- start_time/end_time publicly (to compute free slots), so the real fix is
-- column-level: keep row visibility open (needed for slot-availability
-- checks across businesses) but revoke SELECT on the PII columns from anon
-- entirely, so even a raw API call physically cannot return them.
DROP POLICY "Public can view own appointments" ON public.appointments;

CREATE POLICY "Public can view appointment slots" ON public.appointments
  FOR SELECT TO anon USING (true);

REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, branch_id, service_id, staff_id, appointment_date, start_time, end_time, status)
  ON public.appointments TO anon;

-- Fix 3: same column-exposure issue on staff — "Public can view active staff"
-- returns staff.email and staff.phone (personal contact info of employees,
-- not the business's own public contact info) to anonymous callers across
-- every business, with no business_id scoping in the policy either. Public
-- booking doesn't need staff contact details, only enough to let a client
-- pick who they're booking with.
REVOKE SELECT ON public.staff FROM anon;
GRANT SELECT (id, business_id, name, avatar_url, is_active) ON public.staff TO anon;
