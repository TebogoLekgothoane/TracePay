import { useLocalSearchParams } from "expo-router";

import { AccountStatementSetupFlow } from "../../../src/components/accounts/AccountStatementSetupFlow";
import { isSaInstitution } from "../../../src/features/accounts/account.constants";
import {
  LINKED_ACCOUNTS_HREF,
  parseAccountId,
  parseReturnTo,
} from "../../../src/features/accounts/account.navigation";

export default function AddAccountScreen() {
  const params = useLocalSearchParams<{
    institution?: string;
    returnTo?: string;
    accountId?: string;
  }>();
  const institution =
    typeof params.institution === "string" && isSaInstitution(params.institution)
      ? params.institution
      : null;
  const existingAccountId = parseAccountId(params.accountId);

  return (
    <AccountStatementSetupFlow
      existingAccountId={existingAccountId}
      initialInstitution={institution}
      mode="app"
      returnTo={
        parseReturnTo(params.returnTo) ??
        (existingAccountId ? `/settings/accounts/${existingAccountId}` : LINKED_ACCOUNTS_HREF)
      }
    />
  );
}
