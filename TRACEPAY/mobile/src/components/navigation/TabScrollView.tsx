import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";

import { useTabBarScroll } from "../../context/TabBarScrollContext";

type TabScrollViewProps = ComponentProps<typeof Animated.ScrollView>;

export function TabScrollView(props: TabScrollViewProps) {
  const { onScroll } = useTabBarScroll();

  return (
    <Animated.ScrollView
      {...props}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
}
