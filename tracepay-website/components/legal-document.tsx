import { Fragment } from "react";
import type { LegalSection } from "@/lib/privacy";

/** Shows each [CONFIRM: ...] marker highlighted, so nothing unfinished can pass for final text. */
function Text({ value }: { value: string }) {
  const parts = value.split(/(\[CONFIRM:[^\]]*\])/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("[CONFIRM:") ? (
          <mark key={index} className="confirm">{part}</mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

type Props = {
  title: string;
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
  status: "draft" | "published";
};

export function LegalDocument({ title, updated, intro, sections, status }: Props) {
  return (
    <section className="section section-first">
      <div className="wrap legal-doc">
        <h1 className="h2">{title}</h1>
        <p className="fine mt-4">
          Last updated: <Text value={updated} />
        </p>

        {status === "draft" ? (
          <div className="legal-box mt-6" role="note">
            <span className="tag">Draft</span>
            <p className="mt-3 text-muted">
              This is a draft and has not been reviewed by a lawyer. The highlighted items still need to be
              confirmed before it is published.
            </p>
          </div>
        ) : null}

        <p className="lead mt-8">
          <Text value={intro} />
        </p>

        <nav className="legal-toc" aria-label="On this page">
          {sections.map((section, index) => (
            <a key={section.id} href={`#${section.id}`}>{index + 1}. {section.title}</a>
          ))}
        </nav>

        {sections.map((section, index) => (
          <div key={section.id} id={section.id} className="legal-section">
            <h2 className="h3">{index + 1}. {section.title}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}><Text value={paragraph} /></p>
            ))}
            {section.items ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}><Text value={item} /></li>
                ))}
              </ul>
            ) : null}
            {section.after ? <p><Text value={section.after} /></p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
