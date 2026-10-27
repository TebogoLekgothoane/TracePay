import { ButtonLink } from "@/components/button-link";
import { Reveal } from "@/components/reveal";
import { SITE } from "@/lib/content";

export function FinalCta() {
  return (
    <section className="section ink">
      <div className="wrap">
        <Reveal>
          <h2 className="h2" style={{ maxWidth: "14em" }}>
            Find out what your transactions are telling you.
          </h2>
          <p className="lead mt-5">Discover a more informed way to examine your financial life.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/#showcase">Explore TracePay</ButtonLink>
            <ButtonLink href={`mailto:${SITE.email}`} variant="ghost">Get in touch</ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
