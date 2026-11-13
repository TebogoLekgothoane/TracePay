import type { ComponentProps } from "react";
import Animated from "react-native-reanimated";

type TabFlatListProps<ItemT> = ComponentProps<
  typeof Animated.FlatList<ItemT>
>;

export function TabFlatList<ItemT>(props: TabFlatListProps<ItemT>) {
  return <Animated.FlatList {...props} />;
}
