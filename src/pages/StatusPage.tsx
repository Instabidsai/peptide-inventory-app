import { useEffect, useState } from "react";
import { supabase } from "@/integrations/sb_client/client";

interface HealthSummary {
  overall: "operational" | "degraded" | "outage";
  checks: { category: string; status: "pass" | "fail"; count: number }[];
  uptime_pct: number;
  last_check: string | null;
  incidents: { id: string; title: string; severity: string; status: string; detected_at: string }[];
}

const CATEGORY_LABELS: Record<string, string> = {
  infra: "Infrastructure",
  rpc: "Database Functions",
  edge: "Edge Functions",
  app: "Application",
  db_health: "Database Health",
  dependency: "External Services",
  synthetic: "Synthetic Tests",
};

function StatusDot({ status }: { status: "pass" | "fail" | "operational" | "degraded" | "outage" }) {
  const color =
    status === "pass" || status === "operational"
      ? "bg-primary"
      : status === "degraded"
        ? "bg-amber-500"
        : "bg-red-500";
  return <span className={`inline-block h-3 w-3 rounded-full ${color}`} />;
}

export default function StatusPage() {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function fetchStatus() {
    try {
      // Get latest health checks (last run)
      const { data: latestChecks } = await supabase
        .from("health_checks")
        .select("check_name, category, status, checked_at")
        .order("checked_at", { ascending: false })
        .limit(100);

      if (!latestChecks || latestChecks.length === 0) {
        setSummary({ overall: "operational", checks: [], uptime_pct: 100, last_check: null, incidents: [] });
        setLoading(false);
        return;
      }

      // Group by latest check per name
      const latestRun = latestChecks[0].checked_at;
      const runChecks = latestChecks.filter((c) => c.checked_at === latestRun);

      // Group by category
      const categoryMap: Record<string, { pass: number; fail: number }> = {};
      for (const c of runChecks) {
        const cat = c.category || "other";
        if (!categoryMap[cat]) categoryMap[cat] = { pass: 0, fail: 0 };
        categoryMap[cat][c.status as "pass" | "fail"]++;
      }

      const checks = Object.entries(categoryMap).map(([category, { pass, fail }]) => ({
        category,
        status: (fail > 0 ? "fail" : "pass") as "pass" | "fail",
        count: pass + fail,
      }));

      // Calculate 24h uptime
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentChecks } = await supabase
        .from("health_checks")
        .select("status")
        .gte("checked_at", twentyFourHoursAgo);

      const totalRecent = recentChecks?.length || 1;
      const passRecent = recentChecks?.filter((c) => c.status === "pass").length || 0;
      const uptime_pct = Math.round((passRecent / totalRecent) * 10000) / 100;

      // Get active incidents
      const { data: incidents } = await supabase
        .from("incidents")
        .select("id, title, severity, status, detected_at")
        .in("status", ["detected", "diagnosing", "healing"])
        .order("detected_at", { ascending: false })
        .limit(5);

      const failCount = checks.filter((c) => c.status === "fail").length;
      const overall: HealthSummary["overall"] =
        failCount === 0 ? "operational" : failCount <= 2 ? "degraded" : "outage";

      setSummary({
        overall,
        checks,
        uptime_pct,
        last_check: latestRun,
        incidents: incidents || [],
      });
    } catch {
      setSummary({ overall: "degraded", checks: [], uptime_pct: 0, last_check: null, incidents: [] });
    }
    setLoading(false);
    setLastRefresh(new Date());
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to real-time health check updates
  useEffect(() => {
    const channel = supabase
      .channel("status-page-health")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "health_checks" }, () => {
        fetchStatus();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const overallLabel =
    summary?.overall === "operational"
      ? "All Systems Operational"
      : summary?.overall === "degraded"
        ? "Partial System Degradation"
        : "System Outage Detected";

  const overallColor =
    summary?.overall === "operational"
      ? "bg-primary/10 border-primary/30 text-primary"
      : summary?.overall === "degraded"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-red-50 border-red-200 text-red-800";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">ThePeptideAI System Status</h1>
          <p className="text-sm text-gray-500">Real-time system health monitoring</p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading status...</div>
        ) : summary ? (
          <>
            {/* Overall Status Banner */}
            <div className={`rounded-lg border p-4 mb-8 text-center font-semibold ${overallColor}`}>
              <StatusDot status={summary.overall} />
              <span className="ml-2">{overallLabel}</span>
            </div>

            {/* Uptime */}
            <div className="bg-white rounded-lg border p-4 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">24-Hour Uptime</span>
                <span className={`text-lg font-bold ${summary.uptime_pct >= 99 ? "text-primary" : summary.uptime_pct >= 95 ? "text-amber-600" : "text-red-600"}`}>
                  {summary.uptime_pct}%
                </span>
              </div>
              <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${summary.uptime_pct >= 99 ? "bg-primary" : summary.uptime_pct >= 95 ? "bg-amber-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(100, summary.uptime_pct)}%` }}
                />
              </div>
            </div>

            {/* Component Status */}
            <div className="bg-white rounded-lg border divide-y mb-6">
              <div className="px-4 py-3 font-semibold text-sm text-gray-700">System Components</div>
              {summary.checks.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400">No check data available</div>
              ) : (
                summary.checks.map((c) => (
                  <div key={c.category} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-700">{CATEGORY_LABELS[c.category] || c.category}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{c.count} checks</span>
                      <StatusDot status={c.status} />
                      <span className={`text-xs font-medium ${c.status === "pass" ? "text-primary" : "text-red-600"}`}>
                        {c.status === "pass" ? "Operational" : "Issue Detected"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Active Incidents */}
            {summary.incidents.length > 0 && (
              <div className="bg-white rounded-lg border divide-y mb-6">
                <div className="px-4 py-3 font-semibold text-sm text-gray-700">Active Incidents</div>
                {summary.incidents.map((inc) => (
                  <div key={inc.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        inc.severity === "critical" ? "bg-red-100 text-red-700"
                        : inc.severity === "high" ? "bg-orange-100 text-orange-700"
                        : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {inc.severity}
                      </span>
                      <span className="text-sm text-gray-800">{inc.title}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(inc.detected_at).toLocaleString()} — {inc.status}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Last Check */}
            <div className="text-center text-xs text-gray-400 mt-6">
              Last checked: {summary.last_check ? new Date(summary.last_check).toLocaleString() : "N/A"}
              <br />
              Page refreshed: {lastRefresh.toLocaleTimeString()}
              <span className="mx-2">·</span>
              Auto-refreshes every 60s
            </div>
          </>
        ) : null}

        {/* Footer */}
        <div className="text-center mt-12 text-xs text-gray-300">
          Powered by Sentinel AI Self-Healing System
        </div>
      </div>
    </div>
  );
}
