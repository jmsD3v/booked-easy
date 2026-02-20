import { Link } from 'react-router-dom';
import { Calendar, Clock, Users, MessageCircle, BarChart3, Globe, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import heroImage from '@/assets/hero-booking.jpg';

const features = [
  { icon: Calendar, title: 'Agenda inteligente', desc: 'Vista diaria, semanal y mensual. Todo en un solo lugar.' },
  { icon: Users, title: 'Multi-negocio', desc: 'Gestiona múltiples sucursales desde un solo panel.' },
  { icon: MessageCircle, title: 'WhatsApp automático', desc: 'Confirmaciones y recordatorios automáticos por WhatsApp.' },
  { icon: Globe, title: 'Link público', desc: 'Compartí un link único para que tus clientes reserven.' },
  { icon: Clock, title: 'Horarios flexibles', desc: 'Configurá horarios por día, profesional y servicio.' },
  { icon: BarChart3, title: 'Estadísticas', desc: 'Conocé tus ingresos, ausencias y métricas clave.' },
];

const categories = ['Peluquerías', 'Barberías', 'Veterinarias', 'Lavaderos', 'Masajistas', 'Estéticas', 'Salones', 'Consultorios'];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Calendar className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold font-display">TurnoPro</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Iniciar sesión</Button>
            </Link>
            <Link to="/auth?mode=register">
              <Button size="sm">Crear cuenta gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-16">
        <div className="bg-hero">
          <div className="container grid gap-12 py-24 md:grid-cols-2 md:py-32 items-center">
            <div className="animate-fade-up">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary-foreground/80">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-primary">Para todo tipo de negocios</span>
              </div>
              <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight text-primary-foreground md:text-5xl lg:text-6xl font-display">
                Gestión de turnos{' '}
                <span className="text-gradient">simple y profesional</span>
              </h1>
              <p className="mb-8 max-w-md text-lg text-primary-foreground/70">
                Tu negocio necesita una agenda que funcione. Tus clientes reservan online, vos gestionás todo desde el panel. Sin complicaciones.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/auth?mode=register">
                  <Button size="lg" className="gap-2 text-base">
                    Empezar gratis <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/demo">
                  <Button variant="outline" size="lg" className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 text-base">
                    Ver demo
                  </Button>
                </Link>
              </div>
            </div>
            <div className="relative animate-float hidden md:block">
              <img src={heroImage} alt="Gestión de turnos" className="rounded-2xl shadow-elevated" />
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-b border-border py-10">
        <div className="container">
          <p className="mb-5 text-center text-sm font-medium text-muted-foreground">IDEAL PARA</p>
          <div className="flex flex-wrap justify-center gap-3">
            {categories.map((cat) => (
              <span key={cat} className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-card">
                {cat}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20">
        <div className="container">
          <div className="mb-14 text-center">
            <h2 className="mb-4 text-3xl font-bold font-display md:text-4xl">Todo lo que necesitás</h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Una plataforma completa para gestionar turnos, clientes y notificaciones.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="group rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:shadow-elevated hover:-translate-y-1">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent">
                  <f.icon className="h-6 w-6 text-accent-foreground" />
                </div>
                <h3 className="mb-2 text-lg font-semibold font-display">{f.title}</h3>
                <p className="text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-hero py-20">
        <div className="container text-center">
          <h2 className="mb-4 text-3xl font-bold text-primary-foreground font-display md:text-4xl">
            Empezá a gestionar tus turnos hoy
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-primary-foreground/70 text-lg">
            Creá tu cuenta en menos de un minuto. Sin tarjeta de crédito.
          </p>
          <Link to="/auth?mode=register">
            <Button size="lg" className="gap-2 text-base">
              Crear mi cuenta <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Calendar className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold font-display">TurnoPro</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2026 TurnoPro. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
