import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/sb_client/client";
import { invokeEdgeFunction } from '@/lib/edge-functions';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react";
import { logger } from '@/lib/logger';

export default function Join() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAccess = async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: invokeError } = await invokeEdgeFunction<{ url?: string; error?: string }>('exchange-token', { token });

            if (invokeError) throw new Error(invokeError.message);
            if (data.error) throw new Error(data.error);

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No redirect URL returned");
            }
        } catch (err) {
            setError((err as any)?.message || "Something went wrong. Please try again or contact support.");
            logger.error("Join token exchange error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Card className="max-w-md w-full text-center">
                    <CardHeader>
                        <CardTitle className="text-destructive">Invalid Link</CardTitle>
                        <CardDescription>This invite link is missing a valid token.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 relative overflow-hidden">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-[100px] animate-pulse [animation-delay:1s]" />
            </div>
            <Card className="max-w-md w-full shadow-2xl border-border/50 bg-card/70 backdrop-blur-xl relative z-10">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Secure Access</CardTitle>
                    <CardDescription className="text-muted-foreground">
                        Click the button below to access your tailored peptide regimen.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                    {error && (
                        <div className="p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-center">
                            {error}
                        </div>
                    )}

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
                    <p className="text-xs text-center text-muted-foreground/50 mt-4">
                        This extra step protects your one-time link from email scanners.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
