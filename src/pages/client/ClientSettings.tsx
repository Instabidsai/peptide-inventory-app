import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, LogOut, User, Lock, ChevronRight, Shield, Users, UserPlus, Copy, Trash2, Crown, Syringe, Refrigerator, ClipboardList } from 'lucide-react';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useClientProfile } from '@/hooks/use-client-profile';
import { useHouseholdMembers, useAddHouseholdMember, useRemoveHouseholdMember, useInviteHouseholdMember } from '@/hooks/use-household';
import { toast as sonnerToast } from 'sonner';

const profileSchema = z.object({
    full_name: z.string().min(2, 'Name must be at least 2 characters'),
});

const addMemberSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email').or(z.literal('')).optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;
type AddMemberFormData = z.infer<typeof addMemberSchema>;

function HouseholdSection() {
    const { data: contact } = useClientProfile();
    const { data: members, isLoading } = useHouseholdMembers(contact?.id);
    const addMember = useAddHouseholdMember(contact?.id);
    const removeMember = useRemoveHouseholdMember();
    const inviteMember = useInviteHouseholdMember();
    const [showAddForm, setShowAddForm] = useState(false);
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    const addForm = useForm<AddMemberFormData>({
        resolver: zodResolver(addMemberSchema),
        defaultValues: { name: '', email: '' },
    });

    const handleAddMember = async (data: AddMemberFormData) => {
        await addMember.mutateAsync({ name: data.name, email: data.email || undefined });
        addForm.reset();
        setShowAddForm(false);
        sonnerToast.success(`${data.name} added to your family!`, {
            description: data.email
                ? "They'll get an invite to log their own doses. Until then, you can log for them from the dashboard."
                : "You can log doses on their behalf from the dashboard.",
            duration: 6000,
        });
    };

    const handleRemove = (memberId: string) => {
        removeMember.mutate(memberId, {
            onSuccess: () => setConfirmRemoveId(null),
        });
    };

    const handleInvite = (memberId: string, email: string) => {
        inviteMember.mutate({ contactId: memberId, email });
    };

    const isOwner = members?.some(m => m.id === contact?.id && m.household_role === 'owner');
    const hasMembersOrHousehold = (members?.length ?? 0) > 0;

    return (
        <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">My Household</p>
            <Card className="bg-card/60 backdrop-blur-md border-white/[0.06] overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/40" />
                        </div>
                    ) : !hasMembersOrHousehold ? (
                        /* No household yet — prompt to create */
                        <div className="p-4 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-violet-500/10">
                                    <Users className="h-5 w-5 text-violet-400" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Share with family</p>
                                    <p className="text-xs text-muted-foreground/60">
                                        Add family members to share your fridge and track doses together
                                    </p>
                                </div>
                            </div>

                            {/* How it works */}
                            <div className="space-y-2.5 pl-1">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40">How it works</p>
                                <div className="flex items-start gap-2.5">
                                    <div className="p-1 rounded-md bg-emerald-500/10 mt-0.5">
                                        <Refrigerator className="h-3 w-3 text-emerald-400" />
                                    </div>
                                    <p className="text-xs text-muted-foreground/70">Everyone shares one fridge — vials are tracked together so you know what's left</p>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <div className="p-1 rounded-md bg-blue-500/10 mt-0.5">
                                        <ClipboardList className="h-3 w-3 text-blue-400" />
                                    </div>
                                    <p className="text-xs text-muted-foreground/70">Each person gets their own protocol and dose schedule from their provider</p>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <div className="p-1 rounded-md bg-violet-500/10 mt-0.5">
                                        <Syringe className="h-3 w-3 text-violet-400" />
                                    </div>
                                    <p className="text-xs text-muted-foreground/70">You can log doses for family until they create their own account</p>
                                </div>
                            </div>

                            <Button
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => setShowAddForm(true)}
                            >
                                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                Add First Member
                            </Button>
                        </div>
                    ) : (
                        /* Has household — show members */
                        <div>
                            {members?.map((member) => {
                                const isYou = member.id === contact?.id;
                                const memberInitials = member.name
                                    .split(' ')
                                    .map(n => n[0])
                                    .join('')
                                    .toUpperCase()
                                    .slice(0, 2);

                                return (
                                    <div
                                        key={member.id}
                                        className="flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0"
                                    >
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-gradient-to-br from-primary/15 to-violet-500/10 text-xs font-semibold">
                                                {memberInitials}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-medium truncate">{member.name}</span>
                                                {member.household_role === 'owner' && (
                                                    <Crown className="h-3 w-3 text-amber-400 shrink-0" />
                                                )}
                                                {isYou && (
                                                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5">You</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                {member.email && (
                                                    <span className="text-[11px] text-muted-foreground/50 truncate">{member.email}</span>
                                                )}
                                                {!member.is_linked && member.email && (
                                                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-amber-500/30 text-amber-400">
                                                        Not joined
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions for non-self members (owner only) */}
                                        {!isYou && isOwner && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                {member.email && !member.is_linked && (
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7"
                                                        disabled={inviteMember.isPending}
                                                        onClick={() => handleInvite(member.id, member.email!)}
                                                        title="Send invite link"
                                                    >
                                                        <Copy className="h-3 w-3 text-muted-foreground/60" />
                                                    </Button>
                                                )}
                                                {confirmRemoveId === member.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <Button
                                                            size="sm"
                                                            variant="destructive"
                                                            className="h-7 text-[11px] px-2"
                                                            disabled={removeMember.isPending}
                                                            onClick={() => handleRemove(member.id)}
                                                        >
                                                            {removeMember.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-7 text-[11px] px-2"
                                                            onClick={() => setConfirmRemoveId(null)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-7 w-7"
                                                        onClick={() => setConfirmRemoveId(member.id)}
                                                        title="Remove member"
                                                    >
                                                        <Trash2 className="h-3 w-3 text-muted-foreground/40" />
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Add member button */}
                            {isOwner && !showAddForm && (
                                <button
                                    onClick={() => setShowAddForm(true)}
                                    className="flex items-center gap-2 w-full px-4 py-3 hover:bg-white/[0.03] transition-colors text-muted-foreground/60"
                                >
                                    <UserPlus className="h-3.5 w-3.5" />
                                    <span className="text-xs font-medium">Add family member</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Inline add member form */}
                    <AnimatePresence>
                        {showAddForm && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                            >
                                <Form {...addForm}>
                                    <form
                                        onSubmit={addForm.handleSubmit(handleAddMember)}
                                        className="p-4 space-y-3 border-t border-border/30"
                                    >
                                        <FormField
                                            control={addForm.control}
                                            name="name"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Name</FormLabel>
                                                    <FormControl>
                                                        <Input {...field} placeholder="Family member's name" className="h-9" autoFocus />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={addForm.control}
                                            name="email"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-xs">Email (optional)</FormLabel>
                                                    <FormControl>
                                                        <Input {...field} placeholder="Their email to send an invite" className="h-9" type="email" />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                type="submit"
                                                size="sm"
                                                className="flex-1 h-9"
                                                disabled={addMember.isPending}
                                            >
                                                {addMember.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
                                                Add Member
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                className="h-9"
                                                onClick={() => { setShowAddForm(false); addForm.reset(); }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </form>
                                </Form>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>
        </div>
    );
}

export default function ClientSettings() {
    const { profile, userRole, refreshProfile, signOut } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const householdRef = useRef<HTMLDivElement>(null);
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const { brand_name: brandName } = useTenantConfig();

    // Deep-link: scroll to household section when navigated from menu
    useEffect(() => {
        if (searchParams.get('section') === 'family' && householdRef.current) {
            setTimeout(() => householdRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
        }
    }, [searchParams]);

    const profileForm = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: { full_name: profile?.full_name || '' },
    });

    // Sync form when profile loads asynchronously
    useEffect(() => {
        if (profile?.full_name) {
            profileForm.reset({ full_name: profile.full_name });
        }
    }, [profile?.full_name]);

    const handleUpdateProfile = async (data: ProfileFormData) => {
        if (!profile) return;
        setIsUpdatingProfile(true);

        try {
            const { error } = await supabase
                .from('profiles')
                .update({ full_name: data.full_name })
                .eq('id', profile.id);

            if (error) throw error;

            await refreshProfile();
            toast({ title: 'Profile updated successfully' });
        } catch (error) {
            toast({ variant: 'destructive', title: 'Failed to update profile', description: error instanceof Error ? error.message : 'Unknown error' });
        } finally {
            setIsUpdatingProfile(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
            navigate('/auth');
        } catch (error) {
            console.error("Sign out error", error);
        }
    };

    const initials = (profile?.full_name || 'U')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <motion.div
            className="space-y-6 max-w-md mx-auto pb-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Profile Hero Card */}
            <div className="flex flex-col items-center gap-3 pt-2 pb-4">
                <Avatar className="h-20 w-20 ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                    <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-xl font-bold">
                        {initials}
                    </AvatarFallback>
                </Avatar>
                <div className="text-center">
                    <h1 className="text-xl font-bold tracking-tight">{profile?.full_name || 'Your Account'}</h1>
                    <p className="text-sm text-muted-foreground/60">{profile?.email}</p>
                </div>
            </div>

            {/* Profile Section */}
            <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">Profile</p>
                <Card className="bg-card/60 backdrop-blur-md border-white/[0.06] overflow-hidden">
                    <CardContent className="p-0">
                        <Form {...profileForm}>
                            <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)}>
                                <FormField
                                    control={profileForm.control}
                                    name="full_name"
                                    render={({ field }) => (
                                        <FormItem className="px-4 py-3 border-b border-border/30">
                                            <div className="flex items-center justify-between">
                                                <FormLabel className="text-sm font-normal text-muted-foreground shrink-0 w-20">Name</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="border-0 bg-transparent text-right focus-visible:ring-0 focus-visible:ring-offset-0 h-auto p-0 text-sm font-medium shadow-none" />
                                                </FormControl>
                                            </div>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <div className="px-4 py-3 border-b border-border/30">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground shrink-0 w-20">Email</span>
                                        <span className="text-sm font-medium text-muted-foreground/60 truncate">{profile?.email || ''}</span>
                                    </div>
                                </div>
                                <div className="px-4 py-2.5">
                                    <Button type="submit" disabled={isUpdatingProfile} size="sm" className="w-full h-9">
                                        {isUpdatingProfile && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                                        Save Changes
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    </CardContent>
                </Card>
            </div>

            {/* My Household Section */}
            <div ref={householdRef}>
                <HouseholdSection />
            </div>

            {/* Security Section */}
            <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50 px-1">Security</p>
                <Card className="bg-card/60 backdrop-blur-md border-white/[0.06] overflow-hidden">
                    <CardContent className="p-0">
                        <button
                            onClick={() => navigate('/update-password')}
                            className="flex items-center justify-between w-full px-4 py-3.5 hover:bg-white/[0.03] transition-colors press-scale"
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-lg bg-blue-500/10">
                                    <Lock className="h-4 w-4 text-blue-400" />
                                </div>
                                <span className="text-sm font-medium">Change Password</span>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                        </button>
                    </CardContent>
                </Card>
            </div>

            {/* Sign Out */}
            <div className="space-y-1">
                <Card className="bg-card/60 backdrop-blur-md border-white/[0.06] overflow-hidden">
                    <CardContent className="p-0">
                        <button
                            onClick={handleSignOut}
                            className="flex items-center justify-center gap-2 w-full px-4 py-3.5 hover:bg-red-500/[0.06] transition-colors text-red-400 press-scale"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="text-sm font-medium">Sign Out</span>
                        </button>
                    </CardContent>
                </Card>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/30 tracking-wide">
                {brandName}
            </p>
        </motion.div>
    );
}
