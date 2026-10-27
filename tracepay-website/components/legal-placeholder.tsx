export function LegalPlaceholder({ title, document }: { title: string; document: string }) {
  return (
    <section className="section section-first">
      <div className="wrap">
        <h1 className="h2">{title}</h1>
        <div className="legal-box">
          <span className="tag">Placeholder</span>
          <p className="mt-3 text-muted">
            The approved TracePay {document} will be published here. This placeholder is not a legal document.
          </p>
        </div>
      </div>
    </section>
  );
}
