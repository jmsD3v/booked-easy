-- TurnoPro — esquema base.
--
-- Consolida en un solo archivo las 13 migraciones anteriores (las 2 que
-- generó Lovable el 2026-02-20 y las 11 propias del 2026-09-13). El estado
-- final es idéntico: se verificó comparando `pg_dump --schema-only` de una
-- base con las 13 migraciones contra una base con solo este archivo, más
-- policies de storage, buckets, cron jobs, extensiones y triggers de auth
-- (ver ADR-001 en docs/ARCHITECTURE.md).
--
-- Nunca hubo un proyecto Supabase real con estas migraciones aplicadas, así
-- que reemplazar la historia no rompe ninguna base existente. A partir de
-- acá, todo cambio de esquema va en una migración nueva, nunca editando esta.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

CREATE TYPE public.appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE public.whatsapp_message_status AS ENUM ('simulated', 'sent', 'failed');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Datos de cobro que se le muestran al cliente apenas reserva (alias/CVU,
  -- QR). No pasa plata por TurnoPro: es info estática en el momento justo.
  payment_alias TEXT,
  payment_note TEXT,
  payment_qr_url TEXT,
  -- Reglas de agenda:
  -- buffer_minutes: hueco entre turnos seguidos del mismo empleado.
  -- min_lead_hours / max_lead_days: con cuánta anticipación mínima/máxima
  -- se puede reservar.
  buffer_minutes INTEGER NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  min_lead_hours INTEGER NOT NULL DEFAULT 0 CHECK (min_lead_hours >= 0 AND min_lead_hours <= 168),
  max_lead_days INTEGER NOT NULL DEFAULT 30 CHECK (max_lead_days >= 1 AND max_lead_days <= 365)
);

-- Existe desde el esquema original pero no tiene pantallas (multi-sede no
-- está construido). Se deja para no romper appointments.branch_id.
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  UNIQUE(staff_id, day_of_week)
);

CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '18:00',
  is_open BOOLEAN DEFAULT true,
  UNIQUE(business_id, day_of_week)
);

CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id),
  service_id UUID NOT NULL REFERENCES public.services(id),
  staff_id UUID REFERENCES public.staff(id),
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status appointment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Para que el cron diario no reenvíe el recordatorio en cada corrida.
  reminder_sent_at TIMESTAMPTZ,
  -- Token del link "ver / cancelar / reprogramar mi turno" (sin cuenta de
  -- cliente). Mismo modelo de confianza que un link de reseteo de clave.
  manage_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
);

CREATE TABLE public.whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE UNIQUE,
  phone_number_id TEXT,
  access_token TEXT,
  is_active BOOLEAN DEFAULT false,
  confirmation_message TEXT DEFAULT 'Hola {nombre}, tu turno en {negocio} está reservado para {fecha} a las {hora}. Para ver o cancelar tu turno: {link}',
  reminder_message TEXT DEFAULT 'Recordatorio: Tu turno en {negocio} es mañana {fecha} a las {hora}. Para cancelar: {link}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Registro de cada WhatsApp enviado (o simulado, si el negocio todavía no
-- cargó credenciales de Meta). Solo escribe la edge function (service_role).
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('confirmation', 'reminder')),
  to_phone TEXT NOT NULL,
  body TEXT NOT NULL,
  status public.whatsapp_message_status NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Días bloqueados: todo el negocio (staff_id NULL, ej. feriado) o un
-- empleado puntual (staff_id seteado, ej. vacaciones).
CREATE TABLE public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, staff_id, block_date)
);

-- ---------------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------------

CREATE INDEX idx_appointments_business_date ON public.appointments(business_id, appointment_date);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_businesses_slug ON public.businesses(slug);
CREATE INDEX idx_services_business ON public.services(business_id);
CREATE INDEX idx_staff_business ON public.staff(business_id);
CREATE INDEX idx_whatsapp_messages_business ON public.whatsapp_messages(business_id, created_at DESC);
CREATE INDEX idx_schedule_blocks_business_date ON public.schedule_blocks(business_id, block_date);

-- Doble reserva: mismo empleado, mismo día, misma hora de inicio. Los
-- cancelados liberan el horario.
CREATE UNIQUE INDEX appointments_staff_slot_unique
  ON public.appointments (staff_id, appointment_date, start_time)
  WHERE staff_id IS NOT NULL AND status != 'cancelled';

-- ---------------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_business_owner(_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = _business_id AND owner_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- El negocio se crea desde un trigger en auth.users y no desde el cliente:
-- con confirmación de email activada no hay sesión justo después de
-- signUp(), y la policy owner_id = auth.uid() rechazaría el insert.
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

-- La UI pública ya no ofrece fechas fuera de las reglas, pero eso es UX, no
-- un límite real: este trigger corre en todo insert/reprogramación sin
-- importar el cliente. El dueño queda exento (un turno cargado a mano desde
-- el panel no se frena por su propia regla).
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

-- Autogestión del cliente por token (ver/cancelar/reprogramar). anon no
-- puede leer las columnas con datos personales de appointments, así que
-- estas funciones SECURITY DEFINER hacen el chequeo del token ellas mismas
-- y devuelven/modifican solo la fila que coincide.
CREATE OR REPLACE FUNCTION public.get_appointment_by_token(p_token UUID)
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

-- Recordatorio diario: turnos de mañana, no cancelados, de negocios con
-- WhatsApp activo -> llama a la edge function send-whatsapp por cada uno.
-- La URL base se ajusta en una migración posterior para que funcione
-- también en un proyecto Supabase real (ver 20261016000001).
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

GRANT EXECUTE ON FUNCTION public.get_appointment_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.cancel_appointment_by_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_by_token(UUID, DATE, TIME, TIME) TO anon;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER on_auth_user_created_business
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_business_signup();

CREATE TRIGGER enforce_appointment_lead_time
  BEFORE INSERT ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_appointment_lead_time();

-- Solo cuando cambia fecha/hora: un cambio de estado desde el panel no
-- tiene que re-chequear anticipación de un turno que no se mueve.
CREATE TRIGGER enforce_appointment_lead_time_on_reschedule
  BEFORE UPDATE OF appointment_date, start_time ON public.appointments
  FOR EACH ROW
  WHEN (OLD.appointment_date IS DISTINCT FROM NEW.appointment_date OR OLD.start_time IS DISTINCT FROM NEW.start_time)
  EXECUTE FUNCTION public.check_appointment_lead_time();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their businesses" ON public.businesses
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Public can view businesses by slug" ON public.businesses
  FOR SELECT TO anon USING (true);

CREATE POLICY "Owners manage branches" ON public.branches
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Owners manage services" ON public.services
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Public can view active services" ON public.services
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Owners manage staff" ON public.staff
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Public can view active staff" ON public.staff
  FOR SELECT TO anon USING (is_active = true);

CREATE POLICY "Owners manage staff schedules" ON public.staff_schedules
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_business_owner(s.business_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_business_owner(s.business_id))
  );
CREATE POLICY "Public can view staff schedules" ON public.staff_schedules
  FOR SELECT TO anon USING (is_available = true);

CREATE POLICY "Owners manage business hours" ON public.business_hours
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Public can view business hours" ON public.business_hours
  FOR SELECT TO anon USING (true);

CREATE POLICY "Owners manage appointments" ON public.appointments
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT TO anon WITH CHECK (
    client_name IS NOT NULL AND client_name != '' AND
    client_phone IS NOT NULL AND client_phone != ''
  );
-- Las filas son visibles para anon (hace falta para calcular horarios
-- libres), pero las columnas con datos del cliente no: ver los GRANT de
-- columna más abajo.
CREATE POLICY "Public can view appointment slots" ON public.appointments
  FOR SELECT TO anon USING (true);

CREATE POLICY "Owners manage whatsapp config" ON public.whatsapp_configs
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

-- Sin policy de INSERT para anon/authenticated: un cliente nunca debería
-- poder fabricarse un registro de "enviado".
CREATE POLICY "Owners view their own WhatsApp log" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_business_owner(business_id));

CREATE POLICY "Owners manage schedule blocks" ON public.schedule_blocks
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));
CREATE POLICY "Public can view schedule blocks" ON public.schedule_blocks
  FOR SELECT TO anon USING (true);

-- ---------------------------------------------------------------------------
-- Permisos de columna para anon
-- ---------------------------------------------------------------------------

-- appointments: anon solo ve lo necesario para chequear disponibilidad,
-- nunca nombre/teléfono/email/notas del cliente.
REVOKE SELECT ON public.appointments FROM anon;
GRANT SELECT (id, business_id, branch_id, service_id, staff_id, appointment_date, start_time, end_time, status)
  ON public.appointments TO anon;

-- staff: el contacto personal de los empleados no es público.
REVOKE SELECT ON public.staff FROM anon;
GRANT SELECT (id, business_id, name, avatar_url, is_active) ON public.staff TO anon;

-- ---------------------------------------------------------------------------
-- Storage: logos de negocio
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Objects are stored as "<business_id>/<filename>" — policies check that
-- the first path segment is a business the caller owns.
create policy "Business owners manage their own logo"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'logos' and public.is_business_owner((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'logos' and public.is_business_owner((storage.foldername(name))[1]::uuid));

create policy "Logos are publicly readable"
  on storage.objects for select
  to anon
  using (bucket_id = 'logos');

-- ---------------------------------------------------------------------------
-- Cron
-- ---------------------------------------------------------------------------

-- 09:00 UTC todos los días (06:00 en Argentina).
SELECT cron.schedule('send-appointment-reminders', '0 9 * * *', 'SELECT public.send_appointment_reminders();');
