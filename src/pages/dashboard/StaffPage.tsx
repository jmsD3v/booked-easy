import { useState } from 'react';
import { Plus, Pencil, Trash2, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useBusiness, useStaff } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const StaffPage = () => {
  const { data: business } = useBusiness();
  const { data: staff } = useStaff(business?.id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const resetForm = () => { setForm({ name: '', email: '', phone: '' }); setEditId(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    try {
      if (editId) {
        const { error } = await supabase.from('staff').update(form).eq('id', editId);
        if (error) throw error;
        toast.success('Personal actualizado');
      } else {
        const { error } = await supabase.from('staff').insert({ ...form, business_id: business.id });
        if (error) throw error;
        toast.success('Personal agregado');
      }
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Personal eliminado'); queryClient.invalidateQueries({ queryKey: ['staff'] }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Personal</h1>
          <p className="text-muted-foreground">Gestioná tu equipo de trabajo</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Agregar personal</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-display">{editId ? 'Editar' : 'Agregar'} personal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <Button type="submit" className="w-full">{editId ? 'Guardar cambios' : 'Agregar'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staff?.map((s: any) => (
          <Card key={s.id} className="shadow-card">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
                <UserCircle className="h-7 w-7 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">{s.name}</p>
                {s.phone && <p className="text-sm text-muted-foreground">{s.phone}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setForm({ name: s.name, email: s.email || '', phone: s.phone || '' }); setEditId(s.id); setOpen(true); }} className="rounded p-1.5 text-muted-foreground hover:bg-secondary"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDelete(s.id)} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!staff?.length && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No hay personal todavía. Agregá el primero.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffPage;
