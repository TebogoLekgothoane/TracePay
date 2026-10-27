import { Reveal } from "@/components/reveal";

export function AboutSection({ as: Tag = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section className="section" id="about">
      <div className="wrap split">
        <Reveal>
          <Tag className={Tag === "h1" ? "h1" : "h2"}>A clearer picture of your financial life.</Tag>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="lead" style={{ color: "var(--fg)" }}>
            TracePay is a South African financial intelligence startup.
          </p>
          <p className="lead mt-5">
            Most tools tell you how much you spent. TracePay looks at what your transactions reveal: the charge that
            crept up, the payment that appeared twice, the fee you stopped noticing.
          </p>
          <p className="lead mt-5">
            Our mission is to give people financial intelligence that helps them uncover hidden money leaks and
            understand their financial lives.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
