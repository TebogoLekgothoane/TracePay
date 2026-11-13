/**
 * Which account does an extracted statement belong to?
 *
 * Identity comes from what the statement itself says (bank and the last four
 * digits of the account number) compared with the account the user chose. It
 * is never inferred from the file name. When the statement cannot settle the
 * question the user is asked rather than a guess being saved.
 */

import { normalizeStatementBankKey } from "./statement-bank";

export type StatementAccountCandidate = {
  id: string;
  name: string;
  institution: string | null;
  lastFourDigits: string | null;
};

export type StatementAccountVerdict =
  /** Statement and account agree on the last four digits. */
  | { status: "match" }
  /** The account had no last four yet; remember the statement's. */
  | { status: "adopt_last4"; lastFour: string }
  /** Neither side has digits, so the account choice rests on the user alone. */
  | { status: "unconfirmed" }
  /** The statement shows different digits than the chosen account. */
  | { status: "mismatch"; statementLastFour: string; accountLastFour: string }
  /** The digits belong to a different account the user already has. */
  | { status: "belongs_to_other_account"; accountId: string; accountName: string };

export const ACCOUNT_UNCONFIRMED_NOTE =
  "This statement does not show an account number, so TracePay is relying on the account you chose. Check it is the right one.";

export function accountMismatchMessage(
  accountLastFour: string,
  statementLastFour: string,
): string {
  return `This statement is for an account ending ${statementLastFour}, but you chose the account ending ${accountLastFour}. Choose the matching account, or add this as a new account, then upload it again.`;
}

export function belongsToOtherAccountMessage(
  statementLastFour: string,
  otherAccountName: string,
): string {
  return `This statement is for the account ending ${statementLastFour}, which you already have as "${otherAccountName}". Choose that account and upload it again so its statements stay together.`;
}

function normaliseLastFour(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function assessStatementAccount(
  chosen: StatementAccountCandidate,
  siblings: ReadonlyArray<StatementAccountCandidate>,
  statementLastFour: string | null | undefined,
): StatementAccountVerdict {
  const fromStatement = normaliseLastFour(statementLastFour);
  const known = normaliseLastFour(chosen.lastFourDigits);

  if (fromStatement === null) {
    return { status: "unconfirmed" };
  }
  if (known !== null) {
    return known === fromStatement
      ? { status: "match" }
      : {
          status: "mismatch",
          statementLastFour: fromStatement,
          accountLastFour: known,
        };
  }

  // The chosen account has no digits yet. If another account at the same bank
  // already carries these digits, this statement belongs there.
  const chosenBank = normalizeStatementBankKey(chosen.institution);
  const owner = siblings.find(
    (account) =>
      account.id !== chosen.id &&
      normaliseLastFour(account.lastFourDigits) === fromStatement &&
      (chosenBank === null ||
        normalizeStatementBankKey(account.institution) === chosenBank),
  );
  if (owner) {
    return {
      status: "belongs_to_other_account",
      accountId: owner.id,
      accountName: owner.name,
    };
  }
  return { status: "adopt_last4", lastFour: fromStatement };
}
