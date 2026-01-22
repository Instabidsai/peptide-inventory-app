import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function Join() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [debugUrl, setDebugUrl] = useState<string | null>(null);

    const handleAccess = async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.functions.invoke('exchange-token', {
                body: { token }
            });

            if (error) throw error;
            if (data.error) throw new Error(data.error);

            if (data.url) {
                // STOP: Don't redirect automatically.
                // Show the URL so we can verify it.
                setDebugUrl(data.url);
            } else {
                throw new Error("No redirect URL returned");
            }

        } catch (err: any) {
            console.error("Exchange failed:", err);
            setError(err.message || "Failed to verify token");
            toast({
                variant: "destructive",
                title: "Access Denied",
                description: err.message
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle className="text-red-500">Invalid Link</CardTitle>
                        <CardDescription>This invite link is missing a valid token.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
            <Card className="max-w-md w-full shadow-2xl border-slate-700 bg-slate-900/50 text-white backdrop-blur">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Secure Access</CardTitle>
                    <CardDescription className="text-slate-400">
                        Click the button below to access your tailored peptide regimen.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    {error && (
                        <div className="p-3 text-sm bg-red-500/10 border border-red-500/20 text-red-400 rounded-md text-center">
                            {error}
                        </div>
                    )}

                    {debugUrl ? (
                        <div className="space-y-4">
                            <div className="p-3 bg-slate-950 rounded border border-slate-700">
                                <label className="text-xs text-slate-400 block mb-1">Generated Magic Link:</label>
                                <code className="text-[10px] break-all text-green-400 bg-black p-2 rounded block">
                                    {debugUrl}
                                </code>
                            </div>
                            <p className="text-xs text-yellow-500 text-center">
                                🛑 STOP! Check the URL above. <br />Does it end in "/join"? If so, that's the bug.
                            </p>
                            <Button size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={() => window.location.href = debugUrl}>
                                Proceed (Manually) <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    ) : (
                        <Button
                            size="lg"
                            className="w-full font-semibold text-lg h-12"
                            onClick={handleAccess}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Verifying...
                                </>
                            ) : (
                                <>
                                    Access Portal <ArrowRight className="ml-2 h-5 w-5" />
                                </>
                            )}
                        </Button>
                    )}
                    <p className="text-xs text-center text-slate-500 mt-4">
                        This extra step protects your one-time link from email scanners.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
