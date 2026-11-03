import type { Metadata } from "next";
import { PricingSection } from "@/components/pricing-section";
import { FinalCta } from "@/components/final-cta";
import { FaqSection } from "@/components/faq-section";
import { WaitlistSection } from "@/components/waitlist-section";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "TracePay Individual is R299 a year, plus R49 for a once-off full analysis. Business (R399 a month) and Accountant (R499 a month, 5 client businesses included) are coming soon.",
  alternates: { canonical: "/pricing" },
};

export default function Page() {
  return (
    <>
      <PricingSection as="h1" />
      <FaqSection />
      <WaitlistSection />
      <FinalCta />
    </>
  );
}
