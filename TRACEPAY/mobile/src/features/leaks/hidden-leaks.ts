/**
 * Mock "leak found" insights for each money-leak category.
 * Only leaks that can be worked out from a bank statement belong here: charges, amounts, dates
 * and how they repeat. Anything that needs outside data (cancellations, free-trial sign-ups,
 * app usage, the bank's product pricing) cannot be detected yet and must not be listed.
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
      id: "price-creep",
      title: "A price that crept up over time",
      detail:
        "A recurring charge went from R29 to R59 to R79 over 14 months. Each step is small, but together the same service now costs almost three times as much.",
      monthly: 50,
      evidence: "Three increases, last one in August",
    },
  ],
  debit: [
    {
      id: "unknown-policy",
      title: "A debit order under a name you may not recognise",
      detail:
        "A R189 monthly debit order goes to a payee whose name does not match any merchant you pay elsewhere. It has been collected every month for over three years, so it is worth checking it is one you chose.",
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
        "Charges for data used after your bundle ran out appear on your statement on 9 days this month and add up to R186. Topping up before the bundle ends avoids them.",
      monthly: 157,
      evidence: "Out-of-bundle charges on 9 days in September",
    },
    {
      id: "auto-renew-bundle",
      title: "A bundle that renews itself every week",
      detail:
        "A R99 bundle is charged every Friday, nine weeks running. If you do not need a fresh bundle that often, switching off auto-renew stops the weekly charge.",
      monthly: 396,
      evidence: "R99 every Friday for 9 weeks",
    },
    {
      id: "premium-sms",
      title: "A small charge that repeats every day",
      detail:
        "A R7 charge for a premium SMS service is taken from your airtime balance every day. Small daily amounts are easy to miss, but this one adds up to about R210 a month.",
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
