import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Cloud,
  Wrench, Terminal, HeartPulse, Shield, AlertTriangle, Clock,
  TrendingUp, Zap, Eye,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "pending";
  latencyMs?: number;
  error?: string;
}

interface DbHealthCheck {
  id: string;
  check_name: string;
  category: string;
  status: "pass" | "fail";
  latency_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

interface Incident {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  status: string;
  source: string | null;
  error_pattern: string | null;
  diagnosis: string | null;
  auto_healed: boolean;
  heal_action: string | null;
  detected_at: string;
  diagnosed_at: string | null;
  healed_at: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

interface HealLogEntry {
  id: string;
  incident_id: string | null;
  action: string;
  result: "success" | "failure" | "skipped";
  details: string | null;
  created_at: string;
}

interface SentinelStatus {
  alive: boolean;
  lastHeartbeat: string | null;
  lastHealRun: string | null;
  healCount24h: number;
  bugReportsOpen: number;
  loading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Static lists                                                       */
/* ------------------------------------------------------------------ */

const RPC_FUNCTIONS = [
  "link_referral", "delete_contact_cascade", "apply_commissions_to_owed",
  "convert_commission_to_credit", "process_sale_commission", "create_validated_order",
  "get_bottle_stats", "get_inventory_valuation", "get_org_counts",
  "check_subdomain_availability", "get_partner_downline", "get_peptide_stock_counts",
  "get_supplier_orders", "pay_order_with_credit", "decrement_vial", "auto_link_contact_by_email",
];

const EDGE_FUNCTIONS = [
  "admin-ai-chat", "ai-builder", "analyze-food", "chat-with-ai",
  "check-low-supply", "check-payment-emails", "composio-callback", "composio-connect",
  "create-supplier-order", "exchange-token", "health-probe", "invite-user",
  "notify-commission", "partner-ai-chat", "process-health-document", "promote-contact",
  "provision-tenant", "run-automations", "scrape-brand", "self-signup",
  "send-email", "sms-webhook", "telegram-webhook", "textbelt-webhook",
];

const ERROR_SOURCES = [
  { name: "Browser JS Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Fetch/API Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "React Crashes", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Unhandled Rejections", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "Edge Function Crashes", layer: "Server", reporter: "withErrorReporting" },
  { name: "RPC/Database Errors", layer: "Browser", reporter: "auto-error-reporter" },
  { name: "App Downtime", layer: "Infra", reporter: "health-probe (cron)" },
  { name: "DB Connectivity", layer: "Infra", reporter: "health-probe (cron)" },
  { name: "Edge Fn Downtime", layer: "Infra", reporter: "health-probe (cron)" },
];

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

/* ------------------------------------------------------------------ */
/*  Helper: relative time                                              */
/* ------------------------------------------------------------------ */

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function SystemHealth() {
  /* ── Manual on-demand checks (unchanged from original) ── */
  const [manualChecks, setManualChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [sentinel, setSentinel] = useState<SentinelStatus>({
    alive: false, lastHeartbeat: null, lastHealRun: null,
    healCount24h: 0, bugReportsOpen: 0, loading: true,
  });

  useEffect(() => { loadSentinelStatus(); }, []);

  /* ── Auto-refreshing queries (new) ── */

  // Latest health-probe results (last cycle per check_name)
  const { data: latestProbes } = useQuery<DbHealthCheck[]>({
    queryKey: ["health-probe-latest"],
    queryFn: async () => {
      const { data } = await supabase
        .from("health_checks")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  // Active incidents (not resolved/failed)
  const { data: activeIncidents } = useQuery<Incident[]>({
    queryKey: ["incidents-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("incidents")
        .select("*")
        .not("status", "in", '("resolved","failed")')
        .order("detected_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  // Recent resolved incidents (last 24h)
  const { data: recentIncidents } = useQuery<Incident[]>({
    queryKey: ["incidents-recent"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("incidents")
        .select("*")
        .in("status", ["resolved", "healed", "failed"])
        .gte("detected_at", dayAgo)
        .order("detected_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // Recent heal log entries (last 24h)
  const { data: healLog } = useQuery<HealLogEntry[]>({
    queryKey: ["heal-log-recent"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("heal_log")
        .select("*")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  /* ── Computed metrics ── */

  // Deduplicate to latest result per check_name
  const latestByName = useMemo(() => {
    const map = new Map<string, DbHealthCheck>();
    for (const p of latestProbes || []) {
      if (!map.has(p.check_name)) map.set(p.check_name, p);
    }
    return map;
  }, [latestProbes]);

  const probePassCount = useMemo(() =>
    Array.from(latestByName.values()).filter(p => p.status === "pass").length,
  [latestByName]);
  const probeTotalCount = latestByName.size;
  const probeAllGreen = probeTotalCount > 0 && probePassCount === probeTotalCount;
  const lastProbeTime = latestProbes?.[0]?.checked_at;

  // Uptime % (last 24h) — pass / total across all probes
  const uptime24h = useMemo(() => {
    if (!latestProbes || latestProbes.length === 0) return null;
    const dayAgo = Date.now() - 86400000;
    const recent = latestProbes.filter(p => new Date(p.checked_at).getTime() > dayAgo);
    if (recent.length === 0) return null;
    const passes = recent.filter(p => p.status === "pass").length;
    return ((passes / recent.length) * 100).toFixed(1);
  }, [latestProbes]);

  // Average latency across latest probes
  const avgLatency = useMemo(() => {
    const vals = Array.from(latestByName.values())
      .filter(p => p.latency_ms !== null)
      .map(p => p.latency_ms!);
    if (vals.length === 0) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [latestByName]);

  const activeIncidentCount = activeIncidents?.length || 0;
  const criticalCount = activeIncidents?.filter(i => i.severity === "critical").length || 0;
  const healSuccessCount = healLog?.filter(h => h.result === "success").length || 0;

  /* ── Sentinel status (from audit_log — existing logic) ── */

  const loadSentinelStatus = async () => {
    setSentinel((s) => ({ ...s, loading: true }));
    try {
      const { data: heartbeat } = await supabase
        .from("audit_log").select("created_at, details")
        .eq("action", "sentinel_heartbeat")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const { data: healRun } = await supabase
        .from("audit_log").select("created_at, details")
        .eq("action", "auto_heal_run")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { count: healCount } = await supabase
        .from("audit_log").select("id", { count: "exact", head: true })
        .eq("action", "auto_heal_run").gte("created_at", dayAgo);

      const { count: bugCount } = await supabase
        .from("bug_reports").select("id", { count: "exact", head: true })
        .eq("status", "open");

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

  /* ── Manual health check runner (unchanged) ── */

  const updateCheck = (name: string, update: Partial<HealthCheck>) => {
    setManualChecks((prev) => prev.map((c) => (c.name === name ? { ...c, ...update } : c)));
  };

  const runHealthChecks = async () => {
    setRunning(true);
    const allChecks: HealthCheck[] = [
      { name: "Supabase Connection", status: "pending" },
      { name: "Auth Service", status: "pending" },
      ...RPC_FUNCTIONS.map((fn) => ({ name: `RPC: ${fn}`, status: "pending" as const })),
      ...EDGE_FUNCTIONS.map((fn) => ({ name: `Edge: ${fn}`, status: "pending" as const })),
    ];
    setManualChecks(allChecks);

    // DB check
    try {
      const start = performance.now();
      const { error } = await supabase.from("organizations").select("id").limit(1);
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Supabase Connection", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Supabase Connection", { status: "fail", error: (err as Error)?.message || "Unknown" });
    }

    // Auth check
    try {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Auth Service", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Auth Service", { status: "fail", error: (err as Error)?.message || "Unknown" });
    }

    // RPC checks
    for (const fn of RPC_FUNCTIONS) {
      try {
        const start = performance.now();
        const { error } = await supabase.rpc(fn, {});
        const latencyMs = Math.round(performance.now() - start);
        if (error) {
          const msg = error.message || "";
          if (msg.includes("Could not find") || msg.includes("not found in the schema")) {
            updateCheck(`RPC: ${fn}`, { status: "fail", error: "Function not found", latencyMs });
          } else {
            updateCheck(`RPC: ${fn}`, { status: "pass", latencyMs });
          }
        } else {
          updateCheck(`RPC: ${fn}`, { status: "pass", latencyMs });
        }
      } catch (err) {
        updateCheck(`RPC: ${fn}`, { status: "fail", error: (err as Error)?.message || "Unknown" });
      }
    }

    // Edge function checks
    for (const fn of EDGE_FUNCTIONS) {
      try {
        const start = performance.now();
        const { error } = await supabase.functions.invoke(fn, { method: "POST", body: { health_check: true } });
        const latencyMs = Math.round(performance.now() - start);
        if (error && (error.message?.includes("not found") || error.message?.includes("404") || error.message?.includes("Failed to fetch"))) {
          updateCheck(`Edge: ${fn}`, { status: "fail", error: error.message, latencyMs });
        } else {
          updateCheck(`Edge: ${fn}`, { status: "pass", latencyMs });
        }
      } catch (err) {
        updateCheck(`Edge: ${fn}`, { status: "fail", error: (err as Error)?.message || "Unknown" });
      }
    }

    setLastRun(new Date());
    setRunning(false);
  };

  const manualPassCount = manualChecks.filter((c) => c.status === "pass").length;
  const manualFailCount = manualChecks.filter((c) => c.status === "fail").length;
  const manualTotalCount = manualChecks.length;

  /* ── Render ── */

  return (
    <div className="space-y-6">
      {/* ── Header + Status Banner ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            System Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zero-human-in-the-loop autonomous monitoring
            {lastProbeTime && <> &middot; Last probe: {timeAgo(lastProbeTime)}</>}
          </p>
        </div>
        <Button onClick={runHealthChecks} disabled={running} variant="outline">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          {running ? "Running..." : "Manual Check"}
        </Button>
      </div>

      {/* ── Top-level status badges ── */}
      <div className="flex flex-wrap gap-3">
        {probeTotalCount > 0 ? (
          <Badge variant={probeAllGreen ? "default" : "destructive"} className="text-sm px-3 py-1">
            {probeAllGreen ? "All Systems Operational" : `${probeTotalCount - probePassCount} Probe Failure${probeTotalCount - probePassCount > 1 ? "s" : ""}`}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-sm px-3 py-1">No probe data yet</Badge>
        )}
        {activeIncidentCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {activeIncidentCount} Active Incident{activeIncidentCount > 1 ? "s" : ""}
            {criticalCount > 0 && ` (${criticalCount} critical)`}
          </Badge>
        )}
        {activeIncidentCount === 0 && probeTotalCount > 0 && (
          <Badge variant="outline" className="text-sm px-3 py-1 text-green-700 border-green-300">
            No Active Incidents
          </Badge>
        )}
      </div>

      {/* ── KPI Cards Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Uptime (24h)" value={uptime24h ? `${uptime24h}%` : "—"} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="Avg Latency" value={avgLatency ? `${avgLatency}ms` : "—"} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Probes Passing" value={probeTotalCount > 0 ? `${probePassCount}/${probeTotalCount}` : "—"} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Active Incidents" value={String(activeIncidentCount)} alert={activeIncidentCount > 0} />
        <KpiCard icon={<Wrench className="h-4 w-4" />} label="Heals (24h)" value={String(healSuccessCount)} />
      </div>

      {/* ── Tabbed sections ── */}
      <Tabs defaultValue="probes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="probes">Probe Results</TabsTrigger>
          <TabsTrigger value="incidents">
            Incidents
            {activeIncidentCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold w-5 h-5">{activeIncidentCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="healing">Healing Log</TabsTrigger>
          <TabsTrigger value="manual">Manual Check</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        {/* ── Tab: Probe Results ── */}
        <TabsContent value="probes" className="space-y-4">
          {probeTotalCount === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No autonomous probe data yet. Deploy the <code className="bg-muted px-1 rounded">health-probe</code> edge function and schedule it via pg_cron.
            </CardContent></Card>
          ) : (
            <>
              {/* Group by category */}
              {(["infra", "rpc", "edge", "app"] as const).map((cat) => {
                const items = Array.from(latestByName.values()).filter(p => p.category === cat);
                if (items.length === 0) return null;
                const catLabel = { infra: "Infrastructure", rpc: "RPC Functions", edge: "Edge Functions", app: "Application" }[cat];
                return (
                  <Card key={cat}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{catLabel} ({items.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {items.map((p) => (
                        <div key={p.check_name} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            {p.status === "pass" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                            <span className="text-sm font-mono">{p.check_name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {p.latency_ms !== null && <span className="text-xs text-muted-foreground">{p.latency_ms}ms</span>}
                            {p.error_message && <span className="text-xs text-red-500 max-w-[300px] truncate">{p.error_message}</span>}
                            <span className="text-xs text-muted-foreground">{timeAgo(p.checked_at)}</span>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </>
          )}
        </TabsContent>

        {/* ── Tab: Incidents ── */}
        <TabsContent value="incidents" className="space-y-4">
          {/* Active incidents */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Active Incidents ({activeIncidentCount})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeIncidentCount === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active incidents. System is healthy.</p>
              ) : (
                <div className="space-y-3">
                  {[...(activeIncidents || [])].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)).map((inc) => (
                    <IncidentRow key={inc.id} incident={inc} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent resolved */}
          {(recentIncidents?.length || 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  Resolved (last 24h) ({recentIncidents?.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentIncidents?.map((inc) => <IncidentRow key={inc.id} incident={inc} />)}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Healing Log ── */}
        <TabsContent value="healing" className="space-y-4">
          {/* Sentinel card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="h-4 w-4" />
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
                <MiniStat label="Last Heartbeat" value={sentinel.lastHeartbeat ? timeAgo(sentinel.lastHeartbeat) : "Never"} />
                <MiniStat label="Last Heal Run" value={sentinel.lastHealRun ? timeAgo(sentinel.lastHealRun) : "Never"} />
                <MiniStat label="Heals (24h)" value={String(sentinel.healCount24h)} />
                <MiniStat label="Open Bug Reports" value={String(sentinel.bugReportsOpen)} alert={sentinel.bugReportsOpen > 0} />
              </div>
            </CardContent>
          </Card>

          {/* Heal log table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Healing Activity (last 24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!healLog || healLog.length === 0) ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No healing actions in the last 24 hours.</p>
              ) : (
                <div className="space-y-1">
                  {healLog.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {entry.result === "success" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                         entry.result === "failure" ? <XCircle className="h-4 w-4 text-red-500" /> :
                         <Clock className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm font-mono">{entry.action}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {entry.details && <span className="text-xs text-muted-foreground max-w-[300px] truncate">{entry.details}</span>}
                        <span className="text-xs text-muted-foreground">{timeAgo(entry.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline CLI commands */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Auto-Heal Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Detects issues and spawns Claude Code to fix automatically. Results logged to heal_log and incidents tables.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <PipelineCard label="Detect Only" cmd="npm run auto-heal:detect" desc="Scan without fixing" icon={<Eye className="h-4 w-4" />} />
                <PipelineCard label="Auto-Fix" cmd="npm run auto-heal" desc="Claude Code fixes locally" icon={<Wrench className="h-4 w-4" />} />
                <PipelineCard label="Fix + Deploy" cmd="npm run auto-heal:push" desc="Fix + commit + push" icon={<RefreshCw className="h-4 w-4" />} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Manual Check ── */}
        <TabsContent value="manual" className="space-y-4">
          {manualTotalCount > 0 && (
            <div className="flex gap-3">
              <Badge variant={manualFailCount === 0 ? "default" : "destructive"} className="text-sm px-3 py-1">
                {manualFailCount === 0 ? "All Checks Pass" : `${manualFailCount} Failure${manualFailCount > 1 ? "s" : ""}`}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1">
                {manualPassCount}/{manualTotalCount} passing
              </Badge>
              {lastRun && <span className="text-sm text-muted-foreground">Ran {lastRun.toLocaleTimeString()}</span>}
            </div>
          )}

          {manualTotalCount === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Click "Manual Check" to test {RPC_FUNCTIONS.length} RPCs and {EDGE_FUNCTIONS.length} edge functions from your browser.
            </CardContent></Card>
          ) : (
            <>
              {/* Infrastructure */}
              {manualChecks.filter((c) => !c.name.startsWith("RPC:") && !c.name.startsWith("Edge:")).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Infrastructure</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {manualChecks.filter((c) => !c.name.startsWith("RPC:") && !c.name.startsWith("Edge:")).map((c) => <HealthRow key={c.name} check={c} />)}
                  </CardContent>
                </Card>
              )}
              {/* RPCs */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">RPC Functions ({RPC_FUNCTIONS.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {manualChecks.filter((c) => c.name.startsWith("RPC:")).map((c) => <HealthRow key={c.name} check={c} />)}
                </CardContent>
              </Card>
              {/* Edge functions */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Cloud className="h-4 w-4" />Edge Functions ({EDGE_FUNCTIONS.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {manualChecks.filter((c) => c.name.startsWith("Edge:")).map((c) => <HealthRow key={c.name} check={c} />)}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── Tab: Coverage ── */}
        <TabsContent value="coverage" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4" />
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
                All {ERROR_SOURCES.length} error sources flow into <code className="bg-muted px-1 rounded">bug_reports</code> + <code className="bg-muted px-1 rounded">health_checks</code> &rarr; sentinel detects &rarr; auto-heal fixes &rarr; incidents track lifecycle.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function KpiCard({ icon, label, value, alert }: { icon: React.ReactNode; label: string; value: string; alert?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">{icon}{label}</div>
        <p className={`text-2xl font-bold ${alert ? "text-red-600" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono flex items-center gap-1 ${alert ? "text-amber-600" : ""}`}>
        {alert && <AlertTriangle className="h-3 w-3" />}
        {value}
      </p>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const colorClass = SEVERITY_COLOR[incident.severity] || "";
  return (
    <div className={`rounded-lg border p-3 space-y-1 ${colorClass}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs uppercase">{incident.severity}</Badge>
          <span className="text-sm font-medium">{incident.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">{incident.status}</Badge>
          {incident.auto_healed && <Badge variant="default" className="text-xs">auto-healed</Badge>}
          <span className="text-xs text-muted-foreground">{timeAgo(incident.detected_at)}</span>
        </div>
      </div>
      {incident.error_pattern && (
        <p className="text-xs font-mono truncate max-w-full">{incident.error_pattern}</p>
      )}
      {incident.diagnosis && (
        <p className="text-xs">{incident.diagnosis}</p>
      )}
    </div>
  );
}

function PipelineCard({ label, cmd, desc, icon }: { label: string; cmd: string; desc: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium">{icon}{label}</div>
      <code className="text-xs block bg-muted px-2 py-1 rounded">{cmd}</code>
      <p className="text-xs text-muted-foreground">{desc}</p>
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
