/**
 * Mock "leak found" insights for each money-leak category on the home page.
 * These are the charges people rarely spot on their own. Replace with analysis output
 * once the backend returns per-category findings.
 */
export type HiddenLeak = {
  id: string;
  title: string;
  detail: string;
  /** Monthly cost in rand. */
  monthly: number;
  /** Where or since when it shows up in the statements. */
  evidence: string;
};

export const HIDDEN_LEAKS: Record<string, HiddenLeak[]> = {
  fees: [
    {
      id: "fee-on-fee",
      title: "A fee charged because of another fee",
      detail:
        "A R6 insurance debit order bounced by R4, so the bank charged an unpaid-item fee of R42 on top. The failed debit cost seven times the amount it was for.",
      monthly: 42,
      evidence: "Unpaid item fee · 3 times since March",
    },
    {
      id: "premium-tier",
      title: "You are on a premium account you do not benefit from",
      detail:
        "Your R165 tier only pays off with a high monthly balance, which yours never reaches. The standard tier would give you the same features for R69.",
      monthly: 96,
      evidence: "Account fee R165 every month for 14 months",
    },
    {
      id: "till-cashback",
      title: "A fee every time you take cash back at a till",
      detail:
        "Cash withdrawn at a retail till is charged R8.50 a time. You did it 11 times this quarter, usually for amounts under R200.",
      monthly: 31,
      evidence: "11 till withdrawals between July and September",
    },
  ],
  subs: [
    {
      id: "cancelled-still-billing",
      title: "A subscription that kept billing after you cancelled",
      detail:
        "A streaming service you cancelled in January is still charging a second card that the cancellation did not cover. You have paid R693 for a service you cannot open.",
      monthly: 99,
      evidence: "R99 on the 14th, every month since February",
    },
    {
      id: "trial-converted",
      title: "A free trial that quietly became a paid plan",
      detail:
        "A 7-day trial for a fitness app rolled into a R149 monthly plan. There has been no activity on it since the first week.",
      monthly: 149,
      evidence: "First charge 8 days after sign-up",
    },
    {
      id: "price-creep",
      title: "A price that crept up without a notice",
      detail:
        "Your cloud storage went from R29 to R59 to R79 over 14 months. The extra storage you are paying for is 94% empty.",
      monthly: 50,
      evidence: "Three increases, last one in August",
    },
  ],
  debit: [
    {
      id: "unknown-policy",
      title: "A policy you do not remember taking out",
      detail:
        "A R189 monthly debit order is going to an insurance administrator under a different trading name. It has been running for over three years and there is no policy on your profile.",
      monthly: 189,
      evidence: "Debit order since June 2022 · 40 payments",
    },
    {
      id: "auto-escalation",
      title: "A premium that raises itself every year",
      detail:
        "Your funeral cover goes up 10% every January without asking. It is R412 today and, at that rate, will cost almost R1,000 in nine years.",
      monthly: 412,
      evidence: "Increase on 1 January for three years running",
    },
    {
      id: "double-collection",
      title: "The same debit order collected twice",
      detail:
        "A gym debit order of R325 was collected on the 25th and again on the 1st. The second payment looks like a duplicate and has not been refunded.",
      monthly: 325,
      evidence: "Two collections 6 days apart in September",
    },
  ],
  airtime: [
    {
      id: "out-of-bundle",
      title: "Out-of-bundle rates after the bundle ran out",
      detail:
        "Once your data bundle ends you are billed at about R2 a megabyte. That cost you R186 this month, where a 1GB top-up would have been R29.",
      monthly: 157,
      evidence: "Out-of-bundle charges on 9 days in September",
    },
    {
      id: "auto-renew-bundle",
      title: "A bundle that renews itself and mostly goes unused",
      detail:
        "A R99 weekly bundle auto-renews every Friday. Your usage shows you finish about 12% of it before the next one starts.",
      monthly: 396,
      evidence: "R99 every Friday for 9 weeks",
    },
    {
      id: "premium-sms",
      title: "A premium SMS service from a competition entry",
      detail:
        "A R7 per day 'daily tips' subscription was started when you entered an online competition. It has billed your airtime balance quietly ever since.",
      monthly: 210,
      evidence: "R7 daily since 2 April",
    },
  ],
  atm: [
    {
      id: "small-withdrawals",
      title: "Lots of small withdrawals instead of a few larger ones",
      detail:
        "You made 11 withdrawals of R200 and paid R130 in fees. Two withdrawals of R1,100 would have cost R30 for the same cash.",
      monthly: 100,
      evidence: "11 withdrawals of R200 in September",
    },
    {
      id: "balance-enquiries",
      title: "Paying to check your balance",
      detail:
        "Each balance enquiry at an ATM costs R3.50. You checked 17 times this quarter, when the banking app shows it for free.",
      monthly: 20,
      evidence: "17 enquiries between July and September",
    },
    {
      id: "other-bank-atm",
      title: "Using another bank's ATM",
      detail:
        "Withdrawals at ATMs outside your bank carry a surcharge on top of your own fee. Six of your last eight withdrawals were at a competitor's machine.",
      monthly: 82,
      evidence: "6 of 8 withdrawals at other banks' ATMs",
    },
  ],
};

export function listHiddenLeaks(leakId: string): HiddenLeak[] {
  return HIDDEN_LEAKS[leakId] ?? [];
}

export function yearlyCost(leak: HiddenLeak): number {
  return leak.monthly * 12;
}
