import { Text, View } from "react-native";

export function SyntheticSourceNote({ scenarioName }: { scenarioName: string }) {
  return (
    <View className="mt-5 rounded-3xl bg-card px-4 py-4">
      <Text className="text-[15px] font-semibold text-foreground">
        Synthetic scenario
      </Text>
      <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
        {scenarioName}. These results are not your imported transactions.
      </Text>
    </View>
  );
}
