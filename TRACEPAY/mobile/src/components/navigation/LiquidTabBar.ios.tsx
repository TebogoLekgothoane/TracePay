import {
  Button,
  GlassEffectContainer,
  Host,
  HStack,
  Image,
  Namespace,
} from "@expo/ui/swift-ui";
import {
  animation,
  accessibilityLabel,
  accessibilityValue,
  buttonStyle,
  Animation,
  frame,
  glassEffect,
  glassEffectId,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "nativewind";
import { useId } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, withAlpha } from "../../theme/colors";

type LiquidTabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigateToTab: (routeKey: string) => void;
};

const TAB_ITEMS = [
  { key: "index", label: "Home", systemImage: "house.fill" as const },
  { key: "leaks", label: "Leaks", systemImage: "drop.fill" as const },
  {
    key: "budget",
    label: "Insights",
    systemImage: "lightbulb.fill" as const,
  },
  { key: "settings", label: "Profile", systemImage: "person.fill" as const },
] as const;

const BAR_WIDTH = 276;
const BAR_HEIGHT = 46;
const BAR_HORIZONTAL_PADDING = 6;
const TAB_BUTTON_HEIGHT = 36;
const SLOT = (BAR_WIDTH - BAR_HORIZONTAL_PADDING * 2) / TAB_ITEMS.length;

export function LiquidTabBar({ state, navigateToTab }: LiquidTabBarProps) {
  const insets = useSafeAreaInsets();
  const namespaceId = useId();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];

  const focusedName = state.routes[state.index]?.name;
  const focusedIndex = Math.max(
    0,
    TAB_ITEMS.findIndex((item) => item.key === focusedName),
  );
  const focusedKey = TAB_ITEMS[focusedIndex]?.key ?? "index";

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        paddingBottom: Math.max(insets.bottom, 10),
      }}
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
            spacing={10}
          >
            <HStack
              spacing={0}
              modifiers={[
                frame({ width: BAR_WIDTH, height: BAR_HEIGHT }),
                padding({ horizontal: BAR_HORIZONTAL_PADDING, vertical: 5 }),
                glassEffect({
                  glass: {
                    variant: "regular",
                    interactive: true,
                  },
                  shape: "capsule",
                }),
              ]}
            >
              {TAB_ITEMS.map((item) => {
                const selected = focusedKey === item.key;

                return (
                  <Button
                    key={item.key}
                    onPress={() => {
                    const route = state.routes.find((candidate) => candidate.name === item.key);
                    if (route) navigateToTab(route.key);
                  }}
                    modifiers={[
                      frame({ width: SLOT, height: TAB_BUTTON_HEIGHT }),
                      buttonStyle("plain"),
                      accessibilityLabel(item.label),
                      accessibilityValue(selected ? "Selected" : ""),
                      ...(selected
                        ? [
                            glassEffect({
                              glass: {
                                variant: "clear",
                                interactive: true,
                              },
                              shape: "capsule",
                            }),
                            glassEffectId("tab-liquid", namespaceId),
                          ]
                        : []),
                      animation(
                        Animation.spring({ duration: 0.55 }),
                        focusedIndex,
                      ),
                    ]}
                  >
                    <Image
                      systemName={item.systemImage}
                      size={19}
                      color={
                        selected
                          ? palette.foreground
                          : palette.mutedForeground
                      }
                    />
                  </Button>
                );
              })}
            </HStack>
          </GlassEffectContainer>
        </Namespace>
      </Host>
    </View>
  );
}
