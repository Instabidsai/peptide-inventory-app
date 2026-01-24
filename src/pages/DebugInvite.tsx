import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DebugInvite() {
    const [logs, setLogs] = useState<string[]>([]);
    const [sessionStatus, setSessionStatus] = useState<string>("Checking...");

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toISOString().split('T')[1].slice(0, 8)}] ${msg}`, ...prev]);
    };

    useEffect(() => {
        addLog("Debug Page Mounted");
        addLog(`URL Hash: ${window.location.hash}`);
        addLog(`URL Search: ${window.location.search}`);

        // 1. Listen to Auth Events
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            addLog(`EVENT: ${event}`);
            if (session) {
                setSessionStatus(`Authenticated as ${session.user.email}`);
                addLog(`Session detected for ${session.user.email}`);
            } else {
                setSessionStatus("No Session");
            }
        });

        // 2. Check Initial Session
        supabase.auth.getSession().then(({ data, error }) => {
            if (error) addLog(`getSession Error: ${error.message}`);
            if (data.session) {
                addLog(`Initial Session: ${data.session.user.email}`);
                setSessionStatus(`Authenticated as ${data.session.user.email}`);
            } else {
                addLog("Initial Session: None");
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const manualCheck = async () => {
        addLog("Running manual check...");
        const { data, error } = await supabase.auth.getSession();
        if (error) addLog(`Manual Error: ${error.message}`);
        else if (data.session) {
            addLog(`Manual Success: ${data.session.user.email}`);
            setSessionStatus(`Authenticated as ${data.session.user.email}`);
        } else {
            addLog("Manual Check: No Session");
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 flex flex-col items-center">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                    <CardTitle>Invite System Debugger</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-4 bg-white border rounded shadow-sm">
                        <div className="font-bold text-sm text-gray-500">SESSION STATUS</div>
                        <div className="text-xl font-semibold text-blue-600">{sessionStatus}</div>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={manualCheck}>Re-Check Session</Button>
                        <Button variant="outline" onClick={() => window.location.reload()}>Refresh Page</Button>
                    </div>

                    <div className="space-y-1">
                        <div className="font-bold text-sm text-gray-500">LIVE LOGS</div>
                        <div className="h-96 overflow-auto bg-black text-green-400 p-4 rounded font-mono text-xs whitespace-pre-wrap">
                            {logs.join('\n')}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
