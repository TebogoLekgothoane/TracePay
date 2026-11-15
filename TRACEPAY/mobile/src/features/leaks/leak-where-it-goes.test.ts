import {
  buildWhereItGoes,
  rowBelongsToWhereBucket,
} from "./leak-where-it-goes";
import type { TransactionRow } from "../transactions/transaction.types";

function row(
  description: string,
  amount: string,
  category = "Bank fees",
): TransactionRow {
  return {
    id: `${description}-${amount}`,
    date: "2026-10-15",
    description,
    amount,
    type: "debit",
    balance: null,
    currency: "ZAR",
    account_id: "account",
    statement_id: null,
    source: "statement",
    transaction_class: "bank_fee",
    is_duplicate: false,
    category_id: null,
    category_source: "automatic",
    merchantName: null,
    categories: { name: category },
    account: null,
    occurredAt: null,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const range = { startKey: "2026-10-01", endKey: "2026-10-31" };

const monthly = row("MONTHLY ACCOUNT FEE", "165");
const service = row("IMMEDIATE PAYMENT FEE", "25");
const serviceCharge = row("SERVICE FEE PAYMENT", "48.40");
const atm = row("OTHER BANK ATM FEE", "85");

assert(rowBelongsToWhereBucket("fees", "monthly", monthly), "monthly stays monthly");
assert(!rowBelongsToWhereBucket("fees", "service", monthly), "monthly is not service");
assert(rowBelongsToWhereBucket("fees", "service", service), "payment fee is service");
assert(rowBelongsToWhereBucket("fees", "service", serviceCharge), "service fee is service");
assert(!rowBelongsToWhereBucket("fees", "monthly", service), "service is not monthly");
assert(rowBelongsToWhereBucket("fees", "atm", atm), "atm fee");

const monthlyService = row("SERVICE FEE MONTHLY", "199");
assert(
  rowBelongsToWhereBucket("fees", "monthly", monthlyService),
  "SERVICE FEE MONTHLY is the package fee, not a service fee",
);
assert(
  !rowBelongsToWhereBucket("fees", "service", monthlyService),
  "package fee must not also count as service",
);

const rows = buildWhereItGoes(
  "fees",
  [monthly, service, serviceCharge, atm, monthlyService],
  range,
);
assert(rows.length === 3, `three buckets with spend (got ${rows.length})`);
const byId = Object.fromEntries(rows.map((entry) => [entry.id, entry.amountValue]));
assert(byId.monthly === 364, `monthly 165+199 (got ${byId.monthly})`);
assert(byId.service === 73.4, `service 25+48.40 (got ${byId.service})`);
assert(byId.atm === 85, `atm 85 (got ${byId.atm})`);

console.log("leak-where-it-goes tests passed");
