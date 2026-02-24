import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/sb_client/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, FlaskConical, AlertCircle } from "lucide-react";

export default function UpdatePassword() {
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [verifying, setVerifying] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const { session, loading: authLoading } = useAuth();

    useEffect(() => {
        if (authLoading) return;

        if (session) {
            setVerifying(false);
            return;
        }

        const hash = window.location.hash;

        if (hash.includes('access_token')) {
            // Supabase should pick up the token automatically
            const timeout = setTimeout(() => {
                if (!session) {
                    setError("The password reset link has expired or is invalid. Please request a new one.");
                    setVerifying(false);
                }
            }, 5000);
            return () => clearTimeout(timeout);
        }

        // Check for error from Supabase
        const errorDesc = searchParams.get('error_description');
        if (errorDesc) {
            setError(errorDesc);
            setVerifying(false);
            return;
        }

        // No session and no token — shouldn't be here
        setError("No valid reset link found. Please request a new password reset from the login page.");
        setVerifying(false);
    }, [session, authLoading, searchParams]);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            toast({ variant: "destructive", title: "Passwords do not match" });
            return;
        }
        if (password.length < 6) {
            toast({ variant: "destructive", title: "Password must be at least 6 characters" });
            return;
        }
        setLoading(true);
        const { error: updateErr } = await supabase.auth.updateUser({ password });
        if (updateErr) {
            toast({ variant: "destructive", title: "Update Failed", description: updateErr.message });
        } else {
            toast({ title: "Success", description: "Your password has been updated!" });
            navigate("/");
        }
        setLoading(false);
    };

    // Loading / verifying session
    if (verifying) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-4">
                <div className="text-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                    <p className="text-muted-foreground">Verifying your reset link...</p>
                </div>
            </div>
        );
    }

    // Error state — expired/invalid link
    if (error && !session) {
        return (
            <div className="flex h-screen items-center justify-center bg-background p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="flex justify-center mb-4">
                            <div className="p-3 bg-destructive/10 rounded-xl">
                                <AlertCircle className="h-8 w-8 text-destructive" />
                            </div>
                        </div>
                        <CardTitle>Reset Link Expired</CardTitle>
                        <CardDescription>{error}</CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-center">
                        <Link to="/auth">
                            <Button>Back to Login</Button>
                        </Link>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="flex justify-center mb-4">
                        <div className="p-3 bg-primary/10 rounded-xl">
                            <FlaskConical className="h-8 w-8 text-primary" />
                        </div>
                    </div>
                    <CardTitle>Set Your Password</CardTitle>
                    <CardDescription>Choose a secure password for your account</CardDescription>
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
                                placeholder="Minimum 6 characters"
                                autoComplete="new-password"
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
                                placeholder="Re-enter your password"
                                autoComplete="new-password"
                            />
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Set Password
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
