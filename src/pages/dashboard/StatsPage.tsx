import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBusiness } from '@/hooks/useBusiness';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';

const StatsPage = () => {
  const { data: business } = useBusiness();

  const { data: weekData } = useQuery({
    queryKey: ['stats-week', business?.id],
    queryFn: async () => {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dateStr = format(date, 'yyyy-MM-dd');
        const { data } = await supabase
          .from('appointments')
          .select('id, status, services(price)')
          .eq('business_id', business!.id)
          .eq('appointment_date', dateStr);

        days.push({
          day: format(date, 'EEE', { locale: es }),
          turnos: data?.length ?? 0,
          ingresos: data?.filter((a: any) => a.status === 'completed' || a.status === 'confirmed')
            .reduce((sum: number, a: any) => sum + (a.services?.price || 0), 0) ?? 0,
          ausencias: data?.filter((a: any) => a.status === 'no_show').length ?? 0,
        });
      }
      return days;
    },
    enabled: !!business?.id,
  });

  const totalTurnos = weekData?.reduce((s, d) => s + d.turnos, 0) ?? 0;
  const totalIngresos = weekData?.reduce((s, d) => s + d.ingresos, 0) ?? 0;
  const totalAusencias = weekData?.reduce((s, d) => s + d.ausencias, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Estadísticas</h1>
        <p className="text-muted-foreground">Resumen de los últimos 7 días</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total turnos</p>
            <p className="text-3xl font-bold font-display">{totalTurnos}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Ingresos estimados</p>
            <p className="text-3xl font-bold font-display text-primary">${totalIngresos}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Ausencias</p>
            <p className="text-3xl font-bold font-display text-destructive">{totalAusencias}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Turnos por día</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip />
                <Bar dataKey="turnos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StatsPage;
