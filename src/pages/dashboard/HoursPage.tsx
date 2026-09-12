import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useBusiness, useStaff } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

const ALL_STAFF = 'all';

const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

interface DayHours {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: boolean;
}

const HoursPage = () => {
  const { data: business } = useBusiness();
  const { data: staff } = useStaff(business?.id);
  const queryClient = useQueryClient();

  const { data: blocks } = useQuery({
    queryKey: ['schedule-blocks', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_blocks')
        .select('*, staff(name)')
        .eq('business_id', business!.id)
        .order('block_date');
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id,
  });

  const [newBlock, setNewBlock] = useState({ block_date: '', staff_id: ALL_STAFF, reason: '' });

  const addBlock = async () => {
    if (!business || !newBlock.block_date) {
      toast.error('Elegí una fecha');
      return;
    }
    const { error } = await supabase.from('schedule_blocks').insert({
      business_id: business.id,
      staff_id: newBlock.staff_id === ALL_STAFF ? null : newBlock.staff_id,
      block_date: newBlock.block_date,
      reason: newBlock.reason.trim() || null,
    });
    if (error) {
      toast.error(error.code === '23505' ? 'Ya existe un bloqueo para esa fecha' : error.message);
      return;
    }
    toast.success('Día bloqueado');
    setNewBlock({ block_date: '', staff_id: ALL_STAFF, reason: '' });
    queryClient.invalidateQueries({ queryKey: ['schedule-blocks'] });
  };

  const removeBlock = async (id: string) => {
    const { error } = await supabase.from('schedule_blocks').delete().eq('id', id);
    if (error) toast.error(error.message);
    else queryClient.invalidateQueries({ queryKey: ['schedule-blocks'] });
  };

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

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Días bloqueados</CardTitle>
          <CardDescription>Feriados (todo el negocio) o el día libre de un profesional puntual</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input type="date" value={newBlock.block_date} onChange={(e) => setNewBlock({ ...newBlock, block_date: e.target.value })} />
            <Select value={newBlock.staff_id} onValueChange={(v) => setNewBlock({ ...newBlock, staff_id: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_STAFF}>Todo el negocio</SelectItem>
                {staff?.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Motivo (opcional)" value={newBlock.reason} onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} />
            <Button onClick={addBlock}>Bloquear</Button>
          </div>

          <div className="space-y-2">
            {!blocks?.length && <p className="py-4 text-center text-sm text-muted-foreground">No hay días bloqueados.</p>}
            {blocks?.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <p className="font-medium">{format(new Date(b.block_date + 'T00:00:00'), "d 'de' MMMM, yyyy", { locale: es })}</p>
                  <p className="text-sm text-muted-foreground">
                    {b.staff?.name ? `Solo ${b.staff.name}` : 'Todo el negocio'}{b.reason ? ` — ${b.reason}` : ''}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => removeBlock(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HoursPage;
