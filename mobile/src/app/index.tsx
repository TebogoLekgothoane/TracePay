import { ActivityIndicator, View } from "react-native";

/** Boot splash — NavigationGuard in _layout.tsx routes by auth + onboarding state. */
export default function IndexScreen() {
  return (
    <View className="screen items-center justify-center">
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}
