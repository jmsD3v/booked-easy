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

type Payload = { appointment_id: string; message_type: 'confirmation' | 'reminder' };

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
  if (!payload.appointment_id || !payload.message_type) {
    return new Response(JSON.stringify({ error: 'appointment_id and message_type are required' }), { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Idempotency: this endpoint takes an anon-callable appointment_id with no
  // auth check (the public booking flow calls it right after an anonymous
  // insert), so without this, replaying the same request would duplicate
  // sends/log rows indefinitely for the same appointment.
  const { data: already } = await supabase
    .from('whatsapp_messages')
    .select('id')
    .eq('appointment_id', payload.appointment_id)
    .eq('message_type', payload.message_type)
    .maybeSingle();
  if (already) {
    return new Response(JSON.stringify({ skipped: true, reason: 'Already sent' }), { status: 200 });
  }

  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('id, business_id, client_name, client_phone, appointment_date, start_time, services(name)')
    .eq('id', payload.appointment_id)
    .maybeSingle();
  if (apptErr || !appt) {
    return new Response(JSON.stringify({ error: 'Appointment not found' }), { status: 404 });
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
