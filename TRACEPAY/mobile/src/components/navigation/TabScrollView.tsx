import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";

type TabScrollViewProps = ComponentProps<typeof Animated.ScrollView>;

export function TabScrollView(props: TabScrollViewProps) {
  return <Animated.ScrollView {...props} />;
}
