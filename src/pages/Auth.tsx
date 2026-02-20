import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Calendar, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

const Auth = () => {
  const [searchParams] = useSearchParams();
  const isRegister = searchParams.get('mode') === 'register';
  const [mode, setMode] = useState<'login' | 'register'>(isRegister ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'register') {
        if (!businessName.trim()) {
          toast.error('Ingresá el nombre de tu negocio');
          return;
        }
        await signUp(email, password, businessName);
        toast.success('¡Cuenta creada! Revisá tu email para confirmar.');
      } else {
        await signIn(email, password);
        toast.success('¡Bienvenido!');
        navigate('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="text-center">
          <Link to="/" className="mx-auto mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <Calendar className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold font-display">TurnoPro</span>
          </Link>
          <CardTitle className="font-display text-2xl">
            {mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </CardTitle>
          <CardDescription>
            {mode === 'login' ? 'Accedé a tu panel de gestión' : 'Registrá tu negocio en minutos'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="businessName">Nombre del negocio</Label>
                <Input
                  id="businessName"
                  placeholder="Ej: Barbería Don Carlos"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Cargando...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <p>
                ¿No tenés cuenta?{' '}
                <button onClick={() => setMode('register')} className="font-medium text-primary hover:underline">
                  Registrate
                </button>
              </p>
            ) : (
              <p>
                ¿Ya tenés cuenta?{' '}
                <button onClick={() => setMode('login')} className="font-medium text-primary hover:underline">
                  Iniciá sesión
                </button>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
