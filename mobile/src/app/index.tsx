import { ActivityIndicator, View, StyleSheet } from "react-native";

/** Boot splash — NavigationGuard in _layout.tsx routes by auth + onboarding state. */
export default function IndexScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#7C3AED" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F6FB" },
});
