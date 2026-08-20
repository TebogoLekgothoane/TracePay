import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

const TAB_BAR_HIDE_OFFSET = 120;
const SCROLL_THRESHOLD = 4;

type TabBarScrollContextValue = {
  tabBarOffset: SharedValue<number>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
};

const TabBarScrollContext = createContext<TabBarScrollContextValue | null>(
  null,
);

export function TabBarScrollProvider({ children }: PropsWithChildren) {
  const scrollY = useSharedValue(0);
  const tabBarOffset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const currentY = event.contentOffset.y;
      const delta = currentY - scrollY.value;

      if (currentY <= 8) {
        tabBarOffset.value = withSpring(0, {
          damping: 22,
          stiffness: 220,
        });
      } else if (delta > SCROLL_THRESHOLD) {
        tabBarOffset.value = withSpring(TAB_BAR_HIDE_OFFSET, {
          damping: 22,
          stiffness: 220,
        });
      } else if (delta < -SCROLL_THRESHOLD) {
        tabBarOffset.value = withSpring(0, {
          damping: 22,
          stiffness: 220,
        });
      }

      scrollY.value = currentY;
    },
  });

  const value = useMemo(
    () => ({
      tabBarOffset,
      onScroll,
    }),
    [onScroll, tabBarOffset],
  );

  return (
    <TabBarScrollContext.Provider value={value}>
      {children}
    </TabBarScrollContext.Provider>
  );
}

export function useTabBarScroll() {
  const context = useContext(TabBarScrollContext);

  if (!context) {
    throw new Error("useTabBarScroll must be used within TabBarScrollProvider");
  }

  return context;
}
