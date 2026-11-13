import type { Metadata } from "next";
import { SecuritySection } from "@/components/security-section";
import { FinalCta } from "@/components/final-cta";

export const metadata: Metadata = {
  title: "Security",
  description: "The principles that guide how TracePay handles your financial information: consent, clarity and honesty about limits.",
  alternates: { canonical: "/security" },
};

export default function Page() {
  return (
    <>
      <SecuritySection as="h1" />
      <FinalCta />
    </>
  );
}
