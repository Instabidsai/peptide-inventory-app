import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_PAGE_SIZE, type PaginationState } from '@/hooks/use-pagination';

export type ContactType = 'customer' | 'preferred' | 'partner' | 'internal';

export type ContactSource = 'manual' | 'woocommerce' | 'import';

export interface Contact {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: ContactType;
  company: string | null;
  address: string | null;
  notes: string | null;
  source: ContactSource;
  woo_customer_id?: number | null;
  created_at: string;
  updated_at: string;
  linked_user_id?: string | null;
  tier?: 'family' | 'network' | 'public';
  invite_link?: string | null;
  assigned_rep_id?: string | null;
  discount_percent?: number | null;
  // Joined data from useContacts list query
  assigned_rep?: { id: string; full_name: string | null } | null;
  sales_orders?: { id: string; created_at: string }[];
}

export interface CreateContactInput {
  name: string;
  email?: string;
  phone?: string;
  type?: ContactType;
  company?: string;
  address?: string;
  notes?: string;
  linked_user_id?: string | null;
  tier?: 'family' | 'network' | 'public';
  assigned_rep_id?: string | null;
  discount_percent?: number | null;
}

export function useContacts(type?: ContactType, pagination?: PaginationState) {
  const { user, profile } = useAuth();
  const page = pagination?.page ?? 0;
  const pageSize = pagination?.pageSize ?? DEFAULT_PAGE_SIZE;

  return useQuery({
    queryKey: ['contacts', type, profile?.org_id, page, pageSize],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      if (!profile?.org_id) throw new Error('No organization found');

      let query = supabase
        .from('contacts')
        .select(`
          *,
          assigned_rep:assigned_rep_id (
            id,
            full_name
          ),
          sales_orders:sales_orders!client_id (id, created_at)
        `)
        .eq('org_id', profile.org_id)
        .order('name')
        .range(page * pageSize, page * pageSize + pageSize - 1);

      if (type) {
        query = query.eq('type', type);
      }

      // If user is sales_rep, restrict to their network (self + downline partners)
      if (profile?.role === 'sales_rep') {
        // profile.id is already available from useAuth — no extra query needed
        const profileId = profile.id;
        if (profileId) {
          const { data: downline } = await supabase
            .rpc('get_partner_downline', { root_id: user.id });
          const allRepIds = [profileId, ...(downline || []).map((d: { id: string }) => d.id)];
          query = query.in('assigned_rep_id', allRepIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!user && !!profile?.org_id,
    staleTime: 30_000, // 30s — contacts list tolerable staleness
  });
}

export function useContact(id: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['contacts', id, profile?.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          assigned_rep:assigned_rep_id (
            id,
            full_name
          )
        `)
        .eq('id', id)
        .eq('org_id', profile!.org_id!)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Contact not found');
      return data as Contact;
    },
    enabled: !!id && !!user && !!profile?.org_id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      if (!profile?.org_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...input, org_id: profile.org_id })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['downline_clients'] });
      queryClient.invalidateQueries({ queryKey: ['full_network'] });
      toast({ title: 'Customer created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to create customer', description: error.message });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<CreateContactInput> & { id: string }) => {
      const { data, error } = await supabase
        .from('contacts')
        .update(input)
        .eq('id', id)
        .select('*, linked_user_id')
        .maybeSingle();

      if (error) throw error;

      // Sync name to linked profile so partner area stays current
      if (input.name && data?.linked_user_id) {
        await supabase
          .from('profiles')
          .update({ full_name: input.name })
          .eq('user_id', data.linked_user_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['downline_clients'] });
      queryClient.invalidateQueries({ queryKey: ['full_network'] });
      queryClient.invalidateQueries({ queryKey: ['all_org_reps'] });
      queryClient.invalidateQueries({ queryKey: ['partner_downline'] });
      toast({ title: 'Customer updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update customer', description: error.message });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!profile?.org_id) throw new Error('No organization context');

      // Atomic cascade delete via Postgres RPC — all-or-nothing transaction
      const { data, error } = await supabase.rpc('delete_contact_cascade', {
        p_contact_id: id,
        p_org_id: profile.org_id,
      });

      if (error) throw new Error(`Delete failed: ${error.message}`);
      if (!data?.success) throw new Error(data?.error || 'Unknown delete error');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['downline_clients'] });
      queryClient.invalidateQueries({ queryKey: ['full_network'] });
      queryClient.invalidateQueries({ queryKey: ['sales_orders'] });
      queryClient.invalidateQueries({ queryKey: ['movements'] });
      queryClient.invalidateQueries({ queryKey: ['financial-metrics'] });
      toast({ title: 'Customer deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete customer', description: error.message });
    },
  });
}
