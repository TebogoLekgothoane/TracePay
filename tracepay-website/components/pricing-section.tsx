import { Check } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { PLANS } from "@/lib/content";

export function PricingSection({ as = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section className="section" id="pricing">
      <div className="wrap">
        <SectionHeading as={as} title="Simple, honest pricing.">
          Pick the plan that fits how you use TracePay. Everything listed is included, with no hidden tiers.
        </SectionHeading>

        <div className="plans">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.name} delay={index * 0.08} className="plan-wrap">
              <article className="plan">
                <h3 className="h3">{plan.name}</h3>
                {plan.badge ? <span className="tag plan-badge">{plan.badge}</span> : null}
                <p className="plan-price">
                  <span>{plan.price}</span>
                  {plan.period}
                </p>
                <p className="plan-tagline">{plan.tagline}</p>
                <p className="plan-incl">Everything included:</p>
                <ul className="plan-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.note ? <p className="plan-note">{plan.note}</p> : null}
                <Link href="/pricing#waitlist" className="btn btn-ghost plan-cta">
                  Join the waitlist
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="fine mt-5">
          All prices in South African rand (ZAR). Business and Accountant plans are coming soon and their pricing may
          change before launch. TracePay highlights potential financial leaks for you to review. It does not guarantee
          savings.
        </p>
      </div>
    </section>
  );
}
