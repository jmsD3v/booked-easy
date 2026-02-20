
-- Fix permissive anon INSERT policy - require client data
DROP POLICY "Public can create appointments" ON public.appointments;
CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT TO anon WITH CHECK (
    client_name IS NOT NULL AND client_name != '' AND
    client_phone IS NOT NULL AND client_phone != ''
  );
