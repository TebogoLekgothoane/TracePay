import { LinearGradient } from "expo-linear-gradient";
import { Droplets, Home, Lightbulb, User } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, withAlpha } from "../../theme/colors";

type TabRoute = {
  key: string;
  name: string;
};

type LiquidTabBarProps = {
  state: {
    index: number;
    routes: TabRoute[];
  };
  emitter: {
    emit: (event: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
  };
  navigateToTab: (routeKey: string) => void;
};

const TAB_ITEMS = [
  { key: "index", label: "Home", Icon: Home, labelWidth: 48 },
  { key: "leaks", label: "Leaks", Icon: Droplets, labelWidth: 48 },
  { key: "budget", label: "Insights", Icon: Lightbulb, labelWidth: 68 },
  { key: "settings", label: "Profile", Icon: User, labelWidth: 56 },
] as const;

const PILL_HEIGHT = 48;
const ICON_SLOT = 28;
const PILL_PAD_X = 12;
const LABEL_GAP = 8;
const SPRING = { damping: 18, stiffness: 210, mass: 1 } as const;

type DiscreteTabProps = {
  label: string;
  labelWidth: number;
  Icon: (typeof TAB_ITEMS)[number]["Icon"];
  focused: boolean;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
  pillBackground: string;
  borderColor: string;
  isDark: boolean;
};

function DiscreteTab({
  label,
  labelWidth,
  Icon,
  focused,
  onPress,
  activeColor,
  inactiveColor,
  pillBackground,
  borderColor,
  isDark,
}: DiscreteTabProps) {
  const progress = useSharedValue(focused ? 1 : 0);
  const shine = useSharedValue(0);
  const [shineReady, setShineReady] = useState(false);

  useEffect(() => {
    progress.value = withSpring(focused ? 1 : 0, SPRING);
  }, [focused, progress]);

  useEffect(() => {
    if (!focused) {
      setShineReady(false);
      shine.value = 0;
      return;
    }

    const timer = setTimeout(() => {
      setShineReady(true);
      shine.value = 0;
      shine.value = withTiming(1, {
        duration: 500,
        easing: Easing.linear,
      });
    }, 600);

    return () => {
      clearTimeout(timer);
      setShineReady(false);
      shine.value = 0;
    };
  }, [focused, shine]);

  const pillStyle = useAnimatedStyle(() => ({
    paddingHorizontal: PILL_PAD_X,
    width:
      PILL_PAD_X * 2 +
      ICON_SLOT +
      interpolate(progress.value, [0, 1], [0, LABEL_GAP + labelWidth], Extrapolation.CLAMP),
  }));

  const labelStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [0, labelWidth], Extrapolation.CLAMP),
    opacity: interpolate(progress.value, [0, 0.45, 1], [0, 0, 1], Extrapolation.CLAMP),
    marginLeft: interpolate(progress.value, [0, 1], [0, LABEL_GAP], Extrapolation.CLAMP),
  }));

  const shineStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(shine.value, [0, 1], [-64, labelWidth + 24], Extrapolation.CLAMP),
      },
    ],
  }));

  const color = focused ? activeColor : inactiveColor;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      hitSlop={6}
      onPress={onPress}
    >
      <Animated.View
        className="items-center justify-center overflow-hidden rounded-full border"
        style={[
          {
            height: PILL_HEIGHT,
            backgroundColor: pillBackground,
            borderColor,
            shadowColor: "#1A0F3A",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.1,
            shadowRadius: 12,
            elevation: 6,
          },
          pillStyle,
        ]}
      >
        <View className="flex-row items-center">
          <View
            style={{
              width: ICON_SLOT,
              height: ICON_SLOT,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon color={color} size={22} strokeWidth={focused ? 2.4 : 2} />
          </View>

          <Animated.View style={[{ overflow: "hidden" }, labelStyle]}>
            <Text
              numberOfLines={1}
              className="text-[16px] font-semibold"
              style={{ color, width: labelWidth }}
            >
              {label}
            </Text>

            {focused && shineReady ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    width: 48,
                  },
                  shineStyle,
                ]}
              >
                <LinearGradient
                  colors={[
                    "transparent",
                    isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.85)",
                    "transparent",
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Android tab bar — discrete expanding pills (Watermelon Discrete Tabs style).
 * iOS keeps the liquid glass bar in LiquidTabBar.ios.tsx.
 */
export function LiquidTabBar({ state, emitter, navigateToTab }: LiquidTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];

  const focusedName = state.routes[state.index]?.name;

  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0 items-center"
      style={{ paddingBottom: Math.max(insets.bottom, 14) }}
    >
      <View className="flex-row items-center justify-center gap-2 px-4">
        {TAB_ITEMS.map((item) => {
          const route = state.routes.find((candidate) => candidate.name === item.key);
          if (!route) {
            return null;
          }

          const focused = focusedName === item.key;

          return (
            <DiscreteTab
              key={item.key}
              Icon={item.Icon}
              activeColor={palette.primary}
              borderColor={isDark ? palette.border : withAlpha(palette.foreground, 0.06)}
              focused={focused}
              inactiveColor={palette.mutedForeground}
              isDark={isDark}
              label={item.label}
              labelWidth={item.labelWidth}
              pillBackground={palette.card}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
