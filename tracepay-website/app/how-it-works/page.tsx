import type { Metadata } from "next";
import { HowItWorks } from "@/components/how-it-works";
import { ProblemSection } from "@/components/problem-section";
import { ProductShowcaseSection } from "@/components/product-showcase-section";
import { FinalCta } from "@/components/final-cta";

export const metadata: Metadata = {
  title: "How it works",
  description: "From transactions to understanding: how TracePay examines statements, identifies patterns and explains what deserves attention.",
  alternates: { canonical: "/how-it-works" },
};

export default function Page() {
  return (
    <>
      <HowItWorks as="h1" />
      <ProblemSection />
      <ProductShowcaseSection />
      <FinalCta />
    </>
  );
}
