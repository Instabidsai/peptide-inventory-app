import type React from "react";

// ─── Platform branding (customize here for your own platform) ────
export const PLATFORM = {
  name: "ThePeptideAI",
  supportEmail: "admin@thepeptideai.com",
  legalEmail: "legal@thepeptideai.com",
} as const;

// ─── Helpers ──────────────────────────────────────────────────────
export const scrollTo = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
};

export const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { type: "spring", stiffness: 100, damping: 20 },
};

/* Shimmer animation for premium CTA buttons */
export const shimmerStyle: React.CSSProperties = {
  backgroundSize: "200% 100%",
  animation: "shimmer 2.5s ease-in-out infinite",
};

export const shimmerKeyframes = `
@keyframes shimmer { 0%,100%{background-position:100% 0} 50%{background-position:0 0} }
@keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
@keyframes gradient-slide { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
`;
