import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export const useBusiness = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['business', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
};

export const useServices = (businessId?: string) => {
  return useQuery({
    queryKey: ['services', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('business_id', businessId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!businessId,
  });
};

export const useStaff = (businessId?: string) => {
  return useQuery({
    queryKey: ['staff', businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .eq('business_id', businessId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!businessId,
  });
};

export const useAppointments = (businessId?: string, date?: string) => {
  return useQuery({
    queryKey: ['appointments', businessId, date],
    queryFn: async () => {
      let query = supabase
        .from('appointments')
        .select('*, services(name, duration_minutes, price), staff(name)')
        .eq('business_id', businessId!)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (date) {
        query = query.eq('appointment_date', date);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!businessId,
  });
};
