import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ContactType = 'customer' | 'partner' | 'internal';

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
  created_at: string;
  updated_at: string;
  linked_user_id?: string | null;
  tier?: 'family' | 'network' | 'public';
  invite_link?: string | null;
  assigned_rep_id?: string | null;
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
}

export function useContacts(type?: ContactType) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['contacts', type, profile?.org_id],
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
        .order('name');

      if (type) {
        query = query.eq('type', type);
      }

      // If user is sales_rep, restrict to their network (self + downline partners)
      if (profile?.role === 'sales_rep') {
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (myProfile) {
          const { data: downline } = await supabase
            .rpc('get_partner_downline', { root_id: user.id });
          const allRepIds = [myProfile.id, ...(downline || []).map((d: any) => d.id)];
          query = query.in('assigned_rep_id', allRepIds);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Contact[];
    },
    enabled: !!user && !!profile?.org_id,
  });
}

export function useContact(id: string) {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ['contacts', id],
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
        .single();

      if (error) throw error;
      return data as Contact;
    },
    enabled: !!id && !!user && !!profile?.org_id,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.org_id) throw new Error('No organization found');

      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...input, org_id: profile.org_id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: 'Contact created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to create contact', description: error.message });
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
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: 'Contact updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update contact', description: error.message });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      // IMPORTANT: This cascade delete should ideally be a single DB transaction
      // (e.g., a Supabase RPC/stored procedure) to guarantee atomicity.
      // If any step fails, earlier deletes cannot be rolled back from the client.

      // Step 1: Delete dependent sales_orders
      const { error: soError } = await supabase.from('sales_orders').delete().eq('client_id', id);
      if (soError) throw new Error(`Failed to delete related sales orders: ${soError.message}`);

      // Step 2: Delete dependent movements
      const { error: movError } = await supabase.from('movements').delete().eq('contact_id', id);
      if (movError) throw new Error(`Failed to delete related movements: ${movError.message}`);

      // Step 3: Delete dependent client_inventory
      const { error: invError } = await supabase.from('client_inventory').delete().eq('contact_id', id);
      if (invError) throw new Error(`Failed to delete related inventory: ${invError.message}`);

      // Step 4: Finally delete the contact
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw new Error(`Failed to delete contact: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast({ title: 'Contact deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete contact', description: error.message });
    },
  });
}
