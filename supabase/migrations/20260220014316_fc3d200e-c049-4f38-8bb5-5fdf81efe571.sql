
-- Enum for appointment status
CREATE TYPE public.appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- Businesses table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branches table
CREATE TABLE public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Services table
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

-- Staff table
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

-- Staff schedules
CREATE TABLE public.staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  UNIQUE(staff_id, day_of_week)
);

-- Business hours
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL DEFAULT '09:00',
  close_time TIME NOT NULL DEFAULT '18:00',
  is_open BOOLEAN DEFAULT true,
  UNIQUE(business_id, day_of_week)
);

-- Appointments table
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- WhatsApp config per business
CREATE TABLE public.whatsapp_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE UNIQUE,
  phone_number_id TEXT,
  access_token TEXT,
  is_active BOOLEAN DEFAULT false,
  confirmation_message TEXT DEFAULT 'Hola {nombre}, tu turno en {negocio} está reservado para {fecha} a las {hora}. Respondé 1 para confirmar o 2 para cancelar.',
  reminder_message TEXT DEFAULT 'Recordatorio: Tu turno en {negocio} es mañana {fecha} a las {hora}.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user owns a business
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

-- RLS Policies for businesses
CREATE POLICY "Owners can manage their businesses" ON public.businesses
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Public can view businesses by slug" ON public.businesses
  FOR SELECT TO anon USING (true);

-- RLS for branches
CREATE POLICY "Owners manage branches" ON public.branches
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

-- RLS for services
CREATE POLICY "Owners manage services" ON public.services
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Public can view active services" ON public.services
  FOR SELECT TO anon USING (is_active = true);

-- RLS for staff
CREATE POLICY "Owners manage staff" ON public.staff
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Public can view active staff" ON public.staff
  FOR SELECT TO anon USING (is_active = true);

-- RLS for staff_schedules
CREATE POLICY "Owners manage staff schedules" ON public.staff_schedules
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_business_owner(s.business_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.id = staff_id AND public.is_business_owner(s.business_id))
  );

CREATE POLICY "Public can view staff schedules" ON public.staff_schedules
  FOR SELECT TO anon USING (is_available = true);

-- RLS for business_hours
CREATE POLICY "Owners manage business hours" ON public.business_hours
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Public can view business hours" ON public.business_hours
  FOR SELECT TO anon USING (true);

-- RLS for appointments
CREATE POLICY "Owners manage appointments" ON public.appointments
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

CREATE POLICY "Public can create appointments" ON public.appointments
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Public can view own appointments" ON public.appointments
  FOR SELECT TO anon USING (true);

-- RLS for whatsapp_configs
CREATE POLICY "Owners manage whatsapp config" ON public.whatsapp_configs
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

-- Indexes
CREATE INDEX idx_appointments_business_date ON public.appointments(business_id, appointment_date);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_businesses_slug ON public.businesses(slug);
CREATE INDEX idx_services_business ON public.services(business_id);
CREATE INDEX idx_staff_business ON public.staff(business_id);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_businesses_updated_at BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
