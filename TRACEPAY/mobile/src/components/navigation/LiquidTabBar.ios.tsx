import {
  GlassEffectContainer,
  Host,
  HStack,
  Image,
  Namespace,
} from "@expo/ui/swift-ui";
import {
  animation,
  Animation,
  frame,
  glassEffect,
  glassEffectId,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "nativewind";
import { useId } from "react";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTabBarScroll } from "../../context/TabBarScrollContext";
import { COLORS } from "../../theme/colors";

type LiquidTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: { navigate: (name: string) => void };
};

const TAB_ITEMS = [
  { key: "index", label: "Home", systemImage: "house.fill" as const },
  { key: "budget", label: "Insights", systemImage: "chart.pie.fill" as const },
  {
    key: "transactions",
    label: "Transactions",
    systemImage: "list.bullet" as const,
  },
  { key: "settings", label: "Profile", systemImage: "person.fill" as const },
] as const;

const BAR_WIDTH = 288;
const BAR_HEIGHT = 64;
const SLOT = (BAR_WIDTH - 24) / TAB_ITEMS.length;

export function LiquidTabBar({ state, navigation }: LiquidTabBarProps) {
  const insets = useSafeAreaInsets();
  const namespaceId = useId();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];
  const { tabBarOffset } = useTabBarScroll();

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarOffset.value }],
  }));

  const focusedName = state.routes[state.index]?.name;
  const focusedIndex = Math.max(
    0,
    TAB_ITEMS.findIndex((item) => item.key === focusedName),
  );
  const focusedKey = TAB_ITEMS[focusedIndex]?.key ?? "index";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          paddingBottom: Math.max(insets.bottom, 14),
        },
        containerStyle,
      ]}
    >
      <Host
        matchContents
        colorScheme={isDark ? "dark" : "light"}
        style={{
          width: BAR_WIDTH,
          height: BAR_HEIGHT,
        }}
      >
        <Namespace id={namespaceId}>
          <GlassEffectContainer
            spacing={18}
            modifiers={[
              frame({ width: BAR_WIDTH, height: BAR_HEIGHT }),
              glassEffect({
                glass: {
                  variant: "regular",
                  interactive: true,
                },
                shape: "capsule",
              }),
              padding({ horizontal: 12, vertical: 8 }),
              animation(Animation.spring({ duration: 0.55 }), focusedIndex),
            ]}
          >
            <HStack spacing={0}>
              {TAB_ITEMS.map((item) => {
                const selected = focusedKey === item.key;

                return (
                  <Image
                    key={item.key}
                    systemName={item.systemImage}
                    size={22}
                    color={
                      selected ? palette.foreground : palette.mutedForeground
                    }
                    onPress={() => navigation.navigate(item.key)}
                    modifiers={[
                      frame({ width: SLOT, height: 48 }),
                      padding({ all: 12 }),
                      ...(selected
                        ? [
                            glassEffect({
                              glass: {
                                variant: "clear",
                                interactive: true,
                                tint: palette.primary,
                              },
                              shape: "circle",
                            }),
                            glassEffectId("tab-liquid", namespaceId),
                          ]
                        : []),
                      animation(
                        Animation.spring({ duration: 0.55 }),
                        focusedIndex,
                      ),
                    ]}
                  />
                );
              })}
            </HStack>
          </GlassEffectContainer>
        </Namespace>
      </Host>
    </Animated.View>
  );
}
