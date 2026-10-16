-- Fase 1: la base es el límite real de la reserva pública.
--
-- Hasta acá la reserva solo se validaba en la UI. Con la clave pública
-- (que siempre está en el navegador) se podía insertar un turno ya
-- "completado", fuera de horario, de 03:00 a 23:59, con un servicio de otro
-- negocio, etc. Modelo de amenazas completo (T1-T12) en
-- .planning/phases/01-endurecer-reserva/01-PLAN.md; decisión en ADR-007.
--
-- Las reglas aplican a clientes (rol anon o authenticated que no es dueño
-- del negocio). Quedan exentos el dueño (carga a mano / walk-ins),
-- service_role (edge functions) y SQL directo como postgres (seed).

-- ---------------------------------------------------------------------------
-- T11: hora local del negocio
-- ---------------------------------------------------------------------------
-- Las fechas y horas de los turnos son hora de pared del negocio, pero el
-- servidor corre en UTC: "10:00" se interpretaba como 07:00 en Argentina y
-- la anticipación mínima y el "ya pasó" quedaban corridos 3 horas.

CREATE OR REPLACE FUNCTION public.is_valid_timezone(tz TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  PERFORM now() AT TIME ZONE tz;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

ALTER TABLE public.businesses
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires'
  CONSTRAINT businesses_timezone_valid CHECK (public.is_valid_timezone(timezone));

CREATE OR REPLACE FUNCTION public.appointment_starts_at(p_business_id UUID, p_date DATE, p_time TIME)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (p_date + p_time) AT TIME ZONE b.timezone
  FROM public.businesses b WHERE b.id = p_business_id;
$$;

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
  appt_ts := public.appointment_starts_at(NEW.business_id, NEW.appointment_date, NEW.start_time);

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
    -- No se cancela algo que ya pasó (en la hora del negocio).
    AND public.appointment_starts_at(business_id, appointment_date, start_time) > now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- p_new_end se mantiene por compatibilidad pero, para un cliente, la base lo
-- recalcula (inicio + duración del servicio) en enforce_public_booking_rules.
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
    AND public.appointment_starts_at(business_id, appointment_date, start_time) > now();
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- T1-T8, T12: reglas de la reserva pública
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_public_booking_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Rol del request de la API; sin JWT, el SET ROLE de la sesión (el GUC
  -- `role`, que SECURITY DEFINER no cambia: current_user acá adentro siempre
  -- es postgres); sin ninguno de los dos, el usuario conectado.
  caller TEXT := COALESCE(auth.role(), NULLIF(current_setting('role'), 'none'), session_user::TEXT);
  svc RECORD;
  hrs RECORD;
  sched RECORD;
  biz_buffer INTERVAL;
  open_t TIME := '09:00';   -- mismo default que la UI si el negocio no
  close_t TIME := '18:00';  -- cargó horario para ese día
  dow INT := extract(dow FROM NEW.appointment_date);
  new_start TIMESTAMP;
  new_end TIMESTAMP;
BEGIN
  IF caller NOT IN ('anon', 'authenticated') OR public.is_business_owner(NEW.business_id) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- T6: campos que solo maneja el negocio o el sistema.
    IF NEW.notes IS NOT NULL OR NEW.reminder_sent_at IS NOT NULL OR NEW.branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'La reserva incluye campos que no se pueden cargar desde la página pública'
        USING ERRCODE = 'check_violation';
    END IF;
    -- T1: todo turno de cliente arranca pendiente.
    NEW.status := 'pending';
    NEW.created_at := now();
    NEW.updated_at := now();

    -- T7: datos del cliente.
    NEW.client_name := trim(NEW.client_name);
    IF length(NEW.client_name) NOT BETWEEN 1 AND 100 THEN
      RAISE EXCEPTION 'El nombre tiene que tener entre 1 y 100 caracteres' USING ERRCODE = 'check_violation';
    END IF;
    NEW.client_phone := trim(NEW.client_phone);
    IF NEW.client_phone !~ '^\+?[0-9 ()-]{6,30}$' OR length(regexp_replace(NEW.client_phone, '\D', '', 'g')) < 6 THEN
      RAISE EXCEPTION 'El teléfono no es válido' USING ERRCODE = 'check_violation';
    END IF;
    NEW.client_email := NULLIF(trim(NEW.client_email), '');
    IF NEW.client_email IS NOT NULL
       AND (length(NEW.client_email) > 254 OR NEW.client_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      RAISE EXCEPTION 'El email no es válido' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- T4: servicio del mismo negocio y activo.
  SELECT duration_minutes, is_active INTO svc
  FROM public.services WHERE id = NEW.service_id AND business_id = NEW.business_id;
  IF NOT FOUND OR NOT COALESCE(svc.is_active, false) THEN
    RAISE EXCEPTION 'Ese servicio no está disponible' USING ERRCODE = 'check_violation';
  END IF;

  -- T3: el fin lo calcula la base.
  new_start := NEW.appointment_date + NEW.start_time;
  new_end := new_start + make_interval(mins => svc.duration_minutes);
  IF new_end::DATE <> NEW.appointment_date THEN
    RAISE EXCEPTION 'El turno no puede pasar de medianoche' USING ERRCODE = 'check_violation';
  END IF;
  NEW.end_time := new_end::TIME;

  -- T2: horario y bloqueos del negocio.
  SELECT open_time, close_time, is_open INTO hrs
  FROM public.business_hours WHERE business_id = NEW.business_id AND day_of_week = dow;
  IF FOUND THEN
    IF NOT COALESCE(hrs.is_open, true) THEN
      RAISE EXCEPTION 'El negocio está cerrado ese día' USING ERRCODE = 'check_violation';
    END IF;
    open_t := hrs.open_time;
    close_t := hrs.close_time;
  END IF;
  IF NEW.start_time < open_t OR NEW.end_time > close_t THEN
    RAISE EXCEPTION 'Ese horario está fuera del horario de atención' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_blocks
             WHERE business_id = NEW.business_id AND staff_id IS NULL AND block_date = NEW.appointment_date) THEN
    RAISE EXCEPTION 'El negocio no atiende ese día' USING ERRCODE = 'check_violation';
  END IF;

  -- T2/T4: empleado. Si el negocio tiene personal activo, el turno tiene que
  -- ir a uno de ellos, dentro de su horario y no en un día que falta.
  IF NEW.staff_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.staff WHERE business_id = NEW.business_id AND is_active) THEN
      RAISE EXCEPTION 'Elegí un profesional' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.staff
                   WHERE id = NEW.staff_id AND business_id = NEW.business_id AND is_active) THEN
      RAISE EXCEPTION 'Ese profesional no está disponible' USING ERRCODE = 'check_violation';
    END IF;
    SELECT start_time, end_time INTO sched
    FROM public.staff_schedules
    WHERE staff_id = NEW.staff_id AND day_of_week = dow AND is_available;
    IF NOT FOUND OR NEW.start_time < sched.start_time OR NEW.end_time > sched.end_time THEN
      RAISE EXCEPTION 'Ese profesional no atiende en ese horario' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.schedule_blocks
               WHERE business_id = NEW.business_id AND staff_id = NEW.staff_id AND block_date = NEW.appointment_date) THEN
      RAISE EXCEPTION 'Ese profesional no atiende ese día' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- T5: superposición respetando el buffer del negocio. Sin personal, el
  -- negocio entero cuenta como uno solo (igual que la UI). La superposición
  -- estricta entre turnos con empleado ya es atómica (appointments_staff_no_overlap);
  -- esto agrega el buffer y el caso sin empleado.
  SELECT make_interval(mins => buffer_minutes) INTO biz_buffer FROM public.businesses WHERE id = NEW.business_id;
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.business_id = NEW.business_id
      AND a.appointment_date = NEW.appointment_date
      AND a.status <> 'cancelled'
      AND a.id <> NEW.id
      AND (NEW.staff_id IS NULL OR a.staff_id = NEW.staff_id)
      AND (a.appointment_date + a.start_time) - biz_buffer < new_end
      AND (a.appointment_date + a.end_time) + biz_buffer > new_start
  ) THEN
    RAISE EXCEPTION 'Ese horario ya está ocupado' USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- T4 entre negocios, para todos los roles (el dueño está exento del trigger
-- de arriba): un turno solo puede usar servicios y empleados de su propio
-- negocio. Sin esto, el dueño de cualquier negocio (alta libre) podía colgar
-- un turno de 00:00 a 23:59 del empleado de otro negocio y bloquearle la
-- agenda (la restricción de superposición es por staff_id, sin negocio), sin
-- que el negocio afectado lo viera. FKs compuestas en vez de lógica en el
-- trigger: valen también para SQL directo y para UPDATE.
ALTER TABLE public.services ADD CONSTRAINT services_id_business_key UNIQUE (id, business_id);
ALTER TABLE public.staff ADD CONSTRAINT staff_id_business_key UNIQUE (id, business_id);
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_service_same_business
    FOREIGN KEY (service_id, business_id) REFERENCES public.services (id, business_id),
  ADD CONSTRAINT appointments_staff_same_business
    FOREIGN KEY (staff_id, business_id) REFERENCES public.staff (id, business_id);
ALTER TABLE public.schedule_blocks
  ADD CONSTRAINT schedule_blocks_staff_same_business
    FOREIGN KEY (staff_id, business_id) REFERENCES public.staff (id, business_id) ON DELETE CASCADE;

CREATE TRIGGER enforce_public_booking_rules
  BEFORE INSERT OR UPDATE OF appointment_date, start_time, end_time, service_id, staff_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_public_booking_rules();

-- T12: un cliente con sesión abierta (por ejemplo, dueño de otro negocio)
-- también puede reservar; las reglas de arriba aplican igual.
DROP POLICY "Public can create appointments" ON public.appointments;
CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT TO anon, authenticated WITH CHECK (
    client_name IS NOT NULL AND client_name != '' AND
    client_phone IS NOT NULL AND client_phone != ''
  );

-- T12: la página pública tiene que cargar igual con sesión abierta. Las
-- lecturas públicas estaban abiertas solo a anon, así que un dueño logueado
-- que entraba a la página de otro negocio se quedaba en "Cargando negocio...".
-- Mismas condiciones que para anon; nada de esto tiene datos personales.
CREATE POLICY "Signed-in users can view businesses" ON public.businesses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can view active services" ON public.services
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Signed-in users can view staff schedules" ON public.staff_schedules
  FOR SELECT TO authenticated USING (is_available = true);
CREATE POLICY "Signed-in users can view business hours" ON public.business_hours
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Signed-in users can view schedule blocks" ON public.schedule_blocks
  FOR SELECT TO authenticated USING (true);

-- staff es distinto: authenticated tiene SELECT en todas las columnas (el
-- dueño necesita email/teléfono de su personal), así que abrir las filas
-- expondría el contacto del personal de otros negocios. El personal público
-- sale de esta función, con las mismas columnas que anon puede leer.
CREATE OR REPLACE FUNCTION public.get_public_staff(p_business_id UUID)
RETURNS TABLE (id UUID, business_id UUID, name TEXT, avatar_url TEXT, is_active BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.business_id, s.name, s.avatar_url, s.is_active
  FROM public.staff s
  WHERE s.business_id = p_business_id AND s.is_active
  ORDER BY s.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_staff(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- T9, T12: disponibilidad sin lectura directa de la tabla
-- ---------------------------------------------------------------------------
-- anon leía todas las filas de todos los negocios (ids, servicios, estados).
-- Ahora solo puede pedir los horarios ocupados de un negocio en un día, y
-- authenticated (que por RLS solo ve sus propios turnos) también.

CREATE OR REPLACE FUNCTION public.get_booked_slots(p_business_id UUID, p_date DATE)
RETURNS TABLE (staff_id UUID, start_time TIME, end_time TIME)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.staff_id, a.start_time, a.end_time
  FROM public.appointments a
  JOIN public.businesses b ON b.id = a.business_id
  WHERE a.business_id = p_business_id
    AND a.appointment_date = p_date
    AND a.status <> 'cancelled'
    -- Solo la ventana en que se puede reservar (en la fecha del negocio):
    -- sin este límite cualquiera podía bajar el historial de turnos de
    -- cualquier negocio (volumen de la competencia).
    AND p_date BETWEEN (now() AT TIME ZONE b.timezone)::DATE
                   AND (now() AT TIME ZONE b.timezone)::DATE + b.max_lead_days
  ORDER BY a.start_time;
$$;

GRANT EXECUTE ON FUNCTION public.get_booked_slots(UUID, DATE) TO anon, authenticated;

DROP POLICY "Public can view appointment slots" ON public.appointments;
REVOKE SELECT (id, business_id, branch_id, service_id, staff_id, appointment_date, start_time, end_time, status)
  ON public.appointments FROM anon;
REVOKE SELECT ON public.appointments FROM anon;

-- ---------------------------------------------------------------------------
-- T10: recordatorios por token, no por id
-- ---------------------------------------------------------------------------
-- send-whatsapp deja de aceptar appointment_id (enumerable mientras anon
-- podía leer ids); el cron pasa el manage_token, igual que la reserva.

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
    SELECT a.manage_token
    FROM public.appointments a
    JOIN public.whatsapp_configs wc ON wc.business_id = a.business_id AND wc.is_active = true
    WHERE a.appointment_date = (CURRENT_DATE + INTERVAL '1 day')::date
      AND a.status IN ('pending', 'confirmed')
      AND a.reminder_sent_at IS NULL
  LOOP
    PERFORM net.http_post(
      url := base_url || '/send-whatsapp',
      headers := req_headers,
      body := jsonb_build_object('manage_token', appt.manage_token, 'message_type', 'reminder')
    );
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_appointment_reminders() FROM PUBLIC, anon, authenticated;
