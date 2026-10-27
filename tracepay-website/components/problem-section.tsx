import { SectionHeading } from "@/components/section-heading";
import { Reveal } from "@/components/reveal";
import { FRAGMENTS } from "@/lib/content";

export function ProblemSection() {
  return (
    <section className="section" id="problem">
      <div className="wrap split" style={{ alignItems: "start" }}>
        <div>
          <SectionHeading title="Not every money leak is obvious.">
            You may know what comes in and what goes out, and still miss the smaller patterns that build up over
            time. They rarely look important on their own.
          </SectionHeading>
          <p className="fine mt-7">Illustrative examples, not claims about any one person’s finances.</p>
        </div>
        <Reveal>
          <div className="frags">
            {FRAGMENTS.map((f) => (
              <div className="frag" key={f.label}>
                <div className="row">
                  <span>{f.label}</span>
                  <span>{f.value}</span>
                </div>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
