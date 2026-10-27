import { SectionHeading } from "@/components/section-heading";
import { CATEGORIES } from "@/lib/content";

export function WhatWeDetect({ as = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section className="section" id="detect">
      <div className="wrap">
        <SectionHeading as={as} title="What TracePay can uncover.">
          TracePay points to patterns that are worth reviewing. It doesn’t decide for you whether a payment was a
          mistake. That part stays with you.
        </SectionHeading>

        <div className="uncover">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <article className="cell" key={c.title}>
                <Icon className="ic" aria-hidden="true" />
                <h3 className="h3">{c.title}</h3>
                <p>{c.text}</p>
                <div className="mini" aria-label={`Example: ${c.title}`}>
                  {c.rows.map((r, i) => (
                    <div key={i} className={r.highlight ? "hl" : undefined}>
                      <span>{r.label}</span>
                      <span>{r.value}</span>
                    </div>
                  ))}
                </div>
                <p className="review">
                  <span>Worth reviewing:</span> {c.review}
                </p>
              </article>
            );
          })}
        </div>
        <p className="fine mt-5">Sample data for illustration.</p>
      </div>
    </section>
  );
}
