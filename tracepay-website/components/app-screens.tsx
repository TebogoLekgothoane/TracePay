export function AppScreens() {
  return (
    <div>
      <div className="phones-row" role="group" aria-label="Illustrative TracePay app screens">
        <div className="phone" role="img" aria-label="Illustrative leaks screen with a monthly total and a list of potential leaks">
          <div className="pill" />
          <div className="ph-h">Leaks</div>
          <div className="ph-s">We found areas where you’re losing money.</div>
          <div className="ph-card ph-hero">
            <div className="ph-m">Total leaked this month</div>
            <div className="ph-big">R1,820.40</div>
            <span className="ph-tag">↑ 18% vs last month</span>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Possible duplicate payment</b><span className="ph-tag">New</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R420</div>
            <div className="ph-m">Two similar payments to one merchant</div>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Unused subscription</b><span className="ph-tag">New</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R199 / month</div>
            <div className="ph-m">Not used in 3+ months</div>
          </div>
          <div className="ph-card">
            <div className="ph-row"><b>Higher than usual bank fee</b><span className="ph-tag">Unchanged</span></div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>R145</div>
          </div>
        </div>

        <div className="phone phone-offset" role="img" aria-label="Illustrative upcoming charges screen">
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
        </div>

        <div className="phone" role="img" aria-label="Illustrative spending patterns screen">
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
        </div>
      </div>
      <p className="fine mt-3">Illustrative app screens with sample data.</p>
    </div>
  );
}
