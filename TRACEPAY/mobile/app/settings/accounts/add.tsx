import { Redirect, useLocalSearchParams } from "expo-router";

import {
  LINKED_ACCOUNTS_HREF,
  TRANSACTIONS_IMPORT_HREF,
  parseReturnTo,
} from "../../../src/features/accounts/account.navigation";

/** Account creation is now bank + CSV import only. */
export default function AddAccountScreen() {
  const params = useLocalSearchParams<{
    institution?: string;
    returnTo?: string;
  }>();
  const returnTo = parseReturnTo(params.returnTo) ?? LINKED_ACCOUNTS_HREF;
  const institution =
    typeof params.institution === "string" ? params.institution : undefined;

  return (
    <Redirect
      href={{
        pathname: TRANSACTIONS_IMPORT_HREF,
        params: {
          returnTo,
          ...(institution ? { institution } : {}),
        },
      }}
    />
  );
}
