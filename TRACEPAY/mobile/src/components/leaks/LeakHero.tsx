import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import { Image, Text, View } from "react-native";

import { TRACEPAY } from "../../theme/colors";

const LEAK_TAP = require("../../../assets/images/illustrations/leak tap.png");

type Props = {
  label: string;
  amount: string;
  caption: string;
};

/** The saving at the top of a fix page: the home summary card's deep gradient, not a tint. */
export function LeakHero({ label, amount, caption }: Props) {
  const { colorScheme } = useColorScheme();
  const trace = TRACEPAY[colorScheme === "dark" ? "dark" : "light"];

  return (
    <LinearGradient
      colors={[...trace.summaryGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        marginTop: 20,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        borderRadius: 24,
        paddingHorizontal: 20,
        paddingVertical: 18,
        overflow: "hidden",
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, color: trace.heroMuted }}>{label}</Text>
        <Text
          style={{
            marginTop: 4,
            fontSize: 32,
            fontWeight: "700",
            letterSpacing: -0.6,
            color: trace.heroForeground,
          }}
        >
          {amount}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: trace.heroMuted }}>{caption}</Text>
      </View>
      <Image
        source={LEAK_TAP}
        accessibilityIgnoresInvertColors
        accessible={false}
        resizeMode="contain"
        style={{ width: 64, height: 88 }}
      />
    </LinearGradient>
  );
}
