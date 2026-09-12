import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, XCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { format, parseISO, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
  no_show: 'Ausente',
};

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const ManageAppointment = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [savingReschedule, setSavingReschedule] = useState(false);
  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newTime, setNewTime] = useState<string | null>(null);

  const { data: appt, isLoading } = useQuery({
    queryKey: ['manage-appointment', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_appointment_by_token', { p_token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!token,
  });

  const { data: business } = useQuery({
    queryKey: ['manage-business', appt?.business_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('businesses').select('*').eq('id', appt!.business_id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!appt?.business_id && rescheduling,
  });

  const { data: businessHours } = useQuery({
    queryKey: ['manage-hours', appt?.business_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('business_hours').select('*').eq('business_id', appt!.business_id);
      if (error) throw error;
      return data;
    },
    enabled: !!appt?.business_id && rescheduling,
  });

  const { data: staffSchedule } = useQuery({
    queryKey: ['manage-staff-schedule', appt?.staff_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_schedules').select('*').eq('staff_id', appt!.staff_id);
      if (error) throw error;
      return data;
    },
    enabled: !!appt?.staff_id && rescheduling,
  });

  const { data: scheduleBlocks } = useQuery({
    queryKey: ['manage-schedule-blocks', appt?.business_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('schedule_blocks').select('staff_id, block_date').eq('business_id', appt!.business_id);
      if (error) throw error;
      return data;
    },
    enabled: !!appt?.business_id && rescheduling,
  });

  const newDateStr = newDate ? format(newDate, 'yyyy-MM-dd') : null;
  const { data: dayAppointments } = useQuery({
    queryKey: ['manage-day-appointments', appt?.business_id, newDateStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('staff_id, start_time, end_time')
        .eq('business_id', appt!.business_id)
        .eq('appointment_date', newDateStr!)
        .neq('status', 'cancelled');
      if (error) throw error;
      return data;
    },
    enabled: !!appt?.business_id && !!newDateStr,
  });

  const handleCancel = async () => {
    if (!token) return;
    setCancelling(true);
    try {
      const { data: cancelled, error } = await supabase.rpc('cancel_appointment_by_token', { p_token: token });
      if (error) throw error;
      if (!cancelled) {
        toast.error('Este turno ya no se puede cancelar (ya pasó, o ya estaba cancelado/completado).');
      } else {
        toast.success('Turno cancelado');
        queryClient.invalidateQueries({ queryKey: ['manage-appointment', token] });
      }
    } catch (err: any) {
      toast.error(err.message || 'No se pudo cancelar el turno');
    } finally {
      setCancelling(false);
    }
  };

  const availableDays = business
    ? Array.from({ length: business.max_lead_days ?? 30 }, (_, i) => addDays(startOfDay(new Date()), i)).filter((date) => {
        const dow = date.getDay();
        const hours = businessHours?.find((h: any) => h.day_of_week === dow);
        if (hours && !hours.is_open) return false;
        const dateStr = format(date, 'yyyy-MM-dd');
        return !scheduleBlocks?.some((b: any) => !b.staff_id && b.block_date === dateStr);
      })
    : [];

  const generateSlots = () => {
    if (!newDate || !business || !appt) return [];
    const dow = newDate.getDay();
    const hours = businessHours?.find((h: any) => h.day_of_week === dow);
    const openTime = hours?.open_time?.slice(0, 5) || '09:00';
    const closeTime = hours?.close_time?.slice(0, 5) || '18:00';
    const duration = appt.duration_minutes;
    const bufferMinutes = business.buffer_minutes ?? 0;
    const minLeadHours = business.min_lead_hours ?? 0;

    if (appt.staff_id && scheduleBlocks?.some((b: any) => b.staff_id === appt.staff_id && b.block_date === newDateStr)) {
      return [];
    }
    const sched = appt.staff_id ? staffSchedule?.find((s: any) => s.day_of_week === dow && s.is_available) : null;
    if (appt.staff_id && !sched) return [];

    const openMin = hhmmToMinutes(openTime);
    const closeMin = hhmmToMinutes(closeTime);
    const schedStart = sched ? hhmmToMinutes(sched.start_time.slice(0, 5)) : openMin;
    const schedEnd = sched ? hhmmToMinutes(sched.end_time.slice(0, 5)) : closeMin;

    const now = new Date();
    const isToday = format(newDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
    const earliestToday = isToday ? now.getHours() * 60 + now.getMinutes() + minLeadHours * 60 : -Infinity;

    const appts = dayAppointments ?? [];
    const slots: string[] = [];
    let current = Math.max(openMin, schedStart);
    const end = Math.min(closeMin, schedEnd);

    while (current + duration <= end) {
      if (current >= earliestToday) {
        const slotEnd = current + duration;
        const conflict = appts.some((a: any) => {
          // Staff-specific check when this appointment has one; otherwise
          // (legacy no-staff businesses) any appointment in the window blocks it.
          if (appt.staff_id && a.staff_id !== appt.staff_id) return false;
          const aStart = hhmmToMinutes(a.start_time.slice(0, 5)) - bufferMinutes;
          const aEnd = hhmmToMinutes(a.end_time.slice(0, 5)) + bufferMinutes;
          return current < aEnd && slotEnd > aStart;
        });
        if (!conflict) {
          const h = Math.floor(current / 60).toString().padStart(2, '0');
          const m = (current % 60).toString().padStart(2, '0');
          slots.push(`${h}:${m}`);
        }
      }
      current += 30;
    }
    return slots;
  };

  const handleConfirmReschedule = async () => {
    if (!token || !newDate || !newTime || !appt) return;
    setSavingReschedule(true);
    try {
      const [h, m] = newTime.split(':').map(Number);
      const endMinutes = h * 60 + m + appt.duration_minutes;
      const endTime = `${Math.floor(endMinutes / 60).toString().padStart(2, '0')}:${(endMinutes % 60).toString().padStart(2, '0')}`;
      const { data: ok, error } = await supabase.rpc('reschedule_appointment_by_token', {
        p_token: token,
        p_new_date: format(newDate, 'yyyy-MM-dd'),
        p_new_start: newTime + ':00',
        p_new_end: endTime + ':00',
      });
      if (error) throw error;
      if (!ok) {
        toast.error('No se pudo reprogramar (el turno ya pasó, está cancelado, o ese horario ya se ocupó).');
        return;
      }
      toast.success('Turno reprogramado');
      setRescheduling(false);
      setNewDate(null);
      setNewTime(null);
      queryClient.invalidateQueries({ queryKey: ['manage-appointment', token] });
    } catch (err: any) {
      toast.error(err.message || 'No se pudo reprogramar');
    } finally {
      setSavingReschedule(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Buscando tu turno...</p>
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
        <Card className="w-full max-w-sm shadow-card">
          <CardContent className="p-6 text-center text-muted-foreground">
            No encontramos ningún turno con este link.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPast = appt.status === 'completed';
  const isCancelled = appt.status === 'cancelled';
  const canManage = !isPast && !isCancelled;

  if (rescheduling) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
        <Card className="w-full max-w-md shadow-elevated">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => { setRescheduling(false); setNewDate(null); setNewTime(null); }}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-bold font-display">Reprogramar turno</h1>
            </div>

            {!newDate ? (
              <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto">
                {availableDays.map((d) => (
                  <Card key={d.toISOString()} className="cursor-pointer shadow-card hover:shadow-elevated" onClick={() => setNewDate(d)}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs capitalize text-muted-foreground">{format(d, 'EEE', { locale: es })}</p>
                      <p className="text-lg font-bold font-display">{format(d, 'd')}</p>
                      <p className="text-xs text-muted-foreground">{format(d, 'MMM', { locale: es })}</p>
                    </CardContent>
                  </Card>
                ))}
                {!business && <p className="col-span-3 py-4 text-center text-sm text-muted-foreground">Cargando...</p>}
              </div>
            ) : !newTime ? (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => setNewDate(null)}>
                  <ArrowLeft className="h-3 w-3" /> {format(newDate, "EEEE d 'de' MMMM", { locale: es })}
                </Button>
                <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
                  {generateSlots().map((t) => (
                    <Button key={t} variant="outline" onClick={() => setNewTime(t)}>{t}</Button>
                  ))}
                  {generateSlots().length === 0 && (
                    <p className="col-span-3 py-4 text-center text-sm text-muted-foreground">No hay horarios disponibles para este día.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-accent p-4 text-sm">
                  <p className="font-medium">Nuevo horario</p>
                  <p className="text-muted-foreground">{format(newDate, "EEEE d 'de' MMMM", { locale: es })} a las {newTime}</p>
                </div>
                <Button className="w-full" disabled={savingReschedule} onClick={handleConfirmReschedule}>
                  {savingReschedule ? 'Guardando...' : 'Confirmar nuevo horario'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setNewTime(null)}>Elegir otro horario</Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-sm shadow-elevated">
        <CardContent className="space-y-4 p-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{appt.business_name}</p>
            <h1 className="text-xl font-bold font-display">Tu turno</h1>
          </div>

          <div className="space-y-2 rounded-lg bg-accent p-4">
            <p className="font-semibold">{appt.service_name}</p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" /> {format(parseISO(appt.appointment_date), "EEEE d 'de' MMMM", { locale: es })}
            </p>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" /> {appt.start_time?.slice(0, 5)}
            </p>
            <p className="flex items-center gap-2 text-sm font-medium">
              {isCancelled ? <XCircle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
              {statusLabel[appt.status] ?? appt.status}
            </p>
          </div>

          {canManage ? (
            <div className="space-y-2">
              <Button variant="outline" className="w-full" onClick={() => setRescheduling(true)}>Reprogramar</Button>
              <Button variant="destructive" className="w-full" disabled={cancelling} onClick={handleCancel}>
                {cancelling ? 'Cancelando...' : 'Cancelar turno'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                {isCancelled ? 'Este turno ya está cancelado.' : 'Este turno ya se realizó.'}
              </p>
              {isCancelled && (
                <Link to={`/b/${appt.business_slug}`}>
                  <Button variant="outline" className="w-full">Reservar otro turno</Button>
                </Link>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManageAppointment;
