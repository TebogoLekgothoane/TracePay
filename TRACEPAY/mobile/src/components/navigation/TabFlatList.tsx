import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";

import { useTabBarScroll } from "../../context/TabBarScrollContext";

type TabFlatListProps<ItemT> = ComponentProps<
  typeof Animated.FlatList<ItemT>
>;

export function TabFlatList<ItemT>(props: TabFlatListProps<ItemT>) {
  const { onScroll } = useTabBarScroll();

  return (
    <Animated.FlatList
      {...props}
      onScroll={onScroll}
      scrollEventThrottle={16}
    />
  );
}
