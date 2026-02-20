import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, Clock, CheckCircle2, ArrowLeft, ArrowRight, Scissors, Phone, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, addDays, isBefore, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const PublicBooking = () => {
  const { slug } = useParams<{ slug: string }>();
  const [step, setStep] = useState(0); // 0=services, 1=date, 2=time, 3=form, 4=done
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [loading, setLoading] = useState(false);

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

  const { data: existingAppointments } = useQuery({
    queryKey: ['public-appointments', business?.id, selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('start_time, end_time')
        .eq('business_id', business!.id)
        .eq('appointment_date', format(selectedDate!, 'yyyy-MM-dd'))
        .neq('status', 'cancelled');
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id && !!selectedDate,
  });

  // Generate next 14 days
  const availableDays = Array.from({ length: 14 }, (_, i) => addDays(new Date(), i + 1)).filter((date) => {
    const dayOfWeek = date.getDay();
    const hours = businessHours?.find((h: any) => h.day_of_week === dayOfWeek);
    return hours ? hours.is_open : true;
  });

  // Generate time slots
  const generateTimeSlots = () => {
    if (!selectedDate || !selectedService) return [];
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

    while (current + duration <= end) {
      const h = Math.floor(current / 60);
      const m = current % 60;
      const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      // Check if slot is taken
      const endTime = current + duration;
      const endH = Math.floor(endTime / 60);
      const endM = endTime % 60;
      const endStr = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

      const isTaken = existingAppointments?.some((apt: any) => {
        const aptStart = apt.start_time?.slice(0, 5);
        const aptEnd = apt.end_time?.slice(0, 5);
        return timeStr < aptEnd && endStr > aptStart;
      });

      if (!isTaken) {
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

    try {
      const { error } = await supabase.from('appointments').insert({
        business_id: business.id,
        service_id: selectedService.id,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        appointment_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime + ':00',
        end_time: endTime + ':00',
        status: 'pending',
      });
      if (error) throw error;
      setStep(4);
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

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <div className="bg-hero py-8">
        <div className="container text-center">
          <h1 className="text-2xl font-bold text-primary-foreground font-display md:text-3xl">{business.name}</h1>
          {business.description && <p className="mt-2 text-primary-foreground/70">{business.description}</p>}
        </div>
      </div>

      <div className="container max-w-2xl py-8">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {['Servicio', 'Fecha', 'Hora', 'Datos'].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                step >= i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {step > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`hidden text-sm font-medium md:inline ${step >= i ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
              {i < 3 && <div className={`h-0.5 w-8 ${step > i ? 'bg-primary' : 'bg-muted'}`} />}
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
                  onClick={() => { setSelectedService(service); setStep(1); }}
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

        {/* Step 1: Date */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">Elegí una fecha</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {availableDays.map((date) => (
                <Card
                  key={date.toISOString()}
                  className={`cursor-pointer shadow-card transition-all hover:shadow-elevated ${
                    selectedDate?.toDateString() === date.toDateString() ? 'ring-2 ring-primary' : ''
                  }`}
                  onClick={() => { setSelectedDate(date); setStep(2); }}
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

        {/* Step 2: Time */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /></Button>
              <h2 className="text-xl font-bold font-display">Elegí un horario</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
              {generateTimeSlots().map((time) => (
                <Button
                  key={time}
                  variant={selectedTime === time ? 'default' : 'outline'}
                  className="h-14 text-lg"
                  onClick={() => { setSelectedTime(time); setStep(3); }}
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

        {/* Step 3: Client data */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /></Button>
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
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><User className="h-4 w-4" /> Nombre</Label>
                  <Input placeholder="Tu nombre completo" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><Phone className="h-4 w-4" /> Teléfono / WhatsApp</Label>
                  <Input placeholder="Ej: +54 11 1234 5678" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
                </div>

                <Button onClick={handleBook} className="w-full gap-2" disabled={loading}>
                  {loading ? 'Reservando...' : 'Confirmar turno'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
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
            <Button variant="outline" onClick={() => { setStep(0); setSelectedService(null); setSelectedDate(null); setSelectedTime(null); setClientName(''); setClientPhone(''); }}>
              Reservar otro turno
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicBooking;
