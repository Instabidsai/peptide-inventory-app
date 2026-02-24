import { useEffect } from "react";
import { ScrollProgress } from "@/components/landing/ScrollProgress";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { TwoPathFork } from "@/components/landing/TwoPathFork";
import { TrustBar } from "@/components/landing/TrustBar";
import { PainPoints } from "@/components/landing/PainPoints";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { StartABusinessSteps } from "@/components/landing/StartABusinessSteps";
import { TwoAiBrains } from "@/components/landing/TwoAiBrains";
import { PlatformFeatures } from "@/components/landing/PlatformFeatures";
import { AiShowcase } from "@/components/landing/AiShowcase";
import { PaymentIntegration } from "@/components/landing/PaymentIntegration";
import { SupplyChain } from "@/components/landing/SupplyChain";
import { Testimonials } from "@/components/landing/Testimonials";
import { Pricing } from "@/components/landing/Pricing";
import { Faq } from "@/components/landing/Faq";
import { FinalCta } from "@/components/landing/FinalCta";
import { Footer } from "@/components/landing/Footer";
import { BackToTop } from "@/components/landing/BackToTop";
import { StickyMobileCta } from "@/components/landing/StickyMobileCta";

export default function CrmLanding() {
  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ScrollProgress />
      <Nav />
      <Hero />
      <TwoPathFork />
      <TrustBar />
      <PainPoints />
      <PlatformFeatures />
      <StartABusinessSteps />
      <SupplyChain />
      <PaymentIntegration />
      <HowItWorks />
      <AiShowcase />
      <TwoAiBrains />
      <Testimonials />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
      <BackToTop />
      <StickyMobileCta />
    </div>
  );
}
