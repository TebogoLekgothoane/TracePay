import Link from "next/link";
import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { CAN, CANT, PRINCIPLES } from "@/lib/content";

export function SecuritySection({ as = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section className="section" id="security">
      <div className="wrap">
        <SectionHeading as={as} title="Your financial data deserves care.">
          These are the principles that guide how TracePay is built. Detailed security and data-handling
          information will be set out in our privacy policy.
        </SectionHeading>
        <div className="sec-grid">
          <div className="principles">
            {PRINCIPLES.map((p) => (
              <div key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </div>
            ))}
          </div>
          <Reveal className="limits">
            <h3>What TracePay can and can’t determine</h3>
            <div className="k">IT CAN</div>
            <ul>{CAN.map((t) => <li key={t}>{t}</li>)}</ul>
            <div className="k">IT CAN’T</div>
            <ul>{CANT.map((t) => <li key={t}>{t}</li>)}</ul>
            <div className="links">
              <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link>
              <Link href="/terms" className="underline underline-offset-4">Terms of service</Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
