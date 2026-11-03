export type CashOption = {
  id: string;
  name: string;
  logoDomain?: string;
  /** What it costs, as the source states it. Fees depend on the account, so no single figure. */
  cost: string;
  costNote: string;
  note: string;
  source: string;
};

export const CASH_COMPARISON_AS_OF = "Indicative prices, 2024 to 2026";

export const CASH_COMPARISON_DISCLAIMER =
  "Cash fees depend on your bank and account type, and these figures come from news reports and " +
  "bank pages from different years. Use them to compare the options, then check your own bank's " +
  "pricing guide for the exact fee on your account. Your bank sets the daily limit.";

/** Ways to get cash, from usually cheapest to usually dearest. No option is marked as the one to pick. */
export const CASH_OPTIONS: readonly CashOption[] = [
  {
    id: "cash-back-capitec",
    name: "Cash back at the till (Capitec)",
    logoDomain: "capitecbank.co.za",
    cost: "R2.00",
    costNote: "per withdrawal",
    note: "Pick n Pay, Shoprite, Checkers and Boxer tills.",
    source: "Capitec website, undated",
  },
  {
    id: "cash-back-fnb",
    name: "Cash back at the till (FNB)",
    logoDomain: "fnb.co.za",
    cost: "Low, varies by account",
    costNote: "R0.90 on one account (older report)",
    note: "Participating Checkers, Pick n Pay, Shoprite and selected Spar stores.",
    source: "BusinessTech, older report",
  },
  {
    id: "own-atm",
    name: "Your own bank's ATM",
    cost: "About R2.65 to R2.80",
    costNote: "per R100 on some entry accounts",
    note: "Many accounts charge a small per-R100 fee here. Some charge nothing.",
    source: "BusinessTech, 2024",
  },
  {
    id: "other-atm-capitec",
    name: "Another bank's ATM (Capitec card)",
    logoDomain: "capitecbank.co.za",
    cost: "About R10",
    costNote: "per R1,000",
    note: "Capitec said it would keep its 2025 prices for 2026.",
    source: "BusinessTech, 2026",
  },
  {
    id: "other-atm-fnb",
    name: "Another bank's ATM (FNB card)",
    logoDomain: "fnb.co.za",
    cost: "R12 + R2.30",
    costNote: "per R100",
    note: "A flat fee plus a charge on every R100.",
    source: "BusinessTech, 2024",
  },
  {
    id: "other-atm-nedbank",
    name: "Another bank's ATM (Nedbank card)",
    logoDomain: "nedbank.co.za",
    cost: "R12 + R2.50",
    costNote: "per R100 or part of it",
    note: "A flat fee plus a charge on every R100 or part of R100.",
    source: "BusinessTech, 2024",
  },
];
