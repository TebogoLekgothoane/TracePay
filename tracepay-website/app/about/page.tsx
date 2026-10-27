import type { Metadata } from "next";
import { AboutSection } from "@/components/about-section";
import { FinalCta } from "@/components/final-cta";

export const metadata: Metadata = {
  title: "About",
  description: "TracePay is a South African financial intelligence startup helping people see the patterns hidden in their transactions.",
  alternates: { canonical: "/about" },
};

export default function Page() {
  return (
    <>
      <AboutSection as="h1" />
      <FinalCta />
    </>
  );
}
