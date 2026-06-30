import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AppText } from "@/components/Typography";

export function AuthErrorBanner({ message }: { message: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 dark:border-red-900/50 dark:bg-red-950/40">
      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
      <AppText variant="bodySm" className="flex-1 text-red-700 dark:text-red-300">
        {message}
      </AppText>
    </View>
  );
}
