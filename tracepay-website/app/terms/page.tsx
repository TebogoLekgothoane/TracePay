import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { TERMS_INTRO, TERMS_SECTIONS, TERMS_STATUS, TERMS_UPDATED } from "@/lib/terms";

export const metadata: Metadata = {
  title: "Terms of service",
  description:
    "The terms for using TracePay: what it does, that it is information and not advice, how plans and payment work, and your responsibilities.",
  alternates: { canonical: "/terms" },
  // A draft is not indexed by search engines until it is published.
  robots: { index: TERMS_STATUS === "published" },
};

export default function Page() {
  return (
    <LegalDocument
      title="Terms of service"
      updated={TERMS_UPDATED}
      intro={TERMS_INTRO}
      sections={TERMS_SECTIONS}
      status={TERMS_STATUS}
    />
  );
}
