import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, List, PieChart, User } from "lucide-react-native";

import { useTabBarScroll } from "../../context/TabBarScrollContext";
import { COLORS } from "../../theme/colors";
import { GradientTabIcon } from "./GradientTabIcon";

type LiquidTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: { navigate: (name: string) => void };
};

const TAB_ITEMS = [
  { key: "index", label: "Home", Icon: Home },
  { key: "budget", label: "Insights", Icon: PieChart },
  { key: "transactions", label: "Transactions", Icon: List },
  { key: "settings", label: "Profile", Icon: User },
] as const;

const BAR_WIDTH = 288;
const BAR_HEIGHT = 64;
const PAD_X = 12;
const INNER_WIDTH = BAR_WIDTH - PAD_X * 2;
const SLOT = INNER_WIDTH / TAB_ITEMS.length;
const BLOB = 44;

const GRADIENT_LIGHT = ["#F651C2", "#7955E7", "#327DFC"] as const;
const GRADIENT_DARK = ["#F651C2", "#A78BFA", "#327DFC"] as const;

export function LiquidTabBar({ state, navigation }: LiquidTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];
  const { tabBarOffset } = useTabBarScroll();

  const visibleIndex = TAB_ITEMS.findIndex(
    (item) => item.key === state.routes[state.index]?.name,
  );
  const activeIndex = visibleIndex >= 0 ? visibleIndex : 0;

  const progress = useSharedValue(activeIndex);

  useEffect(() => {
    progress.value = withSpring(activeIndex, {
      damping: 15,
      stiffness: 140,
      mass: 0.9,
      overshootClamping: false,
    });
  }, [activeIndex, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarOffset.value }],
  }));

  const blobStyle = useAnimatedStyle(() => {
    const x = PAD_X + progress.value * SLOT + (SLOT - BLOB) / 2;
    const dist = Math.abs(progress.value - Math.round(progress.value));
    const scaleX = 1 + dist * 1.35;
    const scaleY = 1 / Math.sqrt(Math.max(scaleX, 0.001));

    return {
      transform: [{ translateX: x }, { scaleX }, { scaleY }],
    };
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0 items-center"
      style={[
        { paddingBottom: Math.max(insets.bottom, 14) },
        containerStyle,
      ]}
    >
      <View
        className="overflow-hidden rounded-full border border-border/50 bg-card/95"
        style={{
          width: BAR_WIDTH,
          height: BAR_HEIGHT,
          shadowColor: "#1A0F3A",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.45 : 0.14,
          shadowRadius: 20,
          elevation: 12,
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: (BAR_HEIGHT - BLOB) / 2,
              left: 0,
              width: BLOB,
              height: BLOB,
              borderRadius: BLOB / 2,
              backgroundColor: isDark
                ? "rgba(167, 139, 250, 0.14)"
                : "rgba(121, 85, 231, 0.1)",
            },
            blobStyle,
          ]}
        />

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            height: BAR_HEIGHT,
            paddingHorizontal: PAD_X,
          }}
        >
          {TAB_ITEMS.map((item) => {
            const routeIndex = state.routes.findIndex(
              (route: { name: string }) => route.name === item.key,
            );
            const focused = routeIndex >= 0 && state.index === routeIndex;

            return (
              <View
                key={item.key}
                style={{
                  width: SLOT,
                  height: BAR_HEIGHT,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Pressable
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                  accessibilityState={focused ? { selected: true } : {}}
                  onPress={() => navigation.navigate(item.key)}
                  style={{
                    width: BLOB,
                    height: BLOB,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: BLOB / 2,
                  }}
                >
                  <GradientTabIcon
                    Icon={item.Icon}
                    focused={focused}
                    inactiveColor={palette.mutedForeground}
                    colors={isDark ? GRADIENT_DARK : GRADIENT_LIGHT}
                    strokeWidth={focused ? 2.4 : 2}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}
