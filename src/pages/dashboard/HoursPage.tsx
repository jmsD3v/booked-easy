import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useBusiness } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface DayHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: boolean;
}

const HoursPage = () => {
  const { data: business } = useBusiness();
  const queryClient = useQueryClient();

  const { data: savedHours } = useQuery({
    queryKey: ['business-hours', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_hours')
        .select('*')
        .eq('business_id', business!.id)
        .order('day_of_week');
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id,
  });

  const [hours, setHours] = useState<DayHours[]>(
    Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      open_time: '09:00',
      close_time: '18:00',
      is_open: i !== 0,
    }))
  );

  useEffect(() => {
    if (savedHours?.length) {
      setHours((prev) =>
        prev.map((h) => {
          const saved = savedHours.find((s: any) => s.day_of_week === h.day_of_week);
          return saved ? { ...h, open_time: saved.open_time, close_time: saved.close_time, is_open: saved.is_open } : h;
        })
      );
    }
  }, [savedHours]);

  const handleSave = async () => {
    if (!business) return;
    try {
      // Upsert all hours
      for (const h of hours) {
        const existing = savedHours?.find((s: any) => s.day_of_week === h.day_of_week);
        if (existing) {
          await supabase.from('business_hours').update(h).eq('id', existing.id);
        } else {
          await supabase.from('business_hours').insert({ ...h, business_id: business.id });
        }
      }
      toast.success('Horarios guardados');
      queryClient.invalidateQueries({ queryKey: ['business-hours'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const updateDay = (idx: number, field: string, value: any) => {
    setHours((prev) => prev.map((h, i) => (i === idx ? { ...h, [field]: value } : h)));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Horarios</h1>
        <p className="text-muted-foreground">Configurá los horarios de atención</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Horario semanal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hours.map((h, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg border border-border p-3">
              <div className="w-28">
                <span className="font-medium">{DAYS[h.day_of_week]}</span>
              </div>
              <Switch checked={h.is_open} onCheckedChange={(v) => updateDay(i, 'is_open', v)} />
              {h.is_open ? (
                <div className="flex items-center gap-2">
                  <Input type="time" value={h.open_time} onChange={(e) => updateDay(i, 'open_time', e.target.value)} className="w-32" />
                  <span className="text-muted-foreground">a</span>
                  <Input type="time" value={h.close_time} onChange={(e) => updateDay(i, 'close_time', e.target.value)} className="w-32" />
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Cerrado</span>
              )}
            </div>
          ))}
          <Button onClick={handleSave} className="mt-4">Guardar horarios</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default HoursPage;
