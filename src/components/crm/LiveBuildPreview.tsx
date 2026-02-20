import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Check, Bell, FileText } from "lucide-react";

// ─── Counting number that animates from 0 to target ─────────────────
function CountUp({ target, duration = 800, prefix = "", suffix = "" }: {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return <>{prefix}{value.toLocaleString()}{suffix}</>;
}

// ─── Skeleton shimmer block ──────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded bg-muted-foreground/10 overflow-hidden ${className}`}>
      <motion.div
        className="h-full w-1/2 bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent"
        animate={{ x: ["-100%", "300%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

// ─── Scan line effect ────────────────────────────────────────────────
function ScanLine() {
  return (
    <motion.div
      className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent"
      initial={{ top: 0 }}
      animate={{ top: "100%" }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    />
  );
}

// ─── Container shell with animated border ────────────────────────────
function BuildContainer({ children, phase, glow = false }: {
  children: React.ReactNode;
  phase: number;
  glow?: boolean;
}) {
  return (
    <motion.div
      className="relative rounded-lg overflow-hidden mt-2"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Animated border */}
      <div className={`absolute inset-0 rounded-lg transition-all duration-700 ${
        phase >= 3
          ? "ring-1 ring-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
          : phase >= 1
            ? "ring-1 ring-border/40"
            : "ring-1 ring-border/20"
      }`} />
      {phase < 2 && <ScanLine />}
      <div className={`relative rounded-lg p-3 transition-colors duration-500 ${
        phase >= 2 ? "bg-background/60" : "bg-background/30"
      }`}>
        {children}
      </div>
    </motion.div>
  );
}

// ─── Stagger wrapper for children ────────────────────────────────────
const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.35, ease: "easeOut" },
  }),
};

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Dashboard
// ═══════════════════════════════════════════════════════════════════════
function DashboardPreview({ phase }: { phase: number }) {
  const stats = [
    { label: "In Stock", value: 2450, sub: "vials" },
    { label: "Expiring <30d", value: 120, sub: "vials" },
    { label: "Active Lots", value: 8, sub: "tracked" },
  ];

  return (
    <BuildContainer phase={phase}>
      {/* Phase 0+: Header */}
      <AnimatePresence>
        {phase >= 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between mb-2"
          >
            {phase >= 1 ? (
              <>
                <span className="text-xs font-medium text-foreground">BPC-157 Command Dashboard</span>
                {phase >= 3 && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400"
                  >
                    Live
                  </motion.span>
                )}
              </>
            ) : (
              <Skeleton className="h-3 w-40" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 1+: Stat cards */}
      {phase >= 1 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={staggerItem}
              className="bg-card/80 rounded p-2 border border-border/30"
            >
              {phase >= 2 ? (
                <>
                  <p className="text-lg font-bold text-foreground">
                    <CountUp target={s.value} />
                  </p>
                  <p className="text-[10px] text-muted-foreground">{s.label} ({s.sub})</p>
                </>
              ) : (
                <>
                  <Skeleton className="h-5 w-12 mb-1" />
                  <Skeleton className="h-2.5 w-16" />
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Phase 2+: Lot tags & reorder button */}
      {phase >= 2 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between"
        >
          <div className="flex gap-1.5">
            {["LOT-A", "LOT-B", "LOT-C"].map((lot, i) => (
              <motion.span
                key={lot}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 * i }}
                className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
              >
                {lot}
              </motion.span>
            ))}
          </div>
          {phase >= 3 && (
            <motion.span
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-[9px] px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
            >
              Reorder TB-500
            </motion.span>
          )}
        </motion.div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Revenue Chart (bar chart with growing bars)
// ═══════════════════════════════════════════════════════════════════════
function RevenuePreview({ phase }: { phase: number }) {
  const bars = [
    { name: "BPC-157", pct: 85, amt: "$12,450" },
    { name: "TB-500", pct: 62, amt: "$9,100" },
    { name: "GHK-Cu", pct: 45, amt: "$6,600" },
    { name: "KPV", pct: 30, amt: "$4,400" },
  ];

  return (
    <BuildContainer phase={phase}>
      <AnimatePresence>
        {phase >= 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-2">
            {phase >= 1 ? (
              <>
                <span className="text-xs font-medium">Revenue by Peptide</span>
                <span className="text-[10px] text-muted-foreground">Last 30 days</span>
              </>
            ) : (
              <Skeleton className="h-3 w-36" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {phase >= 1 && (
        <div className="space-y-1.5">
          {bars.map((p, i) => (
            <motion.div
              key={p.name}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={staggerItem}
              className="flex items-center gap-2"
            >
              <span className="text-[10px] text-muted-foreground w-14 shrink-0">
                {phase >= 2 ? p.name : <Skeleton className="h-2.5 w-10" />}
              </span>
              <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary/70 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: phase >= 2 ? `${p.pct}%` : "0%" }}
                  transition={{ duration: 0.8, delay: i * 0.15, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] text-foreground w-14 text-right">
                {phase >= 2 ? p.amt : ""}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Inventory Table
// ═══════════════════════════════════════════════════════════════════════
function InventoryPreview({ phase }: { phase: number }) {
  const rows = [
    { lot: "LOT-2024-A", qty: 840, exp: "2026-08-15", active: false },
    { lot: "LOT-2024-B", qty: 620, exp: "2026-11-20", active: false },
    { lot: "LOT-2024-C", qty: 450, exp: "2027-01-10", active: true },
  ];

  return (
    <BuildContainer phase={phase}>
      {phase >= 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-2">
          {phase >= 1 ? (
            <>
              <span className="text-xs font-medium">BPC-157 Lot Inventory</span>
              {phase >= 3 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary">Editing</motion.span>
              )}
            </>
          ) : <Skeleton className="h-3 w-36" />}
        </motion.div>
      )}

      {phase >= 1 && (
        <div className="space-y-1.5">
          {rows.map((row, i) => (
            <motion.div
              key={row.lot}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={staggerItem}
              className={`flex items-center justify-between text-xs p-1.5 rounded transition-colors duration-300 ${
                phase >= 3 && row.active ? "bg-primary/10 border border-primary/30" : "bg-card/60"
              }`}
            >
              {phase >= 2 ? (
                <>
                  <span className="font-mono text-[10px]">{row.lot}</span>
                  <span className={phase >= 3 && row.active ? "text-primary font-bold" : ""}>
                    {phase >= 3 && row.active ? (
                      <span className="border-b border-primary/50 px-1"><CountUp target={row.qty} /></span>
                    ) : (
                      <CountUp target={row.qty} />
                    )} vials
                  </span>
                  <span className="text-muted-foreground text-[10px]">Exp: {row.exp}</span>
                </>
              ) : (
                <>
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-18" />
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Order Processing
// ═══════════════════════════════════════════════════════════════════════
function OrderPreview({ phase }: { phase: number }) {
  const steps = [
    { step: "Payment captured", detail: "$347.00 via Stripe" },
    { step: "Label generated", detail: "USPS Priority 2-Day" },
    { step: "Customer notified", detail: "Email + tracking sent" },
  ];

  return (
    <BuildContainer phase={phase}>
      {phase >= 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-2">
          {phase >= 1 ? (
            <>
              <span className="text-xs font-medium">Order #4521</span>
              {phase >= 3 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Fulfilled</motion.span>
              )}
            </>
          ) : <Skeleton className="h-3 w-24" />}
        </motion.div>
      )}

      {phase >= 1 && (
        <div className="space-y-1.5">
          {steps.map((s, i) => {
            const isActive = i <= phase - 1; // step 0 at phase 1, step 1 at phase 2, etc.
            return (
              <motion.div
                key={s.step}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={staggerItem}
                className="flex items-center gap-2 text-[10px]"
              >
                {isActive ? (
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400 }}>
                    <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                  </motion.div>
                ) : (
                  <motion.div
                    className="w-3 h-3 rounded-full border-2 border-muted-foreground/30 border-t-emerald-400 shrink-0"
                    animate={i === phase - 1 + 1 ? { rotate: 360 } : {}}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                )}
                <span className={isActive ? "text-foreground" : "text-muted-foreground/50"}>{s.step}</span>
                {isActive && <span className="text-muted-foreground">— {s.detail}</span>}
              </motion.div>
            );
          })}
        </div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Automation Alert
// ═══════════════════════════════════════════════════════════════════════
function AutomationPreview({ phase }: { phase: number }) {
  return (
    <BuildContainer phase={phase} glow>
      {phase >= 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 mb-2">
          {phase >= 1 ? (
            <>
              <Bell className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-yellow-300">Reorder Alert</span>
              {phase >= 3 && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 ml-auto">
                  24 SKUs monitored
                </motion.span>
              )}
            </>
          ) : <Skeleton className="h-3 w-28" />}
        </motion.div>
      )}

      {phase >= 2 && (
        <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-muted-foreground">
          <strong className="text-foreground">TB-500</strong> is at{" "}
          <strong className="text-yellow-400"><CountUp target={147} /> units</strong> (threshold: 200)
        </motion.p>
      )}

      {phase >= 3 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="mt-2 flex gap-2">
          <span className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary">Reorder Now</span>
          <span className="text-[10px] px-2 py-1 rounded bg-card text-muted-foreground">Dismiss</span>
        </motion.div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Module Builder
// ═══════════════════════════════════════════════════════════════════════
function ModulePreview({ phase }: { phase: number }) {
  const fields = ["Peptide (select)", "Dose (mg)", "Frequency (select)", "Duration (weeks)", "Client (relation)", "Notes (text)"];

  return (
    <BuildContainer phase={phase}>
      {phase >= 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-2">
          {phase >= 1 ? (
            <>
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Protocols Module</span>
              </div>
              {phase >= 3 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">Just Created</motion.span>
              )}
            </>
          ) : <Skeleton className="h-3 w-32" />}
        </motion.div>
      )}

      {phase >= 1 && (
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {fields.map((field, i) => (
            <motion.div
              key={field}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={staggerItem}
              className="text-[10px] px-2 py-1 rounded border border-border/30 transition-colors duration-300"
              style={{ backgroundColor: phase >= 2 ? "hsl(var(--background) / 0.6)" : "transparent" }}
            >
              {phase >= 2 ? (
                <span className="text-muted-foreground">{field}</span>
              ) : (
                <Skeleton className="h-2.5 w-full" />
              )}
            </motion.div>
          ))}
        </div>
      )}

      {phase >= 3 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2 text-[9px]">
          {["Form ready", "List view ready", "In sidebar"].map((badge, i) => (
            <motion.span
              key={badge}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400"
            >
              {badge}
            </motion.span>
          ))}
        </motion.div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// VARIANT: Compliance Report
// ═══════════════════════════════════════════════════════════════════════
function ReportPreview({ phase }: { phase: number }) {
  const metrics = [
    { label: "Active COAs", value: 24, ok: true },
    { label: "Expiring", value: 3, ok: false },
    { label: "Chain Events", value: 0, ok: true },
  ];

  return (
    <BuildContainer phase={phase}>
      {phase >= 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between mb-2">
          {phase >= 1 ? (
            <>
              <span className="text-xs font-medium">Compliance Report — Feb 2026</span>
              {phase >= 3 && (
                <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Passed</motion.span>
              )}
            </>
          ) : <Skeleton className="h-3 w-44" />}
        </motion.div>
      )}

      {phase >= 1 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {metrics.map((s, i) => (
            <motion.div
              key={s.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={staggerItem}
              className="bg-card/80 rounded p-1.5 border border-border/30"
            >
              {phase >= 2 ? (
                <>
                  <p className={`text-sm font-bold ${s.ok ? "text-emerald-400" : "text-yellow-400"}`}>
                    <CountUp target={s.value} />
                  </p>
                  <p className="text-[9px] text-muted-foreground">{s.label}</p>
                </>
              ) : (
                <>
                  <Skeleton className="h-4 w-6 mx-auto mb-1" />
                  <Skeleton className="h-2 w-14 mx-auto" />
                </>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </BuildContainer>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT — variant selector
// ═══════════════════════════════════════════════════════════════════════
export type BuildPreviewVariant =
  | "dashboard"
  | "revenue"
  | "inventory"
  | "order"
  | "automation"
  | "module"
  | "report";

interface LiveBuildPreviewProps {
  phase: number;
  variant: BuildPreviewVariant;
}

export function LiveBuildPreview({ phase, variant }: LiveBuildPreviewProps) {
  switch (variant) {
    case "dashboard": return <DashboardPreview phase={phase} />;
    case "revenue": return <RevenuePreview phase={phase} />;
    case "inventory": return <InventoryPreview phase={phase} />;
    case "order": return <OrderPreview phase={phase} />;
    case "automation": return <AutomationPreview phase={phase} />;
    case "module": return <ModulePreview phase={phase} />;
    case "report": return <ReportPreview phase={phase} />;
    default: return null;
  }
}
