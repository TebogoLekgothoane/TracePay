import { useLocalSearchParams } from "expo-router";

import { StatementImportFlow } from "../../src/components/accounts/StatementImportFlow";

export default function TransactionImportScreen() {
  const { institution } = useLocalSearchParams<{ institution?: string }>();
  return <StatementImportFlow mode="app" institution={institution} />;
}
