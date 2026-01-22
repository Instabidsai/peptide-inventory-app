
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function UpdatePassword() {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const { session, loading: authLoading } = useAuth(); // START CHANGE: Use global auth state

    useEffect(() => {
        let mounted = true;

        // 1. If global auth is still loading, wait.
        if (authLoading) return;

        // 2. If session exists, we are good!
        if (session) {
            console.log("Session verified via AuthContext:", session.user.email);
            setVerifying(false);
            return;
        }

        // 3. Check for specific link errors in URL fragment or query
        // Supabase often puts errors in the hash: #error=access_denied&error_description=...
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

        if (errorDesc) {
            if (mounted) {
                console.error("Link Verification Error:", errorDesc);
                toast({
                    variant: "destructive",
                    title: "Link Verification Failed",
                    description: decodeURIComponent(errorDesc.replace(/\+/g, ' '))
                });
                navigate("/auth");
            }
            return;
        }

        // 4. Fallback Timeout
        // If auth loaded, no session, and no error... maybe latency?
        const timeoutId = setTimeout(() => {
            if (mounted && !session) {
                // Double check directly one last time
                supabase.auth.getSession().then(({ data }) => {
                    if (!data.session && mounted) {
                        console.error("Verification timeout - no session established.");
                        toast({
                            variant: "destructive",
                            title: "Link Invalid",
                            description: "We couldn't log you in. The link may have expired or was already used."
                        });
                        navigate("/auth?error=invalid_link");
                    }
                });
            }
        }, 2500); // 2.5s grace period

        return () => {
            mounted = false;
            clearTimeout(timeoutId);
        };
    }, [session, authLoading, navigate, toast, searchParams]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            toast({ variant: "destructive", title: "Passwords do not match" });
            return;
        }
        if (password.length < 6) {
            toast({ variant: "destructive", title: "Password too short", description: "Must be at least 6 characters." });
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: password });

        if (error) {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
        } else {
            toast({ title: "Password Set Successfully", description: "Welcome to the Family Hub!" });
            navigate("/dashboard");
        }
        setLoading(false);
    };

    if (verifying) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Welcome! Set Your Password</CardTitle>
                </CardHeader>
                <form onSubmit={handleUpdate}>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">New Password</label>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Confirm Password</label>
                            <Input
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Set Password & Enter
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
