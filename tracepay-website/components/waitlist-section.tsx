import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/section-heading";
import { WaitlistForm } from "@/components/waitlist-form";

export function WaitlistSection() {
  return (
    <section className="section" id="waitlist">
      <div className="wrap split" style={{ alignItems: "start" }}>
        <SectionHeading title="Be first to try TracePay.">
          Join the waitlist for early access. Tell us which plan you’re interested in so we build the right
          thing first. Business and Accountant plans are still being built.
        </SectionHeading>
        <Reveal delay={0.1}>
          <WaitlistForm />
        </Reveal>
      </div>
    </section>
  );
}
