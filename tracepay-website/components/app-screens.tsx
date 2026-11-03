"use client";

import { motion, useReducedMotion } from "framer-motion";

type PhoneFrameProps = {
  children: React.ReactNode;
  className?: string;
  label: string;
  delay: number;
};

function PhoneFrame({ children, className = "", label, delay }: PhoneFrameProps) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      className={`phone ${className}`}
      role="img"
      aria-label={label}
      initial={{ opacity: 0, y: reduce ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: reduce ? 0 : 0.55, delay: reduce ? 0 : delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function AppScreens() {
  return (
    <div>
      <div className="phones-row" role="group" aria-label="Illustrative TracePay app screens">
        <PhoneFrame delay={0} label="Illustrative leaks screen with a monthly total and a list of potential leaks">
          <div className="pill" />
          <div className="ph-h">Leaks</div>
          <div className="ph-s">We found payments worth a closer look.</div>
          <div className="ph-card ph-hero">
            <div className="ph-m">Potential leaks to review</div>
            <div className="ph-big">R1,820.40</div>
            <span className="ph-tag">↑ 18% vs last month</span>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Possible duplicate payment</b><span className="ph-tag">New</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R420</div>
            <div className="ph-m">Two identical payments to one merchant on the same day</div>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Recurring subscription</b><span className="ph-tag">New</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R199 / month</div>
            <div className="ph-m">Worth reviewing: do you still use it?</div>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Higher than usual bank fee</b><span className="ph-tag">Unchanged</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R145</div>
          </div>
        </PhoneFrame>

        <PhoneFrame className="phone-offset" delay={0.1} label="Illustrative upcoming charges screen">
          <div className="pill" />
          <div className="ph-h">Upcoming charges</div>
          <div className="ph-s">Your next subscription payments</div>
          <div className="ph-card" style={{ padding: "2px 12px" }}>
            <div className="ph-item"><span className="ph-mono">V</span><div className="t"><b>Video streaming</b><span>01 Nov · In 11 days</span></div><b>R99.00</b></div>
            <div className="ph-item"><span className="ph-mono">M</span><div className="t"><b>Music streaming</b><span>08 Nov · In 18 days</span></div><b>R69.00</b></div>
            <div className="ph-item"><span className="ph-mono">M</span><div className="t"><b>Music premium</b><span>12 Nov · In 22 days</span></div><b>R72.00</b></div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, margin: "14px 0 8px" }}>For you</div>
          <div className="ph-card">
            <b style={{ fontSize: 14 }}>You’re paying for 2 music apps</b>
            <div className="ph-m" style={{ margin: "4px 0 10px" }}>Consider cancelling one?</div>
            <div className="ph-row" style={{ justifyContent: "flex-start" }}>
              <span className="ph-tag" style={{ padding: "5px 12px" }}>Compare &amp; decide</span>
              <span className="ph-tag" style={{ padding: "5px 12px" }}>Ignore</span>
            </div>
          </div>
        </PhoneFrame>

        <PhoneFrame delay={0.2} label="Illustrative spending patterns screen">
          <div className="pill" />
          <div className="ph-h">Your Spending Patterns</div>
          <div className="ph-s">Clear signals from your recent transactions.</div>
          <div className="ph-card">
            <div className="ph-m">Today’s spending</div>
            <div className="ph-big">R1 529,99</div>
            <div className="ph-m" style={{ marginBottom: 8 }}>9 payments recorded</div>
            <div className="ph-row" style={{ borderTop: "1px solid var(--pl)", paddingTop: 8 }}><span className="ph-m">Alcohol</span><b>R689,99</b></div>
            <div className="ph-row"><span className="ph-m">Fast food</span><b>R320,00</b></div>
            <div className="ph-row"><span className="ph-m">Ride hailing</span><b>R310,00</b></div>
          </div>
          <div className="ph-card">
            <b style={{ fontSize: 13 }}>Small purchases are adding up</b>
            <div className="ph-m" style={{ marginTop: 3 }}>You made 18 purchases under R50 in the past week, totalling R660,00.</div>
          </div>
          <div className="ph-card">
            <b style={{ fontSize: 13 }}>Small purchase appears often</b>
            <div className="ph-m" style={{ marginTop: 3 }}>You paid this merchant 18 times in the past week.</div>
          </div>
        </PhoneFrame>
      </div>
      <p className="fine mt-3">Illustrative app screens with sample data.</p>
    </div>
  );
}
