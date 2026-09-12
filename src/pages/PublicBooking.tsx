import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Calendar, Clock, CheckCircle2, ArrowLeft, ArrowRight, Scissors, Phone, User, Mail, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

type Staff = { id: string; name: string; avatar_url: string | null; is_active: boolean };
type StaffSchedule = { staff_id: string; day_of_week: number; start_time: string; end_time: string; is_available: boolean };
type Appt = { staff_id: string | null; start_time: string; end_time: string };

const ANY_STAFF = 'any';

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const PublicBooking = () => {
  const { slug } = useParams<{ slug: string }>();
  // 0=servicio, 1=profesional, 2=fecha, 3=hora, 4=datos, 5=confirmación
  const [step, setStep] = useState(0);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null); // ANY_STAFF or a staff.id
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [manageToken, setManageToken] = useState<string | null>(null);

  const { data: business } = useQuery({
    queryKey: ['public-business', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: services } = useQuery({
    queryKey: ['public-services', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', business!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id,
  });

  const { data: staff } = useQuery({
    queryKey: ['public-staff', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, business_id, name, avatar_url, is_active')
        .eq('business_id', business!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Staff[];
    },
    enabled: !!business?.id,
  });
  const hasStaff = (staff?.length ?? 0) > 0;

  const { data: staffSchedules } = useQuery({
    queryKey: ['public-staff-schedules', staff?.map((s) => s.id).join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_schedules')
        .select('staff_id, day_of_week, start_time, end_time, is_available')
        .in('staff_id', staff!.map((s) => s.id));
      if (error) throw error;
      return data as StaffSchedule[];
    },
    enabled: hasStaff,
  });

  const { data: businessHours } = useQuery({
    queryKey: ['public-hours', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('business_id', business!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id,
  });

  const { data: scheduleBlocks } = useQuery({
    queryKey: ['public-schedule-blocks', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_blocks')
        .select('staff_id, block_date')
        .eq('business_id', business!.id);
      if (error) throw error;
      return data as { staff_id: string | null; block_date: string }[];
    },
    enabled: !!business?.id,
  });

  const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const { data: existingAppointments, refetch: refetchAppointments } = useQuery({
    queryKey: ['public-appointments', business?.id, dateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('staff_id, start_time, end_time')
        .eq('business_id', business!.id)
        .eq('appointment_date', dateStr!)
        .neq('status', 'cancelled');
      if (error) throw error;
      return data as Appt[];
    },
    enabled: !!business?.id && !!dateStr,
  });

  // Starts at today (i=0) — whether today itself has any real slots left
  // depends on min_lead_hours and is handled per-slot in generateTimeSlots,
  // not by excluding the day outright.
  const maxLeadDays = business?.max_lead_days ?? 30;
  const minLeadHours = business?.min_lead_hours ?? 0;
  const businessClosedDates = new Set((scheduleBlocks ?? []).filter((b) => !b.staff_id).map((b) => b.block_date));
  const availableDays = Array.from({ length: maxLeadDays }, (_, i) => addDays(startOfDay(new Date()), i)).filter((date) => {
    const dayOfWeek = date.getDay();
    const hours = businessHours?.find((h: any) => h.day_of_week === dayOfWeek);
    if (hours && !hours.is_open) return false;
    return !businessClosedDates.has(format(date, 'yyyy-MM-dd'));
  });

  const bufferMinutes = business?.buffer_minutes ?? 0;

  // A given staff member is free for [slotStart, slotEnd) on dayOfWeek if
  // they're not off that specific date, their own weekly schedule covers
  // that window, and no existing appointment of theirs — padded by the
  // business's buffer on both sides — overlaps it.
  const isStaffFreeForSlot = (staffId: string, dayOfWeek: number, slotStart: string, slotEnd: string, appts: Appt[]) => {
    if (dateStr && scheduleBlocks?.some((b) => b.staff_id === staffId && b.block_date === dateStr)) return false;
    const sched = staffSchedules?.find((s) => s.staff_id === staffId && s.day_of_week === dayOfWeek && s.is_available);
    if (!sched) return false;
    if (slotStart < sched.start_time.slice(0, 5) || slotEnd > sched.end_time.slice(0, 5)) return false;
    const sStart = hhmmToMinutes(slotStart);
    const sEnd = hhmmToMinutes(slotEnd);
    return !appts.some((apt) => {
      if (apt.staff_id !== staffId) return false;
      const aptStart = hhmmToMinutes(apt.start_time.slice(0, 5)) - bufferMinutes;
      const aptEnd = hhmmToMinutes(apt.end_time.slice(0, 5)) + bufferMinutes;
      return sStart < aptEnd && sEnd > aptStart;
    });
  };

  const staffFreeForSlot = (dayOfWeek: number, slotStart: string, slotEnd: string, appts: Appt[]) => {
    if (!hasStaff) return true; // business hasn't set up staff — fall back to business-hours-only behavior
    if (!staff) return false;
    if (selectedStaffId === ANY_STAFF) return staff.some((s) => isStaffFreeForSlot(s.id, dayOfWeek, slotStart, slotEnd, appts));
    return selectedStaffId ? isStaffFreeForSlot(selectedStaffId, dayOfWeek, slotStart, slotEnd, appts) : false;
  };

  // Generate time slots
  const generateTimeSlots = () => {
    if (!selectedDate || !selectedService) return [];
    if (hasStaff && !selectedStaffId) return [];
    const dayOfWeek = selectedDate.getDay();
    const hours = businessHours?.find((h: any) => h.day_of_week === dayOfWeek);
    const openTime = hours?.open_time || '09:00';
    const closeTime = hours?.close_time || '18:00';

    const slots: string[] = [];
    const [openH, openM] = openTime.split(':').map(Number);
    const [closeH, closeM] = closeTime.split(':').map(Number);
    const duration = selectedService.duration_minutes;

    let current = openH * 60 + openM;
    const end = closeH * 60 + closeM;
    const appts = existingAppointments ?? [];

    // If the selected date is today, no slot earlier than min_lead_hours
    // from right now should be offered at all.
    const now = new Date();
    const isToday = format(selectedDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
    const earliestMinutesToday = isToday ? (now.getHours() * 60 + now.getMinutes()) + minLeadHours * 60 : -Infinity;

    while (current + duration <= end) {
      if (current < earliestMinutesToday) {
        current += 30;
        continue;
      }
      const h = Math.floor(current / 60);
      const m = current % 60;
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      const endTime = current + duration;
      const endH = Math.floor(endTime / 60);
      const endM = endTime % 60;
      const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      // Without staff set up, fall back to the old business-wide check (any
      // appointment — padded by the buffer — in this window blocks the slot).
      const legacyTaken = !hasStaff && appts.some((apt) => {
        const aptStart = hhmmToMinutes(apt.start_time.slice(0, 5)) - bufferMinutes;
        const aptEnd = hhmmToMinutes(apt.end_time.slice(0, 5)) + bufferMinutes;
        return current < aptEnd && endTime > aptStart;
      });

      const available = hasStaff
        ? staffFreeForSlot(dayOfWeek, timeStr, endStr, appts)
        : !legacyTaken;

      if (available) {
        slots.push(timeStr);
      }
      current += 30; // 30 min intervals
    }
    return slots;
  };

  const handleBook = async () => {
    if (!business || !selectedService || !selectedDate || !selectedTime) return;
    if (!clientName.trim() || !clientPhone.trim()) {
      toast.error('Completá tu nombre y teléfono');
      return;
    }
    setLoading(true);

    const duration = selectedService.duration_minutes;
    const [h, m] = selectedTime.split(':').map(Number);
    const endMinutes = h * 60 + m + duration;
    const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
    const dow = selectedDate.getDay();

    try {
      // Re-check against the freshest data right before inserting, to shrink
      // (not eliminate — the unique index below is what actually guarantees
      // it) the window where two clients could both see the same open slot.
      const { data: freshAppts, error: freshErr } = await supabase
        .from('appointments')
        .select('staff_id, start_time, end_time')
        .eq('business_id', business.id)
        .eq('appointment_date', format(selectedDate, 'yyyy-MM-dd'))
        .neq('status', 'cancelled');
      if (freshErr) throw freshErr;

      let staffIdToBook: string | null = null;
      if (hasStaff) {
        const candidates = selectedStaffId === ANY_STAFF ? staff!.map((s) => s.id) : [selectedStaffId!];
        staffIdToBook = candidates.find((id) => isStaffFreeForSlot(id, dow, selectedTime, endTime, freshAppts as Appt[])) ?? null;
        if (!staffIdToBook) {
          toast.error('Justo se ocupó ese horario. Elegí otro.');
          setStep(3);
          refetchAppointments();
          return;
        }
      }

      // Generated client-side and inserted directly, rather than reading it
      // back after insert: anon's SELECT on appointments is intentionally
      // restricted to non-PII columns (see the earlier PII-leak fix), and
      // that restriction applies per-column across every row anon can see —
      // not just the row just created. Granting SELECT on manage_token would
      // let anyone dump every appointment's manage token, not just their
      // own. Generating it here means we never need to read it back at all.
      const newManageToken = crypto.randomUUID();

      const { error } = await supabase.from('appointments').insert({
        business_id: business.id,
        service_id: selectedService.id,
        staff_id: staffIdToBook,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        client_email: clientEmail.trim() || null,
        appointment_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime + ':00',
        end_time: endTime + ':00',
        status: 'pending',
        manage_token: newManageToken,
      });
      if (error) {
        // 23505 = unique_violation — the DB-level backstop against double-booking
        if ((error as any).code === '23505') {
          toast.error('Justo se ocupó ese horario. Elegí otro.');
          setStep(3);
          refetchAppointments();
          return;
        }
        throw error;
      }
      setManageToken(newManageToken);
      // Fire-and-forget: a WhatsApp send hiccup (or the business not having
      // it enabled at all) should never block the booking itself succeeding.
      // The edge function runs with the service role, so it looks up
      // manage_token itself to build the cancel link — it isn't passed here.
      supabase.functions.invoke('send-whatsapp', {
        body: { manage_token: newManageToken, message_type: 'confirmation' },
      }).catch(() => {});
      setStep(5);
    } catch (err: any) {
      toast.error(err.message || 'Error al reservar');
    } finally {
      setLoading(false);
    }
  };

  if (!business) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Cargando negocio...</p>
      </div>
    );
  }

  const stepLabels = hasStaff ? ['Servicio', 'Profesional', 'Fecha', 'Hora', 'Datos'] : ['Servicio', 'Fecha', 'Hora', 'Datos'];
  // Map the "logical" step to which label index should be highlighted, since
  // step numbers stay fixed (0..5) whether or not the Profesional step exists.
  const stepToLabelIndex = hasStaff ? [0, 1, 2, 3, 4] : [0, null, 1, 2, 3];
  const activeLabelIndex = stepToLabelIndex[step] ?? stepLabels.length;

  const selectedStaffName = selectedStaffId === ANY_STAFF
    ? 'Cualquier profesional disponible'
    : staff?.find((s) => s.id === selectedStaffId)?.name;

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <div className="bg-hero py-8">
        <div className="container flex flex-col items-center text-center">
          {business.logo_url && (
            <img
              src={business.logo_url}
              alt={business.name}
              className="mb-3 h-16 w-16 rounded-xl object-cover shadow-elevated"
            />
          )}
          <h1 className="text-2xl font-bold text-primary-foreground font-display md:text-3xl">{business.name}</h1>
          {business.description && <p className="mt-2 text-primary-foreground/70">{business.description}</p>}
        </div>
      </div>

      <div className="container max-w-2xl py-8">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {stepLabels.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                activeLabelIndex >= i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {activeLabelIndex > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`hidden text-sm font-medium md:inline ${activeLabelIndex >= i ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              {i < stepLabels.length - 1 && <div className={`h-0.5 w-8 ${activeLabelIndex > i ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        {/* Step 0: Services */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold font-display text-center">Elegí un servicio</h2>
            <div className="grid gap-3">
              {services?.map((service: any) => (
                <Card
                  key={service.id}
                  className={`cursor-pointer shadow-card transition-all hover:shadow-elevated ${
                    selectedService?.id === service.id ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => { setSelectedService(service); setStep(hasStaff ? 1 : 2); }}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                        <Scissors className="h-5 w-5 text-accent-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{service.name}</p>
                        <p className="text-sm text-muted-foreground">{service.duration_minutes} min</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-primary">${service.price}</span>
                  </CardContent>
                </Card>
              ))}
              {!services?.length && (
                <p className="py-8 text-center text-muted-foreground">Este negocio aún no tiene servicios configurados.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Staff (only when the business has active staff configured) */}
        {step === 1 && hasStaff && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">¿Con quién?</h2>
            </div>
            <div className="grid gap-3">
              <Card
                className={`cursor-pointer shadow-card transition-all hover:shadow-elevated ${selectedStaffId === ANY_STAFF ? 'ring-2 ring-primary' : ''}`}
                onClick={() => { setSelectedStaffId(ANY_STAFF); setStep(2); }}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                    <Users className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <p className="font-medium">Cualquier profesional disponible</p>
                </CardContent>
              </Card>
              {staff?.map((s) => (
                <Card
                  key={s.id}
                  className={`cursor-pointer shadow-card transition-all hover:shadow-elevated ${selectedStaffId === s.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => { setSelectedStaffId(s.id); setStep(2); }}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <Avatar>
                      <AvatarFallback>{s.name.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{s.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(hasStaff ? 1 : 0)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">Elegí una fecha</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {availableDays.map((date) => (
                <Card
                  key={date.toISOString()}
                  className={`cursor-pointer shadow-card transition-all hover:shadow-elevated ${
                    selectedDate?.toDateString() === date.toDateString() ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => { setSelectedDate(date); setStep(3); }}
                >
                  <CardContent className="p-4 text-center">
                    <p className="text-sm font-medium capitalize text-muted-foreground">
                      {format(date, 'EEEE', { locale: es })}
                    </p>
                    <p className="text-2xl font-bold font-display">{format(date, 'd')}</p>
                    <p className="text-sm text-muted-foreground">{format(date, 'MMM', { locale: es })}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Time */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">Elegí un horario</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
              {generateTimeSlots().map((time) => (
                <Button
                  key={time}
                  variant={selectedTime === time ? 'default' : 'outline'}
                  className="h-14 text-lg"
                  onClick={() => { setSelectedTime(time); setStep(4); }}
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {time}
                </Button>
              ))}
              {generateTimeSlots().length === 0 && (
                <p className="col-span-full py-8 text-center text-muted-foreground">No hay horarios disponibles para este día.</p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Client data */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">Tus datos</h2>
            </div>

            <Card className="shadow-card">
              <CardContent className="space-y-4 p-6">
                <div className="rounded-lg bg-accent p-4">
                  <p className="text-sm font-medium text-accent-foreground">Resumen del turno</p>
                  <p className="font-semibold">{selectedService?.name} — ${selectedService?.price}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las {selectedTime}
                  </p>
                  {hasStaff && <p className="text-sm text-muted-foreground">{selectedStaffName}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><User className="h-4 w-4" /> Nombre</Label>
                  <Input placeholder="Tu nombre completo" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Teléfono / WhatsApp</Label>
                  <Input placeholder="Ej: +54 11 1234 5678" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Mail className="h-4 w-4" /> Email <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Input type="email" placeholder="tu@email.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>

                <Button onClick={handleBook} className="w-full gap-2" disabled={loading}>
                  {loading ? 'Reservando...' : 'Confirmar turno'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 5: Confirmation */}
        {step === 5 && (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold font-display">¡Turno reservado!</h2>
            <p className="text-muted-foreground">
              Tu turno para <strong>{selectedService?.name}</strong> el{' '}
              <strong>{selectedDate && format(selectedDate, "d 'de' MMMM", { locale: es })}</strong> a las{' '}
              <strong>{selectedTime}</strong> fue registrado exitosamente.
            </p>
            <p className="text-sm text-muted-foreground">
              Recibirás una confirmación por WhatsApp si el negocio tiene habilitadas las notificaciones.
            </p>

            {(business.payment_alias || business.payment_qr_url) && (
              <Card className="mx-auto max-w-sm text-left shadow-card">
                <CardContent className="space-y-3 p-4">
                  <p className="text-sm font-medium text-accent-foreground">Podés transferir el pago</p>
                  {business.payment_alias && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-accent px-3 py-2">
                      <span className="font-mono text-sm">{business.payment_alias}</span>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => { navigator.clipboard.writeText(business.payment_alias); toast.success('Alias copiado'); }}
                      >
                        Copiar
                      </Button>
                    </div>
                  )}
                  {business.payment_qr_url && (
                    <img src={business.payment_qr_url} alt="QR de pago" className="mx-auto h-40 w-40 rounded-lg border border-border object-cover" />
                  )}
                  {business.payment_note && <p className="text-sm text-muted-foreground">{business.payment_note}</p>}
                </CardContent>
              </Card>
            )}

            {manageToken && (
              <p className="text-sm">
                <Link to={`/mis-turnos/${manageToken}`} className="font-medium text-primary underline underline-offset-2">
                  Ver o cancelar mi turno
                </Link>
              </p>
            )}

            <Button variant="outline" onClick={() => {
              setStep(0); setSelectedService(null); setSelectedStaffId(null); setSelectedDate(null);
              setSelectedTime(null); setClientName(''); setClientPhone(''); setClientEmail(''); setManageToken(null);
            }}>
              Reservar otro turno
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicBooking;
