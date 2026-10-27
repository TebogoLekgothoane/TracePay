import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = {
  title: "Privacy policy",
  alternates: { canonical: "/privacy" },
  robots: { index: false },
};

export default function Page() {
  return <LegalPlaceholder title="Privacy policy" document="privacy policy" />;
}
