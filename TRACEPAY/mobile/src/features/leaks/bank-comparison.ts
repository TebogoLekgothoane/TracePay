/**
 * Indicative entry-level transactional account pricing for South African banks.
 * Display-only: TracePay does not recommend any of these accounts. Published
 * figures vary between sources, so the screen tells people to confirm with the bank.
 */

export type BankAccountListing = {
  id: string;
  bank: string;
  account: string;
  logoDomain: string;
  mark: string;
  monthlyFee: string;
  pricing: string;
  debitOrders: string;
  channel: string;
};

export const BANK_COMPARISON_AS_OF = "Oct 2026";

export const BANK_COMPARISON_DISCLAIMER =
  "Indicative fees for entry-level accounts, collected from public pricing pages. Fees change and per-transaction costs (ATM, cash deposits, debit orders) can outweigh the monthly fee. Confirm on the bank's official fee schedule. This is not financial advice.";

/** The user's current monthly account fee, from the fees leak breakdown. */
export const CURRENT_MONTHLY_FEE = "R165.00";

export const BANK_ACCOUNT_LISTINGS: BankAccountListing[] = [
  {
    id: "tymebank",
    bank: "TymeBank",
    account: "EveryDay account",
    logoDomain: "tymebank.co.za",
    mark: "T",
    monthlyFee: "R0.00",
    pricing: "Pay as you use",
    debitOrders: "Per transaction",
    channel: "App + kiosks",
  },
  {
    id: "bankzero",
    bank: "Bank Zero",
    account: "Basic banking",
    logoDomain: "bankzero.co.za",
    mark: "Z",
    monthlyFee: "R0.00",
    pricing: "Pay as you use",
    debitOrders: "Per transaction",
    channel: "App only",
  },
  {
    id: "fnb",
    bank: "FNB",
    account: "Easy Zero",
    logoDomain: "fnb.co.za",
    mark: "F",
    monthlyFee: "R0.00",
    pricing: "Pay as you use",
    debitOrders: "Per transaction",
    channel: "App + branch",
  },
  {
    id: "standardbank",
    bank: "Standard Bank",
    account: "MyMo",
    logoDomain: "standardbank.co.za",
    mark: "S",
    monthlyFee: "R6.50",
    pricing: "Pay as you use",
    debitOrders: "Per transaction",
    channel: "App + branch",
  },
  {
    id: "capitec",
    bank: "Capitec",
    account: "Global One",
    logoDomain: "capitecbank.co.za",
    mark: "C",
    monthlyFee: "R7.50",
    pricing: "Fixed fee + per transaction",
    debitOrders: "Per transaction",
    channel: "App + branch",
  },
  {
    id: "nedbank",
    bank: "Nedbank",
    account: "MiGoals",
    logoDomain: "nedbank.co.za",
    mark: "N",
    monthlyFee: "R8.00",
    pricing: "Pay as you use",
    debitOrders: "~R12 each",
    channel: "App + branch",
  },
  {
    id: "nedbank-plus",
    bank: "Nedbank",
    account: "MiGoals Plus",
    logoDomain: "nedbank.co.za",
    mark: "N",
    monthlyFee: "R99.00",
    pricing: "Bundle",
    debitOrders: "Included in bundle",
    channel: "App + branch",
  },
];
