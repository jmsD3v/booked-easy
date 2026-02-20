import { useState, useEffect } from 'react';
import { MessageCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useBusiness } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const WhatsAppPage = () => {
  const { data: business } = useBusiness();
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ['whatsapp-config', business?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_configs')
        .select('*')
        .eq('business_id', business!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!business?.id,
  });

  const [form, setForm] = useState({
    phone_number_id: '',
    access_token: '',
    is_active: false,
    confirmation_message: 'Hola {nombre}, tu turno en {negocio} está reservado para {fecha} a las {hora}. Respondé 1 para confirmar o 2 para cancelar.',
    reminder_message: 'Recordatorio: Tu turno en {negocio} es mañana {fecha} a las {hora}.',
  });

  useEffect(() => {
    if (config) {
      setForm({
        phone_number_id: config.phone_number_id || '',
        access_token: config.access_token || '',
        is_active: config.is_active || false,
        confirmation_message: config.confirmation_message || form.confirmation_message,
        reminder_message: config.reminder_message || form.reminder_message,
      });
    }
  }, [config]);

  const handleSave = async () => {
    if (!business) return;
    try {
      if (config) {
        const { error } = await supabase.from('whatsapp_configs').update(form).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('whatsapp_configs').insert({ ...form, business_id: business.id });
        if (error) throw error;
      }
      toast.success('Configuración de WhatsApp guardada');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">WhatsApp</h1>
        <p className="text-muted-foreground">Configurá los mensajes automáticos</p>
      </div>

      <Card className="border-info/30 bg-info/5 shadow-card">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-5 w-5 text-info" />
          <div className="text-sm">
            <p className="font-medium">¿Cómo funciona?</p>
            <p className="text-muted-foreground">Necesitás una cuenta de WhatsApp Business API (Meta Cloud API). Obtenés un Phone Number ID y un Access Token desde el panel de Meta for Developers.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <MessageCircle className="h-5 w-5 text-primary" /> Credenciales API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Activar notificaciones por WhatsApp</Label>
          </div>
          <div className="space-y-2"><Label>Phone Number ID</Label><Input value={form.phone_number_id} onChange={(e) => setForm({ ...form, phone_number_id: e.target.value })} placeholder="Ej: 123456789012345" /></div>
          <div className="space-y-2"><Label>Access Token</Label><Input type="password" value={form.access_token} onChange={(e) => setForm({ ...form, access_token: e.target.value })} placeholder="Tu token de acceso" /></div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Mensajes personalizados</CardTitle>
          <CardDescription>Usá {'{nombre}'}, {'{negocio}'}, {'{fecha}'}, {'{hora}'} como variables</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Mensaje de confirmación</Label><Textarea rows={3} value={form.confirmation_message} onChange={(e) => setForm({ ...form, confirmation_message: e.target.value })} /></div>
          <div className="space-y-2"><Label>Mensaje de recordatorio</Label><Textarea rows={3} value={form.reminder_message} onChange={(e) => setForm({ ...form, reminder_message: e.target.value })} /></div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="gap-2">
        <MessageCircle className="h-4 w-4" /> Guardar configuración
      </Button>
    </div>
  );
};

export default WhatsAppPage;
