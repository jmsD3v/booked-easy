-- One table covers both cases a business asked for: closing the whole
-- business for a day (holiday) — staff_id NULL — or blocking a single
-- staff member for a day (their day off/vacation) — staff_id set.
CREATE TABLE public.schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
  block_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, staff_id, block_date)
);

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage schedule blocks" ON public.schedule_blocks
  FOR ALL TO authenticated USING (public.is_business_owner(business_id)) WITH CHECK (public.is_business_owner(business_id));

-- Public booking needs to know which days/staff are blocked to avoid
-- offering them at all — same non-sensitive shape as business_hours.
CREATE POLICY "Public can view schedule blocks" ON public.schedule_blocks
  FOR SELECT TO anon USING (true);

CREATE INDEX idx_schedule_blocks_business_date ON public.schedule_blocks(business_id, block_date);
