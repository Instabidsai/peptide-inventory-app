import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/sb_client/client';

export default function DebugAuth() {
    const { session, userRole, organization } = useAuth();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        window.location.href = '/';
    };

    const clearStorage = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/';
    };

    return (
        <div className="container max-w-2xl py-8">
            <Card>
                <CardHeader>
                    <CardTitle>Auth Debug Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <strong>Logged In:</strong> {session ? 'Yes' : 'No'}
                    </div>
                    {session && (
                        <>
                            <div>
                                <strong>Email:</strong> {session.user.email}
                            </div>
                            <div>
                                <strong>User ID:</strong> {session.user.id}
                            </div>
                            <div>
                                <strong>Role:</strong> {userRole?.role || 'Not set'}
                            </div>
                            <div>
                                <strong>Organization:</strong> {organization?.name || 'None'}
                            </div>
                        </>
                    )}

                    <div className="flex gap-2 pt-4">
                        <Button onClick={handleLogout} variant="destructive">
                            Force Logout
                        </Button>
                        <Button onClick={clearStorage} variant="outline">
                            Clear Storage & Reload
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
