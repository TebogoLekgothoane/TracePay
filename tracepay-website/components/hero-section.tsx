"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ButtonLink } from "@/components/button-link";
import { TransactionPreview } from "@/components/transaction-preview";

export function HeroSection() {
  const reduce = useReducedMotion();
  const enter = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] as const },
        };

  return (
    <section className="section section-first">
      <div className="wrap split" style={{ alignItems: "start" }}>
        <div>
          <motion.p className="eyebrow" {...enter(0)}>
            FINANCIAL INTELLIGENCE, REIMAGINED
          </motion.p>
          <motion.h1 className="h1" {...enter(0.08)}>
            Your money leaves clues. We find them.
          </motion.h1>
          <motion.p className="lead" style={{ marginTop: 28 }} {...enter(0.18)}>
            Your transactions tell a story. TracePay helps uncover recurring charges, hidden fees and spending
            patterns that deserve a closer look.
          </motion.p>
          <motion.div className="mt-10 flex flex-wrap gap-3" {...enter(0.28)}>
            <ButtonLink href="/#showcase">Explore TracePay</ButtonLink>
            <ButtonLink href="/how-it-works" variant="ghost">How it works</ButtonLink>
          </motion.div>
        </div>
        <motion.div {...enter(0.36)}>
          <TransactionPreview />
        </motion.div>
      </div>
    </section>
  );
}
