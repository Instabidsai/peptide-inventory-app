import { lazy, Suspense, useEffect, useRef, useState, startTransition } from "react";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { BackToTop } from "@/components/landing/BackToTop";
import { StickyMobileCta } from "@/components/landing/StickyMobileCta";

// Lazy-load everything below the hero to avoid blocking the main thread
const TwoPathFork = lazy(() => import("@/components/landing/TwoPathFork").then(m => ({ default: m.TwoPathFork })));
const TrustBar = lazy(() => import("@/components/landing/TrustBar").then(m => ({ default: m.TrustBar })));
const PainPoints = lazy(() => import("@/components/landing/PainPoints").then(m => ({ default: m.PainPoints })));
const PlatformFeatures = lazy(() => import("@/components/landing/PlatformFeatures").then(m => ({ default: m.PlatformFeatures })));
const StartABusinessSteps = lazy(() => import("@/components/landing/StartABusinessSteps").then(m => ({ default: m.StartABusinessSteps })));
const SupplyChain = lazy(() => import("@/components/landing/SupplyChain").then(m => ({ default: m.SupplyChain })));
const PaymentIntegration = lazy(() => import("@/components/landing/PaymentIntegration").then(m => ({ default: m.PaymentIntegration })));
const HowItWorks = lazy(() => import("@/components/landing/HowItWorks").then(m => ({ default: m.HowItWorks })));
const AiShowcase = lazy(() => import("@/components/landing/AiShowcase").then(m => ({ default: m.AiShowcase })));
const TwoAiBrains = lazy(() => import("@/components/landing/TwoAiBrains").then(m => ({ default: m.TwoAiBrains })));
const Testimonials = lazy(() => import("@/components/landing/Testimonials").then(m => ({ default: m.Testimonials })));
const Pricing = lazy(() => import("@/components/landing/Pricing").then(m => ({ default: m.Pricing })));
const Faq = lazy(() => import("@/components/landing/Faq").then(m => ({ default: m.Faq })));
const FinalCta = lazy(() => import("@/components/landing/FinalCta").then(m => ({ default: m.FinalCta })));
const IntegrationsBanner = lazy(() => import("@/components/landing/IntegrationsBanner").then(m => ({ default: m.IntegrationsBanner })));
const Footer = lazy(() => import("@/components/landing/Footer").then(m => ({ default: m.Footer })));

/** Sentinel that becomes visible when user scrolls near the fold.
 *  Triggers loading the next batch only when the user is actually scrolling. */
function LazyBatch({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { startTransition(() => setVisible(true)); io.disconnect(); } },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (visible) return <Suspense fallback={null}>{children}</Suspense>;
  return <div ref={ref} style={{ minHeight: 1 }}>{fallback}</div>;
}

export default function CrmLanding() {
  const [showBatch1, setShowBatch1] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    // Load only the first batch on a short delay; remaining batches
    // load on-demand via IntersectionObserver to avoid multi-second long tasks.
    const t1 = setTimeout(() => startTransition(() => setShowBatch1(true)), 150);
    return () => clearTimeout(t1);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ScrollProgress />
      <Nav />
      <Hero />
      {showBatch1 && (
        <Suspense fallback={null}>
          <TwoPathFork />
          <TrustBar />
          <PainPoints />
        </Suspense>
      )}
      <LazyBatch>
        <IntegrationsBanner />
        <PlatformFeatures />
        <StartABusinessSteps />
        <SupplyChain />
      </LazyBatch>
      <LazyBatch>
        <PaymentIntegration />
        <HowItWorks />
        <AiShowcase />
        <TwoAiBrains />
      </LazyBatch>
      <LazyBatch>
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
        <Footer />
      </LazyBatch>
      <BackToTop />
      <StickyMobileCta />
    </div>
  );
}
