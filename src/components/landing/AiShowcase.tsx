import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Package,
  Truck,
  Bell,
  Blocks,
  FileText,
  Check,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiDemoChat } from "@/components/crm/AiDemoChat";
import { LiveBuildPreview, type BuildPreviewVariant } from "@/components/crm/LiveBuildPreview";
import { fadeInUp } from "./constants";

export function AiShowcase() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const autoPlayRef = useRef(true);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const demos: Record<
    string,
    {
      label: string;
      icon: React.ElementType;
      messages: { role: "user" | "ai"; text: string }[];
      buildSteps: string[];
      result: React.ReactNode;
      variant: BuildPreviewVariant;
    }
  > = {
    dashboard: {
      label: "Dashboard",
      icon: BarChart3,
      variant: "revenue",
      messages: [
        {
          role: "user",
          text: "Build me a dashboard showing daily order volume and revenue by peptide.",
        },
        {
          role: "ai",
          text: "Your analytics dashboard is live with daily orders, revenue by peptide, and 30-day trends. It auto-refreshes every 5 minutes.",
        },
      ],
      buildSteps: [
        "Analyzing your data schema...",
        "Designing dashboard layout...",
        "Connecting live data feeds...",
        "Deploying widget...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">Revenue by Peptide</span>
            <span className="text-[10px] text-muted-foreground">
              Last 30 days
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              { name: "BPC-157", pct: 85, amt: "$12,450" },
              { name: "TB-500", pct: 62, amt: "$9,100" },
              { name: "GHK-Cu", pct: 45, amt: "$6,600" },
              { name: "KPV", pct: 30, amt: "$4,400" },
            ].map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                  {p.name}
                </span>
                <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full"
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-foreground w-14 text-right">
                  {p.amt}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    inventory: {
      label: "Inventory",
      icon: Package,
      variant: "inventory",
      messages: [
        {
          role: "user",
          text: "Show me all BPC-157 lots and let me adjust the stock count for LOT-2024-C.",
        },
        {
          role: "ai",
          text: "Here's your BPC-157 inventory by lot. LOT-2024-C is highlighted and editable — adjust the count directly. Changes sync across all systems instantly.",
        },
      ],
      buildSteps: [
        "Loading inventory records...",
        "Fetching lot details...",
        "Enabling inline editing...",
        "Ready for changes...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium">BPC-157 Lot Inventory</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">
              Editing
            </span>
          </div>
          {[
            { lot: "LOT-2024-A", qty: 840, exp: "2026-08-15", active: false },
            { lot: "LOT-2024-B", qty: 620, exp: "2026-11-20", active: false },
            { lot: "LOT-2024-C", qty: 450, exp: "2027-01-10", active: true },
          ].map((row) => (
            <div
              key={row.lot}
              className={`flex items-center justify-between text-xs p-1.5 rounded ${
                row.active
                  ? "bg-primary/10 border border-primary/30"
                  : "bg-card/60"
              }`}
            >
              <span className="font-mono text-[10px]">{row.lot}</span>
              <span className={row.active ? "text-primary font-bold" : ""}>
                {row.active ? (
                  <span className="border-b border-primary/50 px-1">
                    {row.qty}
                  </span>
                ) : (
                  row.qty
                )}{" "}
                vials
              </span>
              <span className="text-muted-foreground text-[10px]">
                Exp: {row.exp}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    orders: {
      label: "Orders",
      icon: Truck,
      variant: "order",
      messages: [
        {
          role: "user",
          text: "Process order #4521 — charge the card, generate a shipping label, and notify the customer.",
        },
        {
          role: "ai",
          text: "Order #4521 complete! Payment captured ($347.00), USPS Priority label generated via Shippo, and customer notified with tracking number 9400111899223456789.",
        },
      ],
      buildSteps: [
        "Verifying order details...",
        "Processing payment via PsiFi...",
        "Generating shipping label...",
        "Sending customer notification...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Order #4521</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
              Fulfilled
            </span>
          </div>
          <div className="space-y-1.5">
            {[
              {
                step: "Payment captured",
                detail: "$347.00 via PsiFi",
                done: true,
              },
              {
                step: "Label generated",
                detail: "USPS Priority 2-Day",
                done: true,
              },
              {
                step: "Customer notified",
                detail: "Email + tracking sent",
                done: true,
              },
            ].map((s) => (
              <div
                key={s.step}
                className="flex items-center gap-2 text-[10px]"
              >
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-foreground">{s.step}</span>
                <span className="text-muted-foreground">— {s.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    automate: {
      label: "Automate",
      icon: Bell,
      variant: "automation",
      messages: [
        {
          role: "user",
          text: "Set up automatic reorder alerts when any peptide drops below 200 units.",
        },
        {
          role: "ai",
          text: "Automation active! When stock dips below 200, your team gets email + in-app alerts with a one-click reorder button. I'm monitoring all 24 peptide SKUs.",
        },
      ],
      buildSteps: [
        "Analyzing inventory thresholds...",
        "Creating automation rule...",
        "Configuring notifications...",
        "Activating real-time monitor...",
      ],
      result: (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-yellow-300">
              Reorder Alert
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-auto">
              24 SKUs monitored
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong className="text-foreground">TB-500</strong> is at{" "}
            <strong className="text-yellow-400">147 units</strong> (threshold:
            200)
          </p>
          <div className="mt-2 flex gap-2">
            <span className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors">
              Reorder Now
            </span>
            <span className="text-[10px] px-2 py-1 rounded bg-card text-muted-foreground cursor-pointer">
              Dismiss
            </span>
          </div>
        </div>
      ),
    },
    build: {
      label: "Build",
      icon: Blocks,
      variant: "module",
      messages: [
        {
          role: "user",
          text: 'Create a new "Protocols" module where I can build peptide dosing schedules and assign them to clients.',
        },
        {
          role: "ai",
          text: 'Your Protocols module is live! I created a database table with fields for peptide, dose, frequency, duration, and notes. Built the form, list view, and client assignment panel. It\'s in your sidebar under "Protocols".',
        },
      ],
      buildSteps: [
        "Designing data schema...",
        "Creating database table...",
        "Building UI components...",
        "Adding to navigation...",
      ],
      result: (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-medium text-foreground">
                Protocols Module
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">
              Just Created
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              "Peptide (select)",
              "Dose (mg)",
              "Frequency (select)",
              "Duration (weeks)",
              "Client (relation)",
              "Notes (text)",
            ].map((field) => (
              <div
                key={field}
                className="text-[10px] px-2 py-1 rounded bg-background/60 border border-border/30 text-muted-foreground"
              >
                {field}
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-[9px]">
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              Form ready
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              List view ready
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
              In sidebar
            </span>
          </div>
        </div>
      ),
    },
    reports: {
      label: "Reports",
      icon: FileText,
      variant: "report",
      messages: [
        {
          role: "user",
          text: "Generate a monthly compliance report showing all COA expirations and cold chain events.",
        },
        {
          role: "ai",
          text: "Your compliance report is ready — COA status for all active lots, cold chain deviations flagged by severity, and an exportable PDF for auditors.",
        },
      ],
      buildSteps: [
        "Querying compliance data...",
        "Analyzing COA status...",
        "Generating charts...",
        "Compiling report...",
      ],
      result: (
        <div className="rounded-lg border border-border/40 bg-background/60 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              Compliance Report — {new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" })}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              Passed
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Active COAs", value: "24", ok: true },
              { label: "Expiring", value: "3", ok: false },
              { label: "Chain Events", value: "0", ok: true },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-card/80 rounded p-1.5 border border-border/30"
              >
                <p
                  className={`text-sm font-bold ${s.ok ? "text-emerald-400" : "text-yellow-400"}`}
                >
                  {s.value}
                </p>
                <p className="text-[9px] text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  };

  const tabKeys = Object.keys(demos);

  const handleDemoComplete = () => {
    if (!autoPlayRef.current) return;
    advanceTimerRef.current = setTimeout(() => {
      setActiveTab((prev) => {
        const idx = tabKeys.indexOf(prev);
        return tabKeys[(idx + 1) % tabKeys.length];
      });
    }, 3000);
  };

  const handleTabChange = (value: string) => {
    autoPlayRef.current = false;
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    setActiveTab(value);
  };

  // Cleanup advance timer on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
    };
  }, []);

  return (
    <section id="ai-showcase" className="py-16 sm:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div {...fadeInUp} className="text-center mb-12">
          <span className="text-xs font-medium text-primary uppercase tracking-wider mb-2 block">
            The Differentiator
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            Watch Your AI Control the Entire CRM
          </h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Not just reports and dashboards — your AI manages inventory,
            processes orders, builds new modules, and automates workflows.
            Click each tab to see it in action.
          </p>
        </motion.div>

        <motion.div {...fadeInUp}>
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6 max-w-2xl mx-auto mb-8 h-auto gap-1">
              {Object.entries(demos).map(([key, demo]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="text-xs sm:text-sm px-2 py-2"
                >
                  <demo.icon className="w-3.5 h-3.5 sm:mr-1.5 shrink-0" />
                  <span className="hidden sm:inline">{demo.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-h-[440px]">
              {Object.entries(demos).map(([key, demo]) => (
                <TabsContent key={key} value={key}>
                  <div className="max-w-2xl mx-auto">
                    <AiDemoChat
                      messages={demo.messages}
                      resultElement={demo.result}
                      buildSteps={demo.buildSteps}
                      buildPreview={(phase) => <LiveBuildPreview phase={phase} variant={demo.variant} />}
                      onComplete={handleDemoComplete}
                    />
                  </div>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </motion.div>
      </div>
    </section>
  );
}
