import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useBusiness, useServices } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const ServicesPage = () => {
  const { data: business } = useBusiness();
  const { data: services } = useServices(business?.id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', duration_minutes: 30, price: 0 });

  const resetForm = () => {
    setForm({ name: '', description: '', duration_minutes: 30, price: 0 });
    setEditId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;

    try {
      if (editId) {
        const { error } = await supabase.from('services').update(form).eq('id', editId);
        if (error) throw error;
        toast.success('Servicio actualizado');
      } else {
        const { error } = await supabase.from('services').insert({ ...form, business_id: business.id });
        if (error) throw error;
        toast.success('Servicio creado');
      }
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('services').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Servicio eliminado');
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  };

  const handleEdit = (service: any) => {
    setForm({
      name: service.name,
      description: service.description || '',
      duration_minutes: service.duration_minutes,
      price: service.price,
    });
    setEditId(service.id);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Servicios</h1>
          <p className="text-muted-foreground">Gestioná los servicios que ofrecés</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Nuevo servicio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editId ? 'Editar' : 'Nuevo'} servicio</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Descripción</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duración (min)</Label>
                  <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 30 })} />
                </div>
                <div className="space-y-2">
                  <Label>Precio ($)</Label>
                  <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Crear servicio'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {services?.map((service: any) => (
          <Card key={service.id} className="shadow-card">
            <CardContent className="p-5">
              <div className="mb-3 flex items-start justify-between">
                <h3 className="font-semibold font-display">{service.name}</h3>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(service)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(service.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {service.description && <p className="mb-3 text-sm text-muted-foreground">{service.description}</p>}
              <div className="flex items-center gap-4 text-sm">
                <span className="rounded-full bg-accent px-3 py-1 font-medium text-accent-foreground">
                  {service.duration_minutes} min
                </span>
                <span className="font-bold text-primary">${service.price}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {!services?.length && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No hay servicios todavía. Creá el primero.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ServicesPage;
