import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";
import { PRIVACY_INTRO, PRIVACY_SECTIONS, PRIVACY_STATUS, PRIVACY_UPDATED } from "@/lib/privacy";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What personal information TracePay collects, why, who it is shared with, how long it is kept and your rights under POPIA.",
  alternates: { canonical: "/privacy" },
  // A draft is not indexed by search engines until it is published.
  robots: { index: PRIVACY_STATUS === "published" },
};

export default function Page() {
  return (
    <LegalDocument
      title="Privacy policy"
      updated={PRIVACY_UPDATED}
      intro={PRIVACY_INTRO}
      sections={PRIVACY_SECTIONS}
      status={PRIVACY_STATUS}
    />
  );
}
