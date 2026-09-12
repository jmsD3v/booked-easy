import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Completado',
  no_show: 'Ausente',
};

const ManageAppointment = () => {
  const { token } = useParams<{ token: string }>();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);

  const { data: appt, isLoading } = useQuery({
    queryKey: ['manage-appointment', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_appointment_by_token', { p_token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!token,
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
  const canCancel = !isPast && !isCancelled;

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

          {canCancel ? (
            <Button variant="destructive" className="w-full" disabled={cancelling} onClick={handleCancel}>
              {cancelling ? 'Cancelando...' : 'Cancelar turno'}
            </Button>
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
