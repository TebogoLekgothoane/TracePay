import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import type { LucideIcon } from "lucide-react-native";
import { View } from "react-native";

type GradientTabIconProps = {
  Icon: LucideIcon;
  focused: boolean;
  inactiveColor: string;
  colors: readonly [string, string, ...string[]];
  size?: number;
  strokeWidth?: number;
};

export function GradientTabIcon({
  Icon,
  focused,
  inactiveColor,
  colors,
  size = 24,
  strokeWidth = 2,
}: GradientTabIconProps) {
  if (!focused) {
    return (
      <Icon color={inactiveColor} size={size} strokeWidth={strokeWidth} />
    );
  }

  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
          }}
        >
          <Icon color="#000000" size={size} strokeWidth={strokeWidth} />
        </View>
      }
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: size, height: size }}
      />
    </MaskedView>
  );
}
