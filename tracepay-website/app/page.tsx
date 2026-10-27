import { HeroSection } from "@/components/hero-section";
import { ProblemSection } from "@/components/problem-section";
import { HowItWorks } from "@/components/how-it-works";
import { WhatWeDetect } from "@/components/what-we-detect";
import { ProductShowcaseSection } from "@/components/product-showcase-section";
import { SecuritySection } from "@/components/security-section";
import { AboutSection } from "@/components/about-section";
import { FinalCta } from "@/components/final-cta";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <HowItWorks />
      <WhatWeDetect />
      <ProductShowcaseSection />
      <SecuritySection />
      <AboutSection />
      <FinalCta />
    </>
  );
}
