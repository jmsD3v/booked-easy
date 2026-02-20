import { useState } from 'react';
import { ChevronLeft, ChevronRight, Check, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBusiness, useAppointments } from '@/hooks/useBusiness';
import { format, addDays, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const AgendaPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { data: business } = useBusiness();
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const { data: appointments } = useAppointments(business?.id, dateStr);
  const queryClient = useQueryClient();

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('appointments').update({ status: status as any }).eq('id', id);
    if (error) toast.error(error.message);
    else {
      toast.success('Estado actualizado');
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Agenda</h1>
          <p className="text-muted-foreground">Gestión de turnos del día</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(subDays(currentDate, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-[200px] text-center text-lg font-semibold font-display capitalize">
          {format(currentDate, "EEEE d 'de' MMMM", { locale: es })}
        </h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addDays(currentDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>Hoy</Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0">
          {!appointments?.length ? (
            <p className="py-12 text-center text-muted-foreground">No hay turnos para este día</p>
          ) : (
            <div className="divide-y divide-border">
              {appointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-20 text-center">
                      <p className="text-lg font-bold text-primary">{apt.start_time?.slice(0, 5)}</p>
                      <p className="text-xs text-muted-foreground">{apt.end_time?.slice(0, 5)}</p>
                    </div>
                    <div>
                      <p className="font-medium">{apt.client_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {apt.services?.name} • {apt.client_phone}
                      </p>
                      {apt.staff?.name && (
                        <p className="text-xs text-muted-foreground">Con: {apt.staff.name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      apt.status === 'confirmed' ? 'bg-accent text-accent-foreground' :
                      apt.status === 'pending' ? 'bg-secondary text-secondary-foreground' :
                      apt.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                      apt.status === 'completed' ? 'bg-primary/10 text-primary' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {apt.status === 'confirmed' ? 'Confirmado' :
                       apt.status === 'pending' ? 'Pendiente' :
                       apt.status === 'cancelled' ? 'Cancelado' :
                       apt.status === 'completed' ? 'Completado' : 'Ausente'}
                    </span>
                    {apt.status === 'pending' && (
                      <>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateStatus(apt.id, 'confirmed')}>
                          <Check className="h-4 w-4 text-primary" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateStatus(apt.id, 'cancelled')}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgendaPage;
