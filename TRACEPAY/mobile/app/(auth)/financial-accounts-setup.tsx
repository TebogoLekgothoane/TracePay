import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { AccountStatementSetupFlow } from "../../src/components/accounts/AccountStatementSetupFlow";
import { useFinancialConsent } from "../../src/features/privacy/consent.preferences";

export default function FinancialAccountsSetupScreen() {
  const { accepted, hydrated } = useFinancialConsent();

  if (!hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!accepted) {
    return <Redirect href="/(auth)/financial-data-consent" />;
  }

  return <AccountStatementSetupFlow mode="onboarding" />;
}
