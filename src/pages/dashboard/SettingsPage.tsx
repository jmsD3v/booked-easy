import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useBusiness } from '@/hooks/useBusiness';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Copy, ExternalLink, Upload, QrCode } from 'lucide-react';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

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
  const [form, setForm] = useState({
    name: '', description: '', phone: '', email: '', category: 'general',
    payment_alias: '', payment_note: '',
  });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (business) {
      setForm({
        name: business.name || '',
        description: business.description || '',
        phone: business.phone || '',
        email: business.email || '',
        category: business.category || 'general',
        payment_alias: business.payment_alias || '',
        payment_note: business.payment_note || '',
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

  // Shared by the logo and the payment QR — same bucket, same
  // business_id-scoped RLS, only the filename and the target column differ.
  const uploadBusinessImage = async (
    file: File,
    filename: 'logo' | 'qr',
    column: 'logo_url' | 'payment_qr_url',
    setUploading: (v: boolean) => void,
    successMessage: string,
  ) => {
    if (!business) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Tiene que ser una imagen');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('La imagen no puede pesar más de 2MB');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${business.id}/${filename}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl: url } } = supabase.storage.from('logos').getPublicUrl(path);
      // Cache-bust so the new image shows immediately instead of the
      // browser's cached copy of the old file at the same path.
      const bustedUrl = `${url}?v=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('businesses')
        .update({ [column]: bustedUrl })
        .eq('id', business.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ['business'] });
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(err.message || 'Error al subir la imagen');
    } finally {
      setUploading(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadBusinessImage(file, 'logo', 'logo_url', setUploadingLogo, 'Logo actualizado');
  };

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) uploadBusinessImage(file, 'qr', 'payment_qr_url', setUploadingQr, 'QR actualizado');
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
          <CardTitle className="font-display">Logo</CardTitle>
          <CardDescription>Se muestra en tu página pública de reservas</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Avatar className="h-20 w-20">
              <AvatarImage src={business?.logo_url || undefined} alt={business?.name} />
              <AvatarFallback className="text-2xl">{business?.name?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploadingLogo} onClick={() => logoInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> {uploadingLogo ? 'Subiendo...' : 'Cambiar logo'}
              </Button>
              <p className="text-xs text-muted-foreground">JPG o PNG, hasta 2MB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Datos de pago</CardTitle>
          <CardDescription>Se muestran al cliente apenas confirma el turno, para que transfiera sin ida y vuelta por WhatsApp</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Alias o CBU</Label>
            <Input placeholder="Ej: barberia.elzorro.mp" value={form.payment_alias} onChange={(e) => setForm({ ...form, payment_alias: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Nota <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea rows={2} placeholder="Ej: Señá el 50% para confirmar el turno" value={form.payment_note} onChange={(e) => setForm({ ...form, payment_note: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>QR para transferir <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              {business?.payment_qr_url ? (
                <img src={business.payment_qr_url} alt="QR de pago" className="h-24 w-24 rounded-lg border border-border object-cover" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
                  <QrCode className="h-8 w-8" />
                </div>
              )}
              <div className="flex flex-col items-center gap-2 sm:items-start">
                <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
                <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploadingQr} onClick={() => qrInputRef.current?.click()}>
                  <Upload className="h-4 w-4" /> {uploadingQr ? 'Subiendo...' : 'Subir QR'}
                </Button>
                <p className="text-xs text-muted-foreground">Captura del QR de tu billetera virtual</p>
              </div>
            </div>
          </div>
          <Button onClick={handleSave}>Guardar cambios</Button>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
