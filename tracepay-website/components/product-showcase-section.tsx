import { SectionHeading } from "@/components/section-heading";
import { FinancialInsightShowcase } from "@/components/financial-insight-showcase";
import { AppScreens } from "@/components/app-screens";

export function ProductShowcaseSection() {
  return (
    <section className="section ink" id="showcase">
      <div className="wrap">
        <SectionHeading eyebrow="INTERACTIVE DEMONSTRATION" title="Investigate a pattern for yourself.">
          Choose an example to see the transactions behind it and how TracePay explains what it noticed.
        </SectionHeading>
        <FinancialInsightShowcase />
        <AppScreens />
      </div>
    </section>
  );
}
