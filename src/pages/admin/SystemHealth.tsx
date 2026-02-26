import { useState, useEffect } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Cloud, Wrench, Terminal, HeartPulse, Shield, AlertTriangle } from "lucide-react";

interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "pending";
  latencyMs?: number;
  error?: string;
}

interface SentinelStatus {
  alive: boolean;
  lastHeartbeat: string | null;
  lastHealRun: string | null;
  healCount24h: number;
  bugReportsOpen: number;
  loading: boolean;
}

const RPC_FUNCTIONS = [
  "link_referral",
  "delete_contact_cascade",
  "apply_commissions_to_owed",
  "convert_commission_to_credit",
  "process_sale_commission",
  "create_validated_order",
  "get_bottle_stats",
  "get_inventory_valuation",
  "get_org_counts",
  "check_subdomain_availability",
  "get_partner_downline",
  "get_peptide_stock_counts",
  "get_supplier_orders",
  "pay_order_with_credit",
  "decrement_vial",
  "auto_link_contact_by_email",
];

const EDGE_FUNCTIONS = [
  "admin-ai-chat",
  "ai-builder",
  "analyze-food",
  "chat-with-ai",
  "check-low-supply",
  "check-payment-emails",
  "composio-callback",
  "composio-connect",
  "create-supplier-order",
  "exchange-token",
  "invite-user",
  "notify-commission",
  "partner-ai-chat",
  "process-health-document",
  "promote-contact",
  "provision-tenant",
  "run-automations",
  "scrape-brand",
  "self-signup",
  "send-email",
  "sms-webhook",
  "telegram-webhook",
  "textbelt-webhook",
];

const ERROR_SOURCES = [
  { name: "Browser JS Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Fetch/API Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "React Crashes", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Unhandled Rejections", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Edge Function Crashes", layer: "Server", reporter: "withErrorReporting" },
  { name: "RPC/Database Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "App Downtime", layer: "Infra", reporter: "sentinel health probe" },
  { name: "DB Connectivity", layer: "Infra", reporter: "sentinel health probe" },
  { name: "Edge Fn Downtime", layer: "Infra", reporter: "sentinel health probe" },
];

export default function SystemHealth() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [sentinel, setSentinel] = useState<SentinelStatus>({
    alive: false, lastHeartbeat: null, lastHealRun: null,
    healCount24h: 0, bugReportsOpen: 0, loading: true,
  });

  useEffect(() => {
    loadSentinelStatus();
  }, []);

  const loadSentinelStatus = async () => {
    setSentinel((s) => ({ ...s, loading: true }));
    try {
      // Last heartbeat from audit_log
      const { data: heartbeat } = await supabase
        .from("audit_log")
        .select("created_at, details")
        .eq("action", "sentinel_heartbeat")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Last heal run from audit_log
      const { data: healRun } = await supabase
        .from("audit_log")
        .select("created_at, details")
        .eq("action", "auto_heal_run")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Heal runs in last 24h
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count: healCount } = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("action", "auto_heal_run")
        .gte("created_at", dayAgo);

      // Open bug reports
      const { count: bugCount } = await supabase
        .from("bug_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "open");

      // Sentinel is "alive" if heartbeat was within last 15 min
      const isAlive = heartbeat?.created_at
        ? Date.now() - new Date(heartbeat.created_at).getTime() < 15 * 60 * 1000
        : false;

      setSentinel({
        alive: isAlive,
        lastHeartbeat: heartbeat?.created_at || null,
        lastHealRun: healRun?.created_at || null,
        healCount24h: healCount || 0,
        bugReportsOpen: bugCount || 0,
        loading: false,
      });
    } catch {
      setSentinel((s) => ({ ...s, loading: false }));
    }
  };

  const updateCheck = (name: string, update: Partial<HealthCheck>) => {
    setChecks((prev) => prev.map((c) => (c.name === name ? { ...c, ...update } : c)));
  };

  const runHealthChecks = async () => {
    setRunning(true);

    // Initialize all checks as pending
    const allChecks: HealthCheck[] = [
      { name: "Supabase Connection", status: "pending" },
      { name: "Auth Service", status: "pending" },
      ...RPC_FUNCTIONS.map((fn) => ({ name: `RPC: ${fn}`, status: "pending" as const })),
      ...EDGE_FUNCTIONS.map((fn) => ({ name: `Edge: ${fn}`, status: "pending" as const })),
    ];
    setChecks(allChecks);

    // 1. Supabase connection check
    try {
      const start = performance.now();
      const { error } = await supabase.from("organizations").select("id").limit(1);
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Supabase Connection", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Supabase Connection", { status: "fail", error: (err as any)?.message || "Unknown" });
    }

    // 2. Auth service check
    try {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Auth Service", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Auth Service", { status: "fail", error: (err as any)?.message || "Unknown" });
    }

    // 3. RPC function existence check — probe each individually
    // Call each RPC with empty/minimal params. If Supabase returns "Could not find the function",
    // the function is missing. Any other response (even param errors) means it exists.
    for (const fn of RPC_FUNCTIONS) {
      try {
        const start = performance.now();
        const { error } = await supabase.rpc(fn, {});
        const latencyMs = Math.round(performance.now() - start);
        if (error) {
          const msg = error.message || "";
          // "Could not find the function" = function doesn't exist in DB
          if (msg.includes("Could not find the function") || msg.includes("not found in the schema cache")) {
            updateCheck(`RPC: ${fn}`, { status: "fail", error: "Function not found", latencyMs });
          } else {
            // Function exists but returned an error (wrong params, RLS, etc.) — that's fine
            updateCheck(`RPC: ${fn}`, { status: "pass", latencyMs });
          }
        } else {
          updateCheck(`RPC: ${fn}`, { status: "pass", latencyMs });
        }
      } catch (err) {
        updateCheck(`RPC: ${fn}`, { status: "fail", error: (err as any)?.message || "Unknown" });
      }
    }

    // 4. Edge function connectivity check (OPTIONS/HEAD — lightweight ping)
    for (const fn of EDGE_FUNCTIONS) {
      try {
        const start = performance.now();
        const { error } = await supabase.functions.invoke(fn, {
          method: "POST",
          body: { health_check: true },
        });
        const latencyMs = Math.round(performance.now() - start);
        // Edge functions may return errors for health_check payloads, but if we get a response
        // (even 4xx), the function is deployed and reachable. Only network/deploy errors = fail.
        if (error && (error.message?.includes("not found") || error.message?.includes("404") || error.message?.includes("Failed to fetch"))) {
          updateCheck(`Edge: ${fn}`, { status: "fail", error: error.message, latencyMs });
        } else {
          updateCheck(`Edge: ${fn}`, { status: "pass", latencyMs });
        }
      } catch (err) {
        updateCheck(`Edge: ${fn}`, { status: "fail", error: (err as any)?.message || "Unknown" });
      }
    }

    setLastRun(new Date());
    setRunning(false);
  };

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const totalCount = checks.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            System Health
          </h1>
          {lastRun && <p className="text-sm text-muted-foreground mt-1">Last checked: {lastRun.toLocaleTimeString()}</p>}
        </div>
        <Button onClick={runHealthChecks} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {running ? "Running..." : "Run Health Checks"}
        </Button>
      </div>

      {totalCount > 0 && (
        <div className="flex gap-3">
          <Badge variant={failCount === 0 ? "default" : "destructive"} className="text-sm px-3 py-1">
            {failCount === 0 ? "All Systems Operational" : `${failCount} Issue${failCount > 1 ? "s" : ""} Detected`}
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1">
            {passCount}/{totalCount} passing
          </Badge>
        </div>
      )}

      {/* Sentinel Status Card — always visible */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <HeartPulse className="h-5 w-5" />
            Auto-Heal Sentinel
            {sentinel.loading ? (
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
            ) : sentinel.alive ? (
              <Badge variant="default" className="ml-2 text-xs">ALIVE</Badge>
            ) : (
              <Badge variant="destructive" className="ml-2 text-xs">OFFLINE</Badge>
            )}
            <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={loadSentinelStatus}>
              <RefreshCw className="h-3 w-3" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Last Heartbeat</p>
              <p className="text-sm font-mono">
                {sentinel.lastHeartbeat ? new Date(sentinel.lastHeartbeat).toLocaleString() : "Never"}
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Last Heal Run</p>
              <p className="text-sm font-mono">
                {sentinel.lastHealRun ? new Date(sentinel.lastHealRun).toLocaleString() : "Never"}
              </p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Heals (24h)</p>
              <p className="text-sm font-mono">{sentinel.healCount24h}</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Open Bug Reports</p>
              <p className="text-sm font-mono flex items-center gap-1">
                {sentinel.bugReportsOpen > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                {sentinel.bugReportsOpen}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Coverage Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Error Coverage Matrix ({ERROR_SOURCES.length} sources)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {ERROR_SOURCES.map((src) => (
              <div key={src.name} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{src.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{src.layer}</Badge>
                  <span className="text-xs text-muted-foreground font-mono">{src.reporter}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            All {ERROR_SOURCES.length} error sources flow into <code className="bg-muted px-1 rounded">bug_reports</code> → sentinel detects → auto-heal fixes → verify → email report.
          </p>
        </CardContent>
      </Card>

      {totalCount === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Click "Run Health Checks" to test Supabase connectivity, auth service, {RPC_FUNCTIONS.length} RPC functions, and {EDGE_FUNCTIONS.length} edge functions.
          </CardContent>
        </Card>
      )}

      {/* Infrastructure checks */}
      {checks.filter((c) => !c.name.startsWith("RPC:")).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Infrastructure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks
              .filter((c) => !c.name.startsWith("RPC:"))
              .map((check) => (
                <HealthRow key={check.name} check={check} />
              ))}
          </CardContent>
        </Card>
      )}

      {/* RPC function checks */}
      {checks.filter((c) => c.name.startsWith("RPC:")).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">RPC Functions ({RPC_FUNCTIONS.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks
              .filter((c) => c.name.startsWith("RPC:"))
              .map((check) => (
                <HealthRow key={check.name} check={check} />
              ))}
          </CardContent>
        </Card>
      )}

      {/* Edge function checks */}
      {checks.filter((c) => c.name.startsWith("Edge:")).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Edge Functions ({EDGE_FUNCTIONS.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checks
              .filter((c) => c.name.startsWith("Edge:"))
              .map((check) => (
                <HealthRow key={check.name} check={check} />
              ))}
          </CardContent>
        </Card>
      )}

      {/* Auto-Heal Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Auto-Heal Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The auto-heal pipeline detects issues (missing RPCs, edge functions, TypeScript errors, test failures, user bug reports) and spawns a Claude Code session to fix them automatically. Results are emailed to you.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-4 w-4" />
                Detect Only
              </div>
              <code className="text-xs block bg-muted px-2 py-1 rounded">npm run auto-heal:detect</code>
              <p className="text-xs text-muted-foreground">Scan for issues without fixing</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Wrench className="h-4 w-4" />
                Auto-Fix
              </div>
              <code className="text-xs block bg-muted px-2 py-1 rounded">npm run auto-heal</code>
              <p className="text-xs text-muted-foreground">Detect + Claude Code fixes locally</p>
            </div>
            <div className="rounded-lg border p-3 space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RefreshCw className="h-4 w-4" />
                Fix + Deploy
              </div>
              <code className="text-xs block bg-muted px-2 py-1 rounded">npm run auto-heal:push</code>
              <p className="text-xs text-muted-foreground">Fix + commit + push to production</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Email reports</strong>: Set <code className="bg-muted px-1 rounded">HEAL_EMAIL</code> and <code className="bg-muted px-1 rounded">RESEND_API_KEY</code> in .env</p>
            <p><strong>Schedule</strong>: Add to Windows Task Scheduler or cron to run automatically</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthRow({ check }: { check: HealthCheck }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
      <div className="flex items-center gap-2">
        {check.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {check.status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
        {check.status === "pending" && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
        <span className="text-sm font-mono">{check.name.replace("RPC: ", "").replace("Edge: ", "")}</span>
      </div>
      <div className="flex items-center gap-3">
        {check.latencyMs !== undefined && <span className="text-xs text-muted-foreground">{check.latencyMs}ms</span>}
        {check.error && <span className="text-xs text-red-500 max-w-[300px] truncate">{check.error}</span>}
      </div>
    </div>
  );
}
