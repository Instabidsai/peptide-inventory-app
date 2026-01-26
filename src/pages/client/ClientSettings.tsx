import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/sb_client/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, LogOut, User, Lock, ChevronRight } from 'lucide-react';
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

    const profileForm = useForm<ProfileFormData>({
        resolver: zodResolver(profileSchema),
        defaultValues: { full_name: profile?.full_name || '' },
    });

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
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Failed to update profile', description: error.message });
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

    return (
        <div className="space-y-6 max-w-md mx-auto pb-10">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Account</h1>
                <p className="text-muted-foreground">Manage your profile and preferences</p>
            </div>

            <Card className="bg-card border-border shadow-sm">
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        <CardTitle>Profile</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(handleUpdateProfile)} className="space-y-4">
                            <FormField
                                control={profileForm.control}
                                name="full_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Full Name</FormLabel>
                                        <FormControl>
                                            <Input {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="space-y-2">
                                <FormLabel>Email</FormLabel>
                                <Input value={profile?.email || ''} disabled className="bg-muted text-muted-foreground" />
                            </div>

                            <Button type="submit" disabled={isUpdatingProfile} className="w-full">
                                {isUpdatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card className="bg-card border-border shadow-sm">
                <CardContent className="pt-6 space-y-4">
                    <Button variant="outline" className="w-full justify-between h-12" onClick={() => navigate('/update-password')}>
                        <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-slate-500" />
                            <span>Change Password</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                    </Button>

                    <Button variant="destructive" className="w-full h-12" onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Log Out
                    </Button>
                </CardContent>
            </Card>

            <div className="text-center text-xs text-muted-foreground">
                Version 2.1.0 • Peptide Inventory App
            </div>
        </div>
    );
}
