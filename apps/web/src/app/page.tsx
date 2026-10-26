import { AudienceStrip } from "@/components/landing/AudienceStrip";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Pricing } from "@/components/landing/Pricing";
import { Problem } from "@/components/landing/Problem";
import { SiteFooter } from "@/components/landing/SiteFooter";
import { SiteHeader } from "@/components/landing/SiteHeader";
import { StartCta } from "@/components/landing/StartCta";

export default function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <AudienceStrip />
        <Problem />
        <HowItWorks />
        <Features />
        <Pricing />
        <StartCta />
      </main>
      <SiteFooter />
    </>
  );
}
