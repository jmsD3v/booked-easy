import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import PublicBooking from "./pages/PublicBooking";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import ServicesPage from "./pages/dashboard/ServicesPage";
import StaffPage from "./pages/dashboard/StaffPage";
import AgendaPage from "./pages/dashboard/AgendaPage";
import HoursPage from "./pages/dashboard/HoursPage";
import StatsPage from "./pages/dashboard/StatsPage";
import WhatsAppPage from "./pages/dashboard/WhatsAppPage";
import SettingsPage from "./pages/dashboard/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Cargando...</p></div>;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const DashboardRoutes = () => (
  <ProtectedRoute>
    <DashboardLayout>
      <Routes>
        <Route index element={<DashboardHome />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="hours" element={<HoursPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </DashboardLayout>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/b/:slug" element={<PublicBooking />} />
            <Route path="/dashboard/*" element={<DashboardRoutes />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
