"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HERO_INSIGHTS, LEDGER, type LedgerRow } from "@/lib/content";

const EASE = [0.65, 0, 0.25, 1] as const;

function Row({ row, continued = false }: { row: LedgerRow; continued?: boolean }) {
  return (
    <span className={continued ? "l-row l-row-cont" : "l-row"}>
      <span>{row.date}</span>
      <span>
        <b>{row.merchant}</b>
        {row.chip ? (
          <span className="chip-wrap">
            <span className="chip">{row.chip}</span>
          </span>
        ) : null}
      </span>
      <span>{row.amount}</span>
    </span>
  );
}

export function TransactionPreview() {
  const reduce = useReducedMotion();
  const ledgerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [current, setCurrent] = useState(0);
  const [box, setBox] = useState<{ y: number; h: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [userDriven, setUserDriven] = useState(false);

  const measure = useCallback(() => {
    const el = itemRefs.current[current];
    if (el) setBox({ y: el.offsetTop, h: el.offsetHeight });
  }, [current]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const node = ledgerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (reduce || paused || userDriven) return;
    const id = window.setInterval(() => setCurrent((c) => (c + 1) % HERO_INSIGHTS.length), 4200);
    return () => window.clearInterval(id);
  }, [reduce, paused, userDriven]);

  const insight = HERO_INSIGHTS[current] ?? HERO_INSIGHTS[0];

  return (
    <div>
      <div
        ref={ledgerRef}
        className="ledger"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="ledger-head">
          <span>October statement</span>
          <span>Select a row to investigate</span>
        </div>
        <motion.div
          className="scan"
          aria-hidden="true"
          initial={false}
          animate={box ? { y: box.y, height: box.h, opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
        />
        {LEDGER.map((entry, index) => {
          if (entry.insight === undefined) {
            const row = entry.rows[0];
            return row ? (
              <div className="l-row" key={index}>
                <span>{row.date}</span>
                <b>{row.merchant}</b>
                <span>{row.amount}</span>
              </div>
            ) : null;
          }
          const k = entry.insight;
          return (
            <button
              key={index}
              type="button"
              className="item"
              ref={(el) => {
                itemRefs.current[k] = el;
              }}
              aria-pressed={current === k}
              onClick={() => {
                setUserDriven(true);
                setCurrent(k);
              }}
            >
              {entry.rows.map((row, i) => (
                <Row key={i} row={row} continued={i > 0} />
              ))}
            </button>
          );
        })}
      </div>

      <div className="insight" aria-live={userDriven ? "polite" : "off"}>
        <AnimatePresence mode="wait" initial={false}>
          {insight ? (
            <motion.div
              key={current}
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.3 }}
            >
              <div className="kicker">{insight.kicker}</div>
              <h3>{insight.title}</h3>
              <p>{insight.body}</p>
              <p className="rev">{insight.review}</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <p className="fine" style={{ marginTop: 14 }}>
        Illustrative interface with sample data. Not live financial data or actual TracePay results.
      </p>
    </div>
  );
}
