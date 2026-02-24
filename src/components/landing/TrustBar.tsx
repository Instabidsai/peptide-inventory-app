import { FlaskConical, Package, Zap, Shield } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";

export function TrustBar() {
  const stats = [
    {
      icon: Package,
      value: 200,
      suffix: "+",
      label: "Features Built",
    },
    {
      icon: FlaskConical,
      value: 20,
      suffix: "+",
      label: "Peptide Workflows",
    },
    {
      icon: Zap,
      value: 30,
      suffix: "s",
      label: "Avg. AI Build Time",
    },
    {
      icon: Shield,
      value: 99.9,
      suffix: "%",
      label: "Uptime SLA",
    },
  ];

  return (
    <section className="py-10 border-y border-border/30 bg-card/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Trusted by logos — infinite marquee */}
        <div className="relative mb-8 overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-card/20 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-card/20 to-transparent z-10 pointer-events-none" />
          <div
            className="flex gap-12 opacity-40 whitespace-nowrap"
            style={{ animation: "marquee 25s linear infinite", width: "max-content" }}
          >
            {[...Array(2)].flatMap((_, dup) =>
              ["Compounding Pharmacies", "Peptide Distributors", "Research Labs", "Wellness Clinics", "Anti-Aging Practices", "Functional Medicine", "Sports Performance", "Integrative Health"].map((name) => (
                <div key={`${name}-${dup}`} className="flex items-center gap-1.5 shrink-0">
                  <FlaskConical className="w-4 h-4" />
                  <span className="text-xs font-semibold tracking-wide uppercase">{name}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-10">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <s.icon className="w-5 h-5 text-primary/70 mx-auto mb-2" />
              <p className="text-2xl font-bold text-foreground">
                <AnimatedCounter
                  target={s.value}
                  suffix={s.suffix}
                />
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
