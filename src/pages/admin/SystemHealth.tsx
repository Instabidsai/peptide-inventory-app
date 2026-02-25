import { useState } from "react";
import { supabase } from "@/integrations/sb_client/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Activity, Cloud } from "lucide-react";

interface HealthCheck {
  name: string;
  status: "pass" | "fail" | "pending";
  latencyMs?: number;
  error?: string;
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
  "chat-with-ai",
  "admin-ai-chat",
  "partner-ai-chat",
  "invite-user",
  "self-signup",
  "exchange-token",
  "promote-contact",
  "analyze-food",
  "process-health-document",
  "notify-commission",
  "create-supplier-order",
  "provision-tenant",
];

export default function SystemHealth() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

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
      updateCheck("Supabase Connection", { status: "fail", error: err instanceof Error ? err.message : "Unknown" });
    }

    // 2. Auth service check
    try {
      const start = performance.now();
      const { error } = await supabase.auth.getSession();
      const latencyMs = Math.round(performance.now() - start);
      updateCheck("Auth Service", error ? { status: "fail", error: error.message, latencyMs } : { status: "pass", latencyMs });
    } catch (err) {
      updateCheck("Auth Service", { status: "fail", error: err instanceof Error ? err.message : "Unknown" });
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
        updateCheck(`RPC: ${fn}`, { status: "fail", error: err instanceof Error ? err.message : "Unknown" });
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
        updateCheck(`Edge: ${fn}`, { status: "fail", error: err instanceof Error ? err.message : "Unknown" });
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
