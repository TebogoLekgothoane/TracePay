"use client";

import { motion, useReducedMotion } from "framer-motion";
import { SectionHeading } from "@/components/section-heading";
import { BANKS, STAGES } from "@/lib/content";

export function HowItWorks({ as = "h2" }: { as?: "h1" | "h2" }) {
  const reduce = useReducedMotion();
  const viewport = { once: true, amount: 0.35 } as const;
  const transition = { duration: reduce ? 0 : 1.6, ease: [0.65, 0, 0.25, 1] as const };

  return (
    <section className="section" id="how">
      <div className="wrap">
        <SectionHeading as={as} title="From transactions to understanding." />

        <div className="flow">
          <div className="flow-rail" aria-hidden="true" />
          <motion.div
            className="flow-fill flow-fill-h"
            aria-hidden="true"
            initial={{ scaleX: reduce ? 1 : 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={viewport}
            transition={transition}
          />
          <motion.div
            className="flow-fill flow-fill-v"
            aria-hidden="true"
            initial={{ scaleY: reduce ? 1 : 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={viewport}
            transition={transition}
          />
          {STAGES.map((stage, i) => (
            <div className="stage" key={stage.title}>
              <span className="n" aria-hidden="true">{i + 1}</span>
              <h3 className="h3">{stage.title}</h3>
              <p>{stage.text}</p>
            </div>
          ))}
        </div>

        <p className="mt-14 text-sm text-muted">Statement import currently supports</p>
        <ul className="banks" aria-label="Supported banks">
          {BANKS.map((bank) => (
            <li key={bank} className="list-none">{bank}</li>
          ))}
        </ul>
        <p className="fine mt-5">
          Bank names describe which statements TracePay can read. They do not imply a partnership with any bank.
        </p>
      </div>
    </section>
  );
}
