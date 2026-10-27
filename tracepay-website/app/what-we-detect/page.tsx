import type { Metadata } from "next";
import { WhatWeDetect } from "@/components/what-we-detect";
import { ProductShowcaseSection } from "@/components/product-showcase-section";
import { FinalCta } from "@/components/final-cta";

export const metadata: Metadata = {
  title: "What we detect",
  description: "Recurring payments, subscription price changes, duplicate payments, banking fees and spending patterns that deserve a closer look.",
  alternates: { canonical: "/what-we-detect" },
};

export default function Page() {
  return (
    <>
      <WhatWeDetect as="h1" />
      <ProductShowcaseSection />
      <FinalCta />
    </>
  );
}
