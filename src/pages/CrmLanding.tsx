import { lazy, Suspense, useEffect, useState, startTransition } from "react";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TwoPathFork } from "@/components/landing/TwoPathFork";
import { TrustBar } from "@/components/landing/TrustBar";
import { PainPoints } from "@/components/landing/PainPoints";
import { BackToTop } from "@/components/landing/BackToTop";
import { StickyMobileCta } from "@/components/landing/StickyMobileCta";

// Lazy-load below-fold sections to avoid blocking the main thread
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
const Footer = lazy(() => import("@/components/landing/Footer").then(m => ({ default: m.Footer })));

export default function CrmLanding() {
  const [showBatch1, setShowBatch1] = useState(false);
  const [showBatch2, setShowBatch2] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    // Load below-fold content in two batches to avoid a single mega-long task
    const id = requestIdleCallback(() => startTransition(() => setShowBatch1(true)));
    return () => cancelIdleCallback(id);
  }, []);

  useEffect(() => {
    if (!showBatch1) return;
    const id = requestIdleCallback(() => startTransition(() => setShowBatch2(true)));
    return () => cancelIdleCallback(id);
  }, [showBatch1]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ScrollProgress />
      <Nav />
      <Hero />
      <TwoPathFork />
      <TrustBar />
      <PainPoints />
      {showBatch1 && (
        <Suspense fallback={null}>
          <PlatformFeatures />
          <StartABusinessSteps />
          <SupplyChain />
          <PaymentIntegration />
          <HowItWorks />
          <AiShowcase />
        </Suspense>
      )}
      {showBatch2 && (
        <Suspense fallback={null}>
          <TwoAiBrains />
          <Testimonials />
          <Pricing />
          <Faq />
          <FinalCta />
          <Footer />
        </Suspense>
      )}
      <BackToTop />
      <StickyMobileCta />
    </div>
  );
}
