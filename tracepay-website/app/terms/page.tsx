import type { Metadata } from "next";
import { LegalPlaceholder } from "@/components/legal-placeholder";

export const metadata: Metadata = {
  title: "Terms of service",
  alternates: { canonical: "/terms" },
  robots: { index: false },
};

export default function Page() {
  return <LegalPlaceholder title="Terms of service" document="terms of service" />;
}
