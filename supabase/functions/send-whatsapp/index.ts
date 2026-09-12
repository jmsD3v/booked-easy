// Sends (or, without real Meta credentials configured, simulates) a WhatsApp
// confirmation or reminder message for an appointment. Called from two
// places: PublicBooking.tsx right after a booking succeeds (confirmation),
// and the daily pg_cron job for tomorrow's appointments (reminder).
//
// "Simulated" isn't a placeholder to delete later — it's the real code path
// for any business that hasn't connected a Meta Cloud API account yet. The
// only thing that changes when they do is whatsapp_configs.access_token /
// phone_number_id stop being empty, and the exact same function starts
// actually calling Meta instead of just logging what it would have sent.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Local-dev default. A real deployment sets SITE_URL to the actual domain
// so links in WhatsApp messages point somewhere real.
const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:8080';

type Payload = {
  message_type: 'confirmation' | 'reminder';
  // The public booking flow only ever knows the token it generated (anon
  // can't read manage_token back — see PublicBooking.tsx's handleBook for
  // why); the internal reminder cron already knows the row's id instead.
  // Either is enough to look the appointment up.
  appointment_id?: string;
  manage_token?: string;
};

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }
  if ((!payload.appointment_id && !payload.manage_token) || !payload.message_type) {
    return new Response(JSON.stringify({ error: 'appointment_id or manage_token, and message_type, are required' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let apptQuery = supabase
    .from('appointments')
    .select('id, business_id, client_name, client_phone, appointment_date, start_time, manage_token, services(name)');
  apptQuery = payload.appointment_id
    ? apptQuery.eq('id', payload.appointment_id)
    : apptQuery.eq('manage_token', payload.manage_token!);
  const { data: appt, error: apptErr } = await apptQuery.maybeSingle();
  if (apptErr || !appt) {
    return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
  }

  // Idempotency: this endpoint has no auth check (called anonymously from
  // the public booking flow), so without this, replaying the same request
  // would duplicate sends/log rows indefinitely for the same appointment.
  const { data: already } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('appointment_id', appt.id)
    .eq('message_type', payload.message_type)
    .maybeSingle();
  if (already) {
    return new Response(JSON.stringify({ skipped: true, reason: 'Already sent' }), { status: 200 });
  }

  const [{ data: business }, { data: config }] = await Promise.all([
    supabase.from('businesses').select('name').eq('id', appt.business_id).maybeSingle(),
    supabase.from('whatsapp_configs').select('*').eq('business_id', appt.business_id).maybeSingle(),
  ]);

  if (!config?.is_active) {
    return new Response(JSON.stringify({ skipped: true, reason: 'WhatsApp not enabled for this business' }), { status: 200 });
  }

  const template = payload.message_type === 'confirmation' ? config.confirmation_message : config.reminder_message;
  const vars = {
    nombre: appt.client_name,
    negocio: business?.name ?? '',
    fecha: appt.appointment_date,
    hora: (appt.start_time as string).slice(0, 5),
    link: `${SITE_URL}/mis-turnos/${appt.manage_token}`,
  };
  const body = renderTemplate(template, vars);

  const hasRealCredentials = Boolean(config.phone_number_id && config.access_token);
  let status: 'simulated' | 'sent' | 'failed' = 'simulated';
  let error: string | null = null;

  if (hasRealCredentials) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${config.phone_number_id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: appt.client_phone.replace(/[^\d]/g, ''),
          type: 'text',
          text: { body },
        }),
      });
      if (res.ok) {
        status = 'sent';
      } else {
        status = 'failed';
        error = await res.text();
      }
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : String(err);
    }
  } else {
    console.log(`[SIMULATED WhatsApp -> ${appt.client_phone}] ${body}`);
  }

  await supabase.from('whatsapp_messages').insert({
    business_id: appt.business_id,
    appointment_id: appt.id,
    message_type: payload.message_type,
    to_phone: appt.client_phone,
    body,
    status,
    error,
  });

  if (payload.message_type === 'reminder' && status !== 'failed') {
    await supabase.from('appointments').update({ reminder_sent_at: new Date().toISOString() }).eq('id', appt.id);
  }

  return new Response(JSON.stringify({ status, simulated: !hasRealCredentials }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
