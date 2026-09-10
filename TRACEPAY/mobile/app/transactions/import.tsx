import { useLocalSearchParams } from "expo-router";

import { StatementImportFlow } from "../../src/components/accounts/StatementImportFlow";
import { parseReturnTo } from "../../src/features/accounts/account.navigation";

export default function TransactionImportScreen() {
  const params = useLocalSearchParams<{
    institution?: string;
    returnTo?: string;
  }>();

  return (
    <StatementImportFlow
      initialBank={
        typeof params.institution === "string" ? params.institution : null
      }
      mode="app"
      returnTo={parseReturnTo(params.returnTo)}
    />
  );
}
