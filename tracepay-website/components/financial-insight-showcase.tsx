"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SHOWCASE } from "@/lib/content";

export function FinancialInsightShowcase() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const item = SHOWCASE[active] ?? SHOWCASE[0];

  function select(next: number, focus = false) {
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SHOWCASE.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next !== null) {
      event.preventDefault();
      select(next, true);
    }
  }

  if (!item) return null;

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Example insights">
        {SHOWCASE.map((s, i) => (
          <button
            key={s.tab}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={`tab-${i}`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={active === i}
            aria-controls="showcase-panel"
            tabIndex={active === i ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {s.tab}
          </button>
        ))}
      </div>

      <div
        id="showcase-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        tabIndex={0}
        className="sc-panel"
      >
        <div className="sc-tx">
          <div className="cap">TRANSACTIONS · SAMPLE DATA</div>
          {item.transactions.map((t, i) => (
            <div key={`${active}-${i}`} className={t.highlight ? "tx tx-hl" : "tx"}>
              <span>{t.date}</span>
              <b>{t.merchant}</b>
              <span>{t.amount}</span>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            className="sc-ex"
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.3 }}
          >
            <h3>{item.title}</h3>
            <dl>
              <dt>WHAT TRACEPAY NOTICED</dt>
              <dd>{item.noticed}</dd>
              <dt>WHY IT MAY MATTER</dt>
              <dd>{item.matters}</dd>
              <dt>WORTH REVIEWING</dt>
              <dd>{item.review}</dd>
              <dt>WHAT IT CAN’T TELL YOU</dt>
              <dd className="cant">{item.cant}</dd>
            </dl>
          </motion.div>
        </AnimatePresence>
      </div>
      <p className="fine mt-4">
        Demonstration with sample data. These are not real transactions or actual TracePay results.
      </p>
    </div>
  );
}
