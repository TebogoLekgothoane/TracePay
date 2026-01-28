import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";

import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { IconSymbol } from "@/components/ui/icon-symbol";

/**
 * Custom bottom tab bar with a sliding background "pill" that moves
 * underneath the active tab as the user switches between them.
 */
export function AnimatedTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const [tabWidth, setTabWidth] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const translateIndex = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(translateIndex, {
      toValue: state.index,
      useNativeDriver: true,
      friction: 10,
      tension: 80,
    }).start();
  }, [state.index]);

  // Always close the action menu when switching tabs
  useEffect(() => {
    setIsMenuOpen(false);
  }, [state.index]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setTabWidth(width / state.routes.length);
    }
  };

  const theme = Colors[colorScheme ?? "light"];

  const actionRouteName = "freeze";
  const actionIndex = state.routes.findIndex((r) => r.name === actionRouteName);

  return (
    <>
      <View
        style={[
          styles.wrapper,
          {
            backgroundColor: theme.backgroundRoot,
            borderTopColor: theme.backgroundTertiary,
          },
        ]}
        onLayout={handleLayout}
      >
        {/* Sliding overlay behind the active tab */}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.overlay,
              {
                width: tabWidth - 16, // leave a small gutter between pills
                backgroundColor: theme.tabIconSelected,
                transform: [
                  {
                    translateX: Animated.multiply(translateIndex, tabWidth),
                  },
                ],
              },
            ]}
          />
        )}

        {/* Actual tab buttons */}
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
          const label =
            typeof rawLabel === "string" ? rawLabel : String(rawLabel ?? "");

          const isFocused = state.index === index;
          const isActionTab = route.name === "freeze";

          const onPress = () => {
            if (isActionTab) {
              // Toggle the action sheet instead of changing the active tab
              setIsMenuOpen((open) => !open);
              return;
            }

            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          const onLongPress = () => {
            if (isActionTab) return;
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          const tintColor = isFocused
            ? theme.buttonText
            : isActionTab && isMenuOpen
            ? theme.buttonText
            : theme.tabIconDefault;

          const Icon = options.tabBarIcon
            ? options.tabBarIcon({
                focused: isFocused,
                color: tintColor,
                size: 28,
              })
            : null;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={
                isFocused ? { selected: true } : isActionTab && isMenuOpen ? { selected: true } : {}
              }
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={() => {
                if (process.env.EXPO_OS === "ios") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                onPress();
              }}
              onLongPress={onLongPress}
              style={styles.tab}
            >
              {Icon}
              <Text
                style={[
                  styles.label,
                  {
                    color: tintColor,
                  },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Radial-style action icons around the Freeze tab */}
      {isMenuOpen && tabWidth > 0 && actionIndex !== -1 && (
        <View style={styles.menuOverlay} pointerEvents="box-none">
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setIsMenuOpen(false)}
          />
          <View
            style={[
              styles.radialContainer,
              {
                left: actionIndex * tabWidth + tabWidth / 2 - 110, // center the cluster
              },
            ]}
          >
            {[
              {
                key: "freeze",
                label: "Freeze",
                icon: "snowflake" as const,
                href: "/freeze-control",
              },
              {
                key: "pause",
                label: "Pause",
                icon: "pause.fill" as const,
                href: "/pause-control",
              },
              {
                key: "optout",
                label: "Opt out",
                icon: "nosign" as const,
                href: "/opt-out-control",
              },
              {
                key: "reroute",
                label: "Reroute",
                icon: "arrow.triangle.2.circlepath" as const,
                href: "/reroute-control",
              },
            ].map((item) => (
              <Pressable
                key={item.key}
                style={[styles.radialItem, { backgroundColor: theme.backgroundRoot }]}
                onPress={() => {
                  router.push(item.href as any);
                  setIsMenuOpen(false);
                }}
              >
                <IconSymbol
                  name={item.icon}
                  size={20}
                  color={theme.tabIconSelected}
                />
                <Text style={[styles.radialLabel, { color: theme.text }]}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  overlay: {
    position: "absolute",
    left: 8,
    top: 7,
    bottom: 13,
    borderRadius: 999,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    gap: 7,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    // Keep this transparent so the main content doesn't get dimmed
    backgroundColor: "transparent",
  },
  radialContainer: {
    position: "absolute",
    bottom: 72,
    width: 220,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  radialItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  radialLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
  },
});

