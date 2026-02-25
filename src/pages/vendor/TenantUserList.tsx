import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/sb_client/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';

interface TenantUser {
    user_id: string;
    full_name: string;
    email: string;
    role: string;
    created_at: string;
    last_sign_in_at: string | null;
}

const ROLE_OPTIONS = ['admin', 'staff', 'sales_rep', 'fulfillment'] as const;

const ROLE_ICONS: Record<string, typeof Shield> = {
    admin: ShieldCheck,
    staff: Shield,
    sales_rep: Shield,
    fulfillment: Shield,
    super_admin: ShieldAlert,
};

export default function TenantUserList({ orgId }: { orgId: string }) {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    const { data: users, isLoading } = useQuery({
        queryKey: ['tenant-users', orgId],
        queryFn: async (): Promise<TenantUser[]> => {
            // Get profiles with roles for this org
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('user_id:id, full_name, email, role, created_at')
                .eq('org_id', orgId);

            if (error) throw error;
            if (!profiles?.length) return [];

            // Get last sign-in from user_roles (which may have updated_at)
            const { data: roles } = await supabase
                .from('user_roles')
                .select('user_id, role, updated_at')
                .eq('org_id', orgId);

            const roleMap = new Map(roles?.map(r => [r.user_id, r]) || []);

            return profiles.map(p => ({
                user_id: p.user_id,
                full_name: p.full_name || '(no name)',
                email: p.email || '',
                role: roleMap.get(p.user_id)?.role || p.role || 'staff',
                created_at: p.created_at,
                last_sign_in_at: roleMap.get(p.user_id)?.updated_at || null,
            }));
        },
        enabled: !!orgId,
    });

    const changeRole = async (userId: string, newRole: string) => {
        const { error } = await supabase
            .from('user_roles')
            .upsert(
                { user_id: userId, org_id: orgId, role: newRole },
                { onConflict: 'user_id,org_id' },
            );

        if (error) {
            toast({ variant: 'destructive', title: 'Failed to update role', description: error.message });
            return;
        }

        // Also update profiles.role for consistency
        await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        queryClient.invalidateQueries({ queryKey: ['tenant-users', orgId] });
        toast({ title: 'Role updated' });
    };

    if (isLoading) return <Skeleton className="h-48 w-full" />;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">Users</CardTitle>
                <CardDescription>{users?.length || 0} team members</CardDescription>
            </CardHeader>
            <CardContent>
                {!users?.length ? (
                    <p className="text-sm text-muted-foreground">No users found</p>
                ) : (
                    <div className="space-y-3">
                        {users.map(u => {
                            const Icon = ROLE_ICONS[u.role] || Shield;
                            return (
                                <div key={u.user_id} className="flex items-center justify-between py-2 px-2 rounded hover:bg-muted/50">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{u.full_name}</p>
                                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <Select value={u.role} onValueChange={v => changeRole(u.user_id, v)}>
                                            <SelectTrigger className="h-7 w-[120px] text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ROLE_OPTIONS.map(r => (
                                                    <SelectItem key={r} value={r} className="text-xs capitalize">
                                                        {r.replace(/_/g, ' ')}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                                            {u.created_at ? format(new Date(u.created_at), 'MMM d') : '—'}
                                        </Badge>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
