import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";

const logoSource = require("@/assets/images/tracepay-logo.png");

type TracePayLogoProps = {
  size?: number;
  showWordmark?: boolean;
  layout?: "row" | "column";
  style?: ViewStyle;
};

export function TracePayLogo({
  size = 34,
  showWordmark = true,
  layout = "row",
  style,
}: TracePayLogoProps) {
  const isColumn = layout === "column";

  return (
    <View
      style={[
        styles.root,
        isColumn ? styles.column : styles.row,
        style,
      ]}
    >
      <Image
        source={logoSource}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="TracePay logo"
      />
      {showWordmark ? (
        <Text style={[styles.wordmark, isColumn && styles.wordmarkColumn]}>
          TracePay
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  column: {
    flexDirection: "column",
    gap: 12,
  },
  wordmark: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: "#111827",
  },
  wordmarkColumn: {
    fontSize: 28,
  },
});
