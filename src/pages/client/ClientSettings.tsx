import { useState, useEffect } from 'react';
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
import { motion } from 'framer-motion';
import { Loader2, LogOut, User, Lock, ChevronRight, Shield } from 'lucide-react';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { useNavigate } from 'react-router-dom';

const profileSchema = z.object({
    full_name: z.string().min(2, 'Name must be at least 2 characters'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ClientSettings() {
    const { profile, userRole, refreshProfile, signOut } = useAuth();
    const { toast } = useToast();
    const navigate = useNavigate();
    const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
    const { brand_name: brandName } = useTenantConfig();

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
