import { Calendar, Users, DollarSign, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBusiness, useAppointments } from '@/hooks/useBusiness';
import { format } from 'date-fns';

const DashboardHome = () => {
  const { data: business } = useBusiness();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: todayAppointments } = useAppointments(business?.id, today);

  const stats = [
    {
      title: 'Turnos hoy',
      value: todayAppointments?.length ?? 0,
      icon: Calendar,
      color: 'bg-accent text-accent-foreground',
    },
    {
      title: 'Confirmados',
      value: todayAppointments?.filter((a: any) => a.status === 'confirmed').length ?? 0,
      icon: TrendingUp,
      color: 'bg-accent text-accent-foreground',
    },
    {
      title: 'Pendientes',
      value: todayAppointments?.filter((a: any) => a.status === 'pending').length ?? 0,
      icon: Clock,
      color: 'bg-accent text-accent-foreground',
    },
    {
      title: 'Ausencias hoy',
      value: todayAppointments?.filter((a: any) => a.status === 'no_show').length ?? 0,
      icon: AlertTriangle,
      color: 'bg-accent text-accent-foreground',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">
          ¡Hola{business?.name ? `, ${business.name}` : ''}! 👋
        </h1>
        <p className="text-muted-foreground">Resumen del día — {format(new Date(), 'dd/MM/yyyy')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="shadow-card">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-2xl font-bold font-display">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Today's appointments */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Turnos de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          {!todayAppointments?.length ? (
            <p className="py-8 text-center text-muted-foreground">No hay turnos para hoy</p>
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-primary">{apt.start_time?.slice(0, 5)}</p>
                      <p className="text-xs text-muted-foreground">{apt.end_time?.slice(0, 5)}</p>
                    </div>
                    <div>
                      <p className="font-medium">{apt.client_name}</p>
                      <p className="text-sm text-muted-foreground">{apt.services?.name}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    apt.status === 'confirmed' ? 'bg-accent text-accent-foreground' :
                    apt.status === 'pending' ? 'bg-secondary text-secondary-foreground' :
                    apt.status === 'cancelled' ? 'bg-destructive/10 text-destructive' :
                    'bg-muted text-muted-foreground'
                  }`}>
                    {apt.status === 'confirmed' ? 'Confirmado' :
                     apt.status === 'pending' ? 'Pendiente' :
                     apt.status === 'cancelled' ? 'Cancelado' :
                     apt.status === 'completed' ? 'Completado' : 'Ausente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardHome;
