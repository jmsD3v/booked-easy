import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBusiness } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ExternalLink } from 'lucide-react';

const categories = [
  { value: 'peluqueria', label: 'Peluquería' },
  { value: 'barberia', label: 'Barbería' },
  { value: 'salon', label: 'Salón de belleza' },
  { value: 'estetica', label: 'Estética' },
  { value: 'veterinaria', label: 'Veterinaria' },
  { value: 'lavadero', label: 'Lavadero de autos' },
  { value: 'masajista', label: 'Masajista' },
  { value: 'consultorio', label: 'Consultorio' },
  { value: 'general', label: 'Otro' },
];

const SettingsPage = () => {
  const { data: business } = useBusiness();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', phone: '', email: '', category: 'general' });

  useEffect(() => {
    if (business) {
      setForm({
        name: business.name || '',
        description: business.description || '',
        phone: business.phone || '',
        email: business.email || '',
        category: business.category || 'general',
      });
    }
  }, [business]);

  const handleSave = async () => {
    if (!business) return;
    const { error } = await supabase.from('businesses').update(form).eq('id', business.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Configuración guardada');
      queryClient.invalidateQueries({ queryKey: ['business'] });
    }
  };

  const publicUrl = `${window.location.origin}/b/${business?.slug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success('Link copiado al portapapeles');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Configuración</h1>
        <p className="text-muted-foreground">Datos de tu negocio</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Link público</CardTitle>
          <CardDescription>Compartí este link con tus clientes para que reserven turnos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={publicUrl} readOnly className="bg-secondary" />
            <Button variant="outline" size="icon" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon"><ExternalLink className="h-4 w-4" /></Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Datos del negocio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2"><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Rubro</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          </div>
          <Button onClick={handleSave}>Guardar cambios</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;
