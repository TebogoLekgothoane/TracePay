import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
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
        className="flex-row items-center justify-between px-4 pt-2 pb-[13px] border-t relative"
        style={{
          backgroundColor: theme.backgroundRoot,
          borderTopColor: theme.backgroundTertiary,
          borderTopWidth: 1,
        }}
        onLayout={handleLayout}
      >
        {/* Sliding overlay behind the active tab */}
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            className="absolute left-2 top-[7px] bottom-[13px] rounded-full"
            style={{
              width: tabWidth - 16,
              backgroundColor: theme.tabIconSelected,
              transform: [
                {
                  translateX: Animated.multiply(translateIndex, tabWidth),
                },
              ],
            }}
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
              className="flex-1 items-center justify-center py-1 gap-[7px]"
            >
              {Icon}
              <Text
                className="text-[11px] font-semibold"
                style={{ color: tintColor }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Radial-style action icons around the Freeze tab */}
      {isMenuOpen && tabWidth > 0 && actionIndex !== -1 && (
        <View className="absolute inset-0" pointerEvents="box-none">
          <Pressable
            className="absolute inset-0"
            onPress={() => setIsMenuOpen(false)}
          />
          <View
            className="absolute bottom-[72px] w-[220px] flex-row justify-between items-end"
            style={{
              left: actionIndex * tabWidth + tabWidth / 2 - 110,
            }}
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
                className="items-center justify-center px-2.5 py-2 rounded-full"
                style={{ backgroundColor: theme.backgroundRoot }}
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
                <Text className="mt-1 text-[11px] font-medium" style={{ color: theme.text }}>
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
