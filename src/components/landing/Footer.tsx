import { Shield, Lock, BadgeCheck } from "lucide-react";
import { PLATFORM, scrollTo } from "./constants";

export function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        { label: "Features", action: () => scrollTo("features") },
        { label: "AI Builder", action: () => scrollTo("ai-showcase") },
        { label: "Pricing", action: () => scrollTo("pricing") },
        { label: "FAQ", action: () => scrollTo("faq") },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "How It Works", action: () => scrollTo("ai-showcase") },
        { label: "Partnerships", action: () => scrollTo("final-cta") },
        { label: "Contact Us", action: () => window.open(`mailto:${PLATFORM.supportEmail}`, "_blank") },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", action: () => window.location.hash = "#/privacy" },
        { label: "Terms of Service", action: () => window.location.hash = "#/terms" },
        { label: "Contact Us", action: () => scrollTo("final-cta") },
      ],
    },
  ];

  return (
    <footer className="border-t border-border/30 py-12 pb-20 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4 group cursor-pointer">
              <div className="relative p-1 bg-gradient-to-br from-card to-background rounded-lg ring-1 ring-primary/30 flex items-center justify-center">
                <img src="/logo.png" alt="Logo" className="w-4 h-4 object-contain group-hover:scale-110 transition-transform duration-300" />
              </div>
              <span className="font-bold">{PLATFORM.name}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The AI-powered command center for peptide businesses. One AI,
              infinite possibilities.
            </p>
          </div>

          {cols.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold text-foreground mb-3">
                {col.title}
              </h4>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <button
                      onClick={l.action}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Security badges */}
        <div className="mt-8 flex flex-wrap justify-center gap-6">
          {[
            { icon: Shield, label: "Security Best Practices" },
            { icon: Lock, label: "Encrypted at Rest & In Transit" },
            { icon: BadgeCheck, label: "Row-Level Data Isolation" },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <badge.icon className="w-3.5 h-3.5 text-emerald-400/70" />
              {badge.label}
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-border/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} {PLATFORM.name}. All rights reserved.
          </p>
          <a
            href={`mailto:${PLATFORM.supportEmail}`}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {PLATFORM.supportEmail}
          </a>
        </div>
      </div>
    </footer>
  );
}
