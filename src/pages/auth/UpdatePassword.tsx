
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/sb_client/client";
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
    const { session, loading: authLoading } = useAuth();

    // DEBUG STATE
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const addLog = (msg: string) => setDebugLog(prev => [...prev, `${new Date().toISOString().split('T')[1]} - ${msg}`]);

    useEffect(() => {
        addLog(`Mount. AuthLoading: ${authLoading}, Session: ${!!session}`);

        if (authLoading) return;

        if (session) {
            addLog("Session found! User: " + session.user.email);
            setVerifying(false);
            return;
        }

        const hash = window.location.hash;
        addLog(`Hash present: ${hash ? 'Yes (' + hash.substring(0, 15) + '...)' : 'No'}`);

        if (hash.includes('access_token')) {
            addLog("Access Token found in Hash. Waiting for Supabase...");
            // Supabase should pick this up automatically.
            // We set a long timeout just to show if it FAILS.
            setTimeout(() => {
                if (!session) addLog("TIMEOUT: Supabase did not create session after 5s.");
            }, 5000);
            return;
        }

        const errorDesc = customHashParam('error_description') || searchParams.get('error_description');
        if (errorDesc) {
            addLog(`Supabase Error Detected: ${errorDesc}`);
        } else {
            addLog("No session, no hash token. Why are we here?");
        }

        // DISABLE REDIRECTS FOR DEBUGGING
        // navigate("/auth"); 

    }, [session, authLoading, searchParams]);

    // Helper to parse hash manually if URLSearchParams fails
    const customHashParam = (key: string) => {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        return params.get(key);
    }

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirm) {
            toast({ variant: "destructive", title: "Passwords do not match" });
            return;
        }
        setLoading(true);
        const { error } = await supabase.auth.updateUser({ password: password });
        if (error) {
            toast({ variant: "destructive", title: "Update Failed", description: error.message });
            addLog(`Update Failed: ${error.message}`);
        } else {
            toast({ title: "Success", description: "Password Set!" });
            navigate("/dashboard");
        }
        setLoading(false);
    };

    if (verifying && !session) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-gray-50 p-4 space-y-4">
                <Card className="w-full max-w-lg border-orange-500 border-2">
                    <CardHeader><CardTitle className="text-orange-600">⚠️ DEBUG MODE: DIAGNOSING REDIRECT</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <p>We trapped the redirect! Taking a look at why Supabase isn't logging you in...</p>
                        <div className="bg-slate-900 text-green-400 p-4 rounded text-xs font-mono h-64 overflow-auto">
                            {debugLog.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                        <p className="text-sm text-slate-500">
                            If you see "Success" or "Session found" above, we are good.
                            If it hangs on "Waiting...", Supabase is rejecting the token silently.
                        </p>
                    </CardContent>
                </Card>
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
                            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Confirm Password</label>
                            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} />
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
