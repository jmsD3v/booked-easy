-- Log of every WhatsApp message TurnoPro has tried to send (or would have
-- sent, in simulated mode when a business has no real Meta credentials
-- configured yet). Gives the owner something real to look at in the
-- WhatsApp settings page instead of the feature being invisible.
CREATE TYPE public.whatsapp_message_status AS ENUM ('simulated', 'sent', 'failed');

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

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view their own WhatsApp log" ON public.whatsapp_messages
  FOR SELECT TO authenticated USING (public.is_business_owner(business_id));

-- Only the edge function (service_role) writes to this table — no INSERT
-- policy for anon/authenticated, since a client should never be able to
-- fabricate a "sent" log entry for itself.

CREATE INDEX idx_whatsapp_messages_business ON public.whatsapp_messages(business_id, created_at DESC);

-- Track whether a reminder was already sent for an appointment, so the
-- daily cron job doesn't re-send it on every run until the appointment date.
ALTER TABLE public.appointments ADD COLUMN reminder_sent_at TIMESTAMPTZ;
