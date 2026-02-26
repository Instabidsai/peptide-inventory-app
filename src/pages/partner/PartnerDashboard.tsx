
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePartnerDownline, useCommissions, useCommissionStats, useDownlineClients, useAllOrgReps } from '@/hooks/use-partner';
import { useCreateContact } from '@/hooks/use-contacts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, ShoppingBag, Percent, UserPlus } from 'lucide-react';
import { QueryError } from '@/components/ui/query-error';
import { Skeleton } from '@/components/ui/skeleton';

import { logger } from '@/lib/logger';
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary';
import {
    TIER_INFO,
    EMPTY_PERSON,
    StatsCards,
    ApplyCommissionBanner,
    CommissionHistoryCard,
    NetworkHierarchyCard,
    DownlineActivity,
    ReferralLinkCard,
    TeamReferralLinks,
    BalanceSheet,
    CommissionsSheet,
    AmountOwedSheet,
    EarningsSheet,
    AddPersonSheet,
    type SheetView,
    type OwedMovement,
} from '@/components/partner';

export default function PartnerDashboard() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { profile: authProfile, userRole, user, refreshProfile } = useAuth();
    const { data: downline, isLoading: downlineLoading, isError: downlineError, refetch: downlineRefetch } = usePartnerDownline();
    const { data: commissions, isLoading: commissionsLoading, isError: commissionsError, refetch: commissionsRefetch } = useCommissions();
    const stats = useCommissionStats();
    const [activeSheet, setActiveSheet] = useState<SheetView>(null);
    const [newPerson, setNewPerson] = useState(EMPTY_PERSON);
    const createContact = useCreateContact();

    const tier = authProfile?.partner_tier || 'standard';
    const tierInfo = TIER_INFO[tier] || TIER_INFO.standard;
    const commRate = Number(authProfile?.commission_rate || 0) * 100;
    const creditBalance = Number(authProfile?.credit_balance || 0);

    // Compute actual discount % from price_multiplier
    const priceMultiplier = Number(authProfile?.price_multiplier || 1);
    const discountPct = Math.round((1 - priceMultiplier) * 100);

    // Fetch clients assigned to all reps in the org (not just downline)
    const myProfileId = authProfile?.id as string | undefined;
    const { data: allOrgReps } = useAllOrgReps();
    const allRepIds = allOrgReps?.map(r => r.id) || [
        ...(myProfileId ? [myProfileId] : []),
        ...(downline?.map(d => d.id) || [])
    ];
    const { data: clients } = useDownlineClients(allRepIds);

    // Fetch movements for Amount Owed (simple query -- just totals)
    const { data: owedMovements } = useQuery({
        queryKey: ['partner_owed_movements', user?.id],
        queryFn: async () => {
            if (!user?.id) return [];

            // Find linked contact
            const { data: contact } = await supabase
                .from('contacts')
                .select('id')
                .eq('linked_user_id', user.id)
                .maybeSingle();

            if (!contact?.id) return [];

            // Fetch movements with items (just price_at_sale for totals)
            const { data: movements, error } = await supabase
                .from('movements')
                .select('id, created_at, amount_paid, payment_status, discount_amount, notes, movement_items(price_at_sale)')
                .eq('contact_id', contact.id)
                .order('created_at', { ascending: true });

            if (error) {
                logger.error('owedMovements query error:', error);
                return [];
            }
            if (!movements?.length) return [];

            return movements.map((m) => {
                const items = (m.movement_items || []) as { price_at_sale: number }[];
                const subtotal = items.reduce((s, i) => s + (Number(i.price_at_sale) || 0), 0);
                const discount = Number(m.discount_amount) || 0;
                const paid = Number(m.amount_paid) || 0;
                const owed = Math.max(0, subtotal - discount - paid);
                const itemCount = items.length;
                return { ...m, subtotal, discount, paid, owed, itemCount, items: [] as never[] };
            }) as OwedMovement[];
        },
        enabled: !!user?.id,
    });

    const totalOwed = owedMovements?.reduce((s, m) => s + m.owed, 0) || 0;
    const unpaidMovements = owedMovements?.filter((m) => m.owed > 0) || [];

    // Apply commissions to amount owed mutation
    const applyCommissions = useMutation({
        mutationFn: async () => {
            if (!myProfileId) throw new Error('No profile');
            const { data, error } = await supabase.rpc('apply_commissions_to_owed', {
                partner_profile_id: myProfileId
            });
            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            const result = data as { applied: number; remaining_credit: number };
            toast({
                title: 'Commissions Applied',
                description: `$${Number(result.applied).toFixed(2)} applied to owed balance. ${result.remaining_credit > 0 ? `$${Number(result.remaining_credit).toFixed(2)} added to store credit.` : ''}`,
            });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            queryClient.invalidateQueries({ queryKey: ['partner_owed_movements'] });
            queryClient.invalidateQueries({ queryKey: ['partner_amount_owed'] });
            queryClient.invalidateQueries({ queryKey: ['my_sidebar_profile'] });
            refreshProfile?.();
        },
        onError: (err) => {
            toast({ title: 'Error', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
        }
    });

    // Convert commission to store credit mutation
    const convertToCredit = useMutation({
        mutationFn: async (commissionId: string) => {
            const commission = commissions?.find((c) => c.id === commissionId);
            if (commission?.status === 'paid') {
                throw new Error('Commission already converted');
            }
            if (commission && commission.status !== 'available') {
                throw new Error(`Cannot convert commission with status "${commission.status}". Only available commissions can be converted.`);
            }
            const { error } = await supabase.rpc('convert_commission_to_credit', { commission_id: commissionId });
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: 'Converted', description: 'Commission added to your store credit.' });
            queryClient.invalidateQueries({ queryKey: ['commissions'] });
            queryClient.invalidateQueries({ queryKey: ['commission_stats'] });
            queryClient.invalidateQueries({ queryKey: ['my_sidebar_profile'] });
            refreshProfile?.();
        },
        onError: (err) => {
            toast({ title: 'Error', description: (err as any)?.message || 'Unknown error', variant: 'destructive' });
        }
    });

    const closeSheet = () => { setActiveSheet(null); setNewPerson(EMPTY_PERSON); };

    const handleAddPerson = async (person: typeof EMPTY_PERSON) => {
        const assignedTo = person.assignedTo || myProfileId || undefined;
        try {
            await createContact.mutateAsync({
                name: person.name.trim(),
                email: person.email.trim() || undefined,
                phone: person.phone.trim() || undefined,
                address: person.address.trim() || undefined,
                type: 'customer',
                assigned_rep_id: assignedTo || null,
            });
            queryClient.invalidateQueries({ queryKey: ['downline_clients'] });
            setActiveSheet(null);
            setNewPerson(EMPTY_PERSON);
        } catch {
            // useCreateContact already toasts the error
        }
    };

    if (downlineError || commissionsError) {
        return <QueryError message="Failed to load partner data." onRetry={() => { downlineRefetch(); commissionsRefetch(); }} />;
    }

    if (downlineLoading && commissionsLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
                </div>
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold tracking-tight">Partner Portal</h1>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setActiveSheet('add-person')}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Add Person
                        </Button>
                        <Link to="/partner/store">
                            <Button variant="default" size="sm">
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Order Peptides
                            </Button>
                        </Link>
                        {(userRole?.role === 'admin' || userRole?.role === 'super_admin') && (
                            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="border-primary/20 hover:bg-primary/10 hover:text-primary">
                                <DollarSign className="mr-2 h-4 w-4" />
                                Return to Admin
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-muted-foreground">Manage your team and track your earnings.</p>
                    <Badge variant="outline" className="text-xs border-primary/30 bg-primary/5">
                        {tierInfo.emoji} {tierInfo.label}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                        <Percent className="h-3 w-3 mr-1" />
                        {authProfile?.pricing_mode === 'cost_plus'
                            ? `Cost + $${Number(authProfile?.cost_plus_markup || 0)}`
                            : `${discountPct}% off retail`
                        } · {commRate.toFixed(1)}% commission
                    </Badge>
                </div>
            </div>

            {/* Referral Links */}
            <SectionErrorBoundary section="Referral Links">
            <ReferralLinkCard profileId={myProfileId} partnerTier={tier} userRole={userRole?.role} />
            <TeamReferralLinks downline={downline || []} />
            </SectionErrorBoundary>

            {/* Stats Overview */}
            <SectionErrorBoundary section="Stats Overview">
            <StatsCards
                stats={stats}
                creditBalance={creditBalance}
                totalOwed={totalOwed}
                unpaidCount={unpaidMovements.length}
                downlineCount={downline?.length || 0}
                clientCount={clients?.length || 0}
                onOpenSheet={setActiveSheet}
            />
            </SectionErrorBoundary>

            {/* Apply Commission Banner */}
            <ApplyCommissionBanner
                availableAmount={stats.available + creditBalance}
                totalOwed={totalOwed}
                isPending={applyCommissions.isPending}
                onApply={() => applyCommissions.mutate()}
            />

            {/* Commission History + Network Hierarchy */}
            <SectionErrorBoundary section="Commissions & Network">
            <div className="grid gap-4 md:grid-cols-2">
                <CommissionHistoryCard
                    commissions={commissions}
                    isLoading={commissionsLoading}
                />
                <NetworkHierarchyCard
                    rootName={authProfile?.full_name || 'You'}
                    rootTier={tier}
                    rootProfileId={myProfileId || null}
                    partners={downline || []}
                    clients={clients || []}
                    allOrgReps={allOrgReps}
                    isLoading={downlineLoading}
                    onAddPerson={() => setActiveSheet('add-person')}
                />
            </div>
            </SectionErrorBoundary>

            {/* Downline Activity */}
            <SectionErrorBoundary section="Downline Activity">
            <DownlineActivity downline={downline || []} />
            </SectionErrorBoundary>

            {/* Detail Sheets */}
            <BalanceSheet
                open={activeSheet === 'balance'}
                onClose={closeSheet}
                creditBalance={creditBalance}
                stats={stats}
                commissions={commissions}
            />

            <CommissionsSheet
                open={activeSheet === 'commissions'}
                onClose={closeSheet}
                stats={stats}
                commissions={commissions}
                totalOwed={totalOwed}
                applyPending={applyCommissions.isPending}
                convertPending={convertToCredit.isPending}
                onApplyCommissions={() => applyCommissions.mutate()}
                onConvertToCredit={(id) => convertToCredit.mutate(id)}
            />

            <AmountOwedSheet
                open={activeSheet === 'owed'}
                onClose={closeSheet}
                totalOwed={totalOwed}
                unpaidMovements={unpaidMovements}
                allMovements={owedMovements}
                stats={stats}
                applyPending={applyCommissions.isPending}
                onApplyCommissions={() => applyCommissions.mutate()}
            />

            <EarningsSheet
                open={activeSheet === 'earnings'}
                onClose={closeSheet}
                stats={stats}
                commissions={commissions}
            />

            <AddPersonSheet
                open={activeSheet === 'add-person'}
                onClose={closeSheet}
                newPerson={newPerson}
                onPersonChange={setNewPerson}
                downline={downline}
                allOrgReps={allOrgReps}
                authProfileName={authProfile?.full_name}
                myProfileId={myProfileId}
                isPending={createContact.isPending}
                onSubmit={handleAddPerson}
            />
        </div>
    );
}
