import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Cloud,
  Wrench, Terminal, HeartPulse, Shield, AlertTriangle, Clock,
  TrendingUp, Zap, Eye, Brain, GitBranch, ToggleLeft, ToggleRight,
  Cpu, Radio, Rocket, ShieldAlert, Gauge,
} from "lucide-react";
import { toast } from "sonner";

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

interface SentinelRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  bugs_processed: number;
  patterns_matched: number;
  ai_diagnoses: number;
  fixes_applied: number;
  circuit_breakers_tripped: number;
  errors: string[] | null;
  status: string;
}

interface ErrorPattern {
  id: string;
  pattern: string;
  match_type: string;
  category: string;
  severity: string;
  auto_fix_action: string | null;
  fix_description: string | null;
  cooldown_minutes: number;
  enabled: boolean;
  times_matched: number;
  times_fixed: number;
  last_matched_at: string | null;
  last_fixed_at: string | null;
}

interface CircuitBreakerEvent {
  id: string;
  feature_key: string;
  org_id: string | null;
  action: string;
  reason: string | null;
  error_count: number | null;
  threshold: number | null;
  created_at: string;
}

interface DeployEvent {
  id: string;
  deployment_id: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  branch: string | null;
  status: string;
  source: string;
  url: string | null;
  deployed_at: string;
  metadata: Record<string, unknown>;
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
  "create-supplier-order", "deploy-webhook", "exchange-token", "health-probe",
  "invite-user", "notify-commission", "partner-ai-chat", "process-health-document",
  "promote-contact", "provision-tenant", "run-automations", "scrape-brand",
  "self-signup", "send-email", "sentinel-worker", "sms-webhook",
  "telegram-webhook", "textbelt-webhook",
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
  { name: "AI Pattern Matching", layer: "Sentinel", reporter: "sentinel-worker (cron)" },
  { name: "Circuit Breakers", layer: "Sentinel", reporter: "sentinel-worker (cron)" },
  { name: "Deploy Correlation", layer: "Sentinel", reporter: "sentinel-worker + deploy-webhook" },
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
  const queryClient = useQueryClient();
  const [manualChecks, setManualChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [triggeringProbe, setTriggeringProbe] = useState(false);
  const [triggeringSentinel, setTriggeringSentinel] = useState(false);

  /* ── Auto-refreshing queries ── */

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

  // Sentinel runs (last 24h)
  const { data: sentinelRuns } = useQuery<SentinelRun[]>({
    queryKey: ["sentinel-runs"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("sentinel_runs")
        .select("*")
        .gte("started_at", dayAgo)
        .order("started_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  // Error patterns
  const { data: errorPatterns } = useQuery<ErrorPattern[]>({
    queryKey: ["error-patterns"],
    queryFn: async () => {
      const { data } = await supabase
        .from("error_patterns")
        .select("*")
        .order("times_matched", { ascending: false });
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // Circuit breaker events (last 24h)
  const { data: circuitEvents } = useQuery<CircuitBreakerEvent[]>({
    queryKey: ["circuit-breaker-events"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("circuit_breaker_events")
        .select("*")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  // Deploy events (last 7 days)
  const { data: deployEvents } = useQuery<DeployEvent[]>({
    queryKey: ["deploy-events"],
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("deploy_events")
        .select("*")
        .gte("deployed_at", weekAgo)
        .order("deployed_at", { ascending: false })
        .limit(30);
      return data || [];
    },
    refetchInterval: 60_000,
  });

  // Recent AI diagnoses from bug_reports
  const { data: aiDiagnoses } = useQuery<{ id: string; description: string; sentinel_diagnosis: string; page_url: string | null; created_at: string }[]>({
    queryKey: ["ai-diagnoses"],
    queryFn: async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const { data } = await supabase
        .from("bug_reports")
        .select("id, description, sentinel_diagnosis, page_url, created_at")
        .not("sentinel_diagnosis", "is", null)
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    refetchInterval: 30_000,
  });

  /* ── Computed metrics ── */

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

  const uptime24h = useMemo(() => {
    if (!latestProbes || latestProbes.length === 0) return null;
    const dayAgo = Date.now() - 86400000;
    const recent = latestProbes.filter(p => new Date(p.checked_at).getTime() > dayAgo);
    if (recent.length === 0) return null;
    const passes = recent.filter(p => p.status === "pass").length;
    return ((passes / recent.length) * 100).toFixed(1);
  }, [latestProbes]);

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

  // Sentinel stats
  const lastSentinelRun = sentinelRuns?.[0];
  const sentinelAlive = lastSentinelRun
    ? (Date.now() - new Date(lastSentinelRun.started_at).getTime()) < 5 * 60_000
    : false;
  const sentinelBugsProcessed24h = sentinelRuns?.reduce((sum, r) => sum + (r.bugs_processed || 0), 0) || 0;
  const sentinelAIDiagnoses24h = sentinelRuns?.reduce((sum, r) => sum + (r.ai_diagnoses || 0), 0) || 0;
  const sentinelFixesApplied24h = sentinelRuns?.reduce((sum, r) => sum + (r.fixes_applied || 0), 0) || 0;
  const activeBreakers = circuitEvents?.filter(e => e.action === "tripped") || [];
  const resetBreakers = circuitEvents?.filter(e => e.action === "reset") || [];

  // Patterns stats
  const totalPatterns = errorPatterns?.length || 0;
  const activePatterns = errorPatterns?.filter(p => p.enabled).length || 0;
  const totalPatternMatches = errorPatterns?.reduce((sum, p) => sum + (p.times_matched || 0), 0) || 0;

  /* ── Trigger health probe manually ── */
  const triggerProbe = async () => {
    setTriggeringProbe(true);
    try {
      const { error } = await supabase.functions.invoke("health-probe", { method: "POST", body: {} });
      if (error) throw error;
      toast.success("Health probe triggered — results will appear in ~10s");
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["health-probe-latest"] }), 10000);
    } catch (err) {
      toast.error(`Probe failed: ${(err as Error).message}`);
    } finally {
      setTriggeringProbe(false);
    }
  };

  /* ── Trigger sentinel manually ── */
  const triggerSentinel = async () => {
    setTriggeringSentinel(true);
    try {
      const { error } = await supabase.functions.invoke("sentinel-worker", { method: "POST", body: {} });
      if (error) throw error;
      toast.success("Sentinel triggered — results will appear in ~15s");
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["sentinel-runs"] });
        queryClient.invalidateQueries({ queryKey: ["ai-diagnoses"] });
        queryClient.invalidateQueries({ queryKey: ["circuit-breaker-events"] });
      }, 15000);
    } catch (err) {
      toast.error(`Sentinel failed: ${(err as Error).message}`);
    } finally {
      setTriggeringSentinel(false);
    }
  };

  /* ── Manual health check runner ── */

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

    try {
      const start = performance.now();
      const { error } = await supabase.from("organizations").select("id").limit(1);
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Supabase Connection", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Supabase Connection", { status: "fail", error: (err as Error)?.message || "Unknown" });
    }

    try {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Auth Service", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Auth Service", { status: "fail", error: (err as Error)?.message || "Unknown" });
    }

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
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            System Health — Self-Healing AI
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Zero-human-in-the-loop autonomous monitoring &amp; healing
            {lastProbeTime && <> &middot; Last probe: {timeAgo(lastProbeTime)}</>}
            {lastSentinelRun && <> &middot; Last sentinel: {timeAgo(lastSentinelRun.started_at)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={triggerProbe} disabled={triggeringProbe} variant="outline" size="sm">
            {triggeringProbe ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Radio className="h-4 w-4 mr-1" />}
            Run Probe
          </Button>
          <Button onClick={triggerSentinel} disabled={triggeringSentinel} variant="outline" size="sm">
            {triggeringSentinel ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Brain className="h-4 w-4 mr-1" />}
            Run Sentinel
          </Button>
          <Button onClick={runHealthChecks} disabled={running} variant="outline" size="sm">
            {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Full Check
          </Button>
        </div>
      </div>

      {/* ── Status badges ── */}
      <div className="flex flex-wrap gap-3">
        {probeTotalCount > 0 ? (
          <Badge variant={probeAllGreen ? "default" : "destructive"} className="text-sm px-3 py-1">
            {probeAllGreen ? "All Systems Operational" : `${probeTotalCount - probePassCount} Probe Failure${probeTotalCount - probePassCount > 1 ? "s" : ""}`}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-sm px-3 py-1">No probe data yet</Badge>
        )}
        <Badge variant={sentinelAlive ? "default" : "destructive"} className="text-sm px-3 py-1">
          <Brain className="h-3 w-3 mr-1" />
          Sentinel {sentinelAlive ? "Active" : "Offline"}
        </Badge>
        {activeIncidentCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {activeIncidentCount} Active Incident{activeIncidentCount > 1 ? "s" : ""}
            {criticalCount > 0 && ` (${criticalCount} critical)`}
          </Badge>
        )}
        {activeBreakers.length > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            <ShieldAlert className="h-3 w-3 mr-1" />
            {activeBreakers.length} Circuit Breaker{activeBreakers.length > 1 ? "s" : ""} Tripped
          </Badge>
        )}
        {activeIncidentCount === 0 && probeTotalCount > 0 && (
          <Badge variant="outline" className="text-sm px-3 py-1 text-green-700 border-green-300">
            No Active Incidents
          </Badge>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Uptime (24h)" value={uptime24h ? `${uptime24h}%` : "—"} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="Avg Latency" value={avgLatency ? `${avgLatency}ms` : "—"} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Probes Passing" value={probeTotalCount > 0 ? `${probePassCount}/${probeTotalCount}` : "—"} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Active Incidents" value={String(activeIncidentCount)} alert={activeIncidentCount > 0} />
        <KpiCard icon={<Wrench className="h-4 w-4" />} label="Fixes Applied (24h)" value={String(sentinelFixesApplied24h)} />
        <KpiCard icon={<Brain className="h-4 w-4" />} label="AI Diagnoses (24h)" value={String(sentinelAIDiagnoses24h)} />
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="probes" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="probes">Probes</TabsTrigger>
          <TabsTrigger value="sentinel">
            Sentinel
            {sentinelAlive && <span className="ml-1 w-2 h-2 rounded-full bg-green-500 inline-block" />}
          </TabsTrigger>
          <TabsTrigger value="incidents">
            Incidents
            {activeIncidentCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold w-5 h-5">{activeIncidentCount}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="patterns">Patterns ({totalPatterns})</TabsTrigger>
          <TabsTrigger value="breakers">Circuit Breakers</TabsTrigger>
          <TabsTrigger value="deploys">Deploys</TabsTrigger>
          <TabsTrigger value="healing">Healing Log</TabsTrigger>
          <TabsTrigger value="manual">Manual Check</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
        </TabsList>

        {/* ── Tab: Probes ── */}
        <TabsContent value="probes" className="space-y-4">
          {probeTotalCount === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              No probe data yet. The <code className="bg-muted px-1 rounded">health-probe</code> runs every 5 minutes via pg_cron.
            </CardContent></Card>
          ) : (
            <>
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

        {/* ── Tab: Sentinel ── */}
        <TabsContent value="sentinel" className="space-y-4">
          {/* Sentinel overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Sentinel AI Brain
                <Badge variant={sentinelAlive ? "default" : "destructive"} className="ml-2 text-xs">
                  {sentinelAlive ? "ACTIVE" : "OFFLINE"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-5">
                <MiniStat label="Last Run" value={lastSentinelRun ? timeAgo(lastSentinelRun.started_at) : "Never"} />
                <MiniStat label="Bugs Processed (24h)" value={String(sentinelBugsProcessed24h)} />
                <MiniStat label="Patterns Matched (24h)" value={String(sentinelRuns?.reduce((s, r) => s + (r.patterns_matched || 0), 0) || 0)} />
                <MiniStat label="AI Diagnoses (24h)" value={String(sentinelAIDiagnoses24h)} />
                <MiniStat label="Fixes Applied (24h)" value={String(sentinelFixesApplied24h)} />
              </div>
            </CardContent>
          </Card>

          {/* Sentinel runs list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Sentinel Runs (last 24h) ({sentinelRuns?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!sentinelRuns || sentinelRuns.length === 0) ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No sentinel runs yet. The sentinel runs every 2 minutes via pg_cron.</p>
              ) : (
                <div className="space-y-1">
                  {sentinelRuns.map((run) => (
                    <div key={run.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {run.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                         run.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> :
                         <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                        <span className="text-sm font-mono">{timeAgo(run.started_at)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{run.bugs_processed} bugs</span>
                        <span>{run.patterns_matched} matched</span>
                        <span>{run.ai_diagnoses} AI</span>
                        <span>{run.fixes_applied} fixes</span>
                        {run.circuit_breakers_tripped > 0 && (
                          <Badge variant="destructive" className="text-[10px]">{run.circuit_breakers_tripped} breakers</Badge>
                        )}
                        {run.errors && run.errors.length > 0 && (
                          <Badge variant="outline" className="text-[10px] text-red-500">{run.errors.length} errors</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent AI Diagnoses */}
          {(aiDiagnoses?.length || 0) > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  AI Diagnoses (last 24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {aiDiagnoses?.map((d) => (
                  <div key={d.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground truncate max-w-[300px]">{d.page_url || "unknown"}</span>
                      <span className="text-xs text-muted-foreground">{timeAgo(d.created_at)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{d.description?.slice(0, 100)}</p>
                    <p className="text-sm whitespace-pre-wrap">{d.sentinel_diagnosis}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tab: Incidents ── */}
        <TabsContent value="incidents" className="space-y-4">
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

        {/* ── Tab: Patterns ── */}
        <TabsContent value="patterns" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Gauge className="h-4 w-4" />
                Error Patterns ({activePatterns} active / {totalPatterns} total, {totalPatternMatches} matches)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!errorPatterns || errorPatterns.length === 0) ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No error patterns configured.</p>
              ) : (
                <div className="space-y-1">
                  {errorPatterns.map((pat) => (
                    <div key={pat.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2 min-w-0">
                        {pat.enabled ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <span className="text-sm font-mono truncate">{pat.pattern}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{pat.match_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{pat.category}</Badge>
                        <Badge variant={pat.severity === "critical" ? "destructive" : "outline"} className="text-[10px]">{pat.severity}</Badge>
                        {pat.auto_fix_action && <Badge variant="secondary" className="text-[10px]">{pat.auto_fix_action}</Badge>}
                        <span className="text-xs text-muted-foreground w-16 text-right">{pat.times_matched} hits</span>
                        {pat.last_matched_at && <span className="text-xs text-muted-foreground">{timeAgo(pat.last_matched_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Circuit Breakers ── */}
        <TabsContent value="breakers" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Circuit Breaker Events (last 24h) ({circuitEvents?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!circuitEvents || circuitEvents.length === 0) ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No circuit breaker events. When error rates spike, the sentinel will auto-disable affected features.
                </p>
              ) : (
                <div className="space-y-2">
                  {circuitEvents.map((evt) => (
                    <div key={evt.id} className={`rounded-lg border p-3 space-y-1 ${evt.action === "tripped" ? "border-red-200 bg-red-50" : evt.action === "reset" ? "border-green-200 bg-green-50" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {evt.action === "tripped" ? <ToggleLeft className="h-4 w-4 text-red-500" /> : <ToggleRight className="h-4 w-4 text-green-500" />}
                          <span className="text-sm font-medium">{evt.feature_key}</span>
                          <Badge variant={evt.action === "tripped" ? "destructive" : "default"} className="text-xs">{evt.action}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">{timeAgo(evt.created_at)}</span>
                      </div>
                      {evt.reason && <p className="text-xs text-muted-foreground">{evt.reason}</p>}
                      {evt.error_count && <p className="text-xs">Errors: {evt.error_count} / Threshold: {evt.threshold}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Deploys ── */}
        <TabsContent value="deploys" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4" />
                Deploy Events (last 7 days) ({deployEvents?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!deployEvents || deployEvents.length === 0) ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No deploy events yet. Configure the <code className="bg-muted px-1 rounded">deploy-webhook</code> in Vercel to track deployments.
                </p>
              ) : (
                <div className="space-y-2">
                  {deployEvents.map((dep) => (
                    <div key={dep.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {dep.status === "ready" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                         dep.status === "error" ? <XCircle className="h-4 w-4 text-red-500" /> :
                         dep.status === "building" ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> :
                         <Clock className="h-4 w-4 text-muted-foreground" />}
                        <GitBranch className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm font-mono">{dep.branch || "—"}</span>
                        {dep.commit_sha && <span className="text-xs text-muted-foreground font-mono">{dep.commit_sha.slice(0, 7)}</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {dep.commit_message && <span className="text-xs text-muted-foreground max-w-[300px] truncate">{dep.commit_message}</span>}
                        <Badge variant="outline" className="text-[10px]">{dep.status}</Badge>
                        <span className="text-xs text-muted-foreground">{timeAgo(dep.deployed_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Healing Log ── */}
        <TabsContent value="healing" className="space-y-4">
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

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Auto-Heal Pipeline (CLI)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The sentinel runs autonomously. These CLI commands are for manual intervention.
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
              Click "Full Check" to test {RPC_FUNCTIONS.length} RPCs and {EDGE_FUNCTIONS.length} edge functions from your browser.
            </CardContent></Card>
          ) : (
            <>
              {manualChecks.filter((c) => !c.name.startsWith("RPC:") && !c.name.startsWith("Edge:")).length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">Infrastructure</CardTitle></CardHeader>
                  <CardContent className="space-y-1">
                    {manualChecks.filter((c) => !c.name.startsWith("RPC:") && !c.name.startsWith("Edge:")).map((c) => <HealthRow key={c.name} check={c} />)}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">RPC Functions ({RPC_FUNCTIONS.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {manualChecks.filter((c) => c.name.startsWith("RPC:")).map((c) => <HealthRow key={c.name} check={c} />)}
                </CardContent>
              </Card>
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
              <div className="mt-4 rounded-lg border p-4 bg-muted/50">
                <h4 className="text-sm font-medium mb-2">Self-Healing Pipeline</h4>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Layer 1 — Detection:</strong> auto-error-reporter (browser) + withErrorReporting (server) + health-probe (cron/5min) → bug_reports + health_checks</p>
                  <p><strong>Layer 2 — Diagnosis:</strong> sentinel-worker (cron/2min) pattern-matches against {totalPatterns} known patterns. Unknown errors → GPT-4o-mini AI diagnosis.</p>
                  <p><strong>Layer 3 — Healing:</strong> Auto-fix actions: create_incident, circuit_breaker (disable feature), log_only. {sentinelFixesApplied24h} fixes applied in last 24h.</p>
                  <p><strong>Layer 4 — Correlation:</strong> deploy-webhook captures Vercel deploys. Sentinel correlates error spikes with recent deployments.</p>
                  <p><strong>Layer 5 — Recovery:</strong> Circuit breakers auto-reset when error rate drops to 0. Incidents auto-resolve after 2 hours of silence.</p>
                </div>
              </div>
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
          {incident.source && <Badge variant="outline" className="text-xs">{incident.source}</Badge>}
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
