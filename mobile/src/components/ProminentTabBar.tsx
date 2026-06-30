import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { AppText } from "@/components/Typography";
import { GLASS } from "@/theme/colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export const PROMINENT_TAB_BAR_HEIGHT = 56;
export const PROMINENT_TAB_FAB_SIZE = 58;
export const PROMINENT_TAB_FAB_RISE = 28;
/** Extra scroll padding above the tab bar (includes FAB overhang). */
export const PROMINENT_TAB_CONTENT_INSET = 96;

const NOTCH_RADIUS = 38;
const NOTCH_TOP = 20;
const CENTER_ROUTE = "sms-scan";
const HIDDEN_TAB_ROUTES = new Set(["history", "sms-scanning", "sms-results"]);

function createTabBarPath(width: number, height: number): string {
  const cx = width / 2;
  const leftEnd = cx - NOTCH_RADIUS;
  const rightStart = cx + NOTCH_RADIUS;

  return [
    `M 0 ${NOTCH_TOP}`,
    `L ${leftEnd} ${NOTCH_TOP}`,
    `A ${NOTCH_RADIUS} ${NOTCH_RADIUS} 0 0 0 ${rightStart} ${NOTCH_TOP}`,
    `L ${width} ${NOTCH_TOP}`,
    `L ${width} ${height}`,
    `L 0 ${height}`,
    "Z",
  ].join(" ");
}

function isTabVisible(routeName: string) {
  return !HIDDEN_TAB_ROUTES.has(routeName);
}

export function ProminentTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, isDarkColorScheme } = useColorScheme();
  const isIOS = Platform.OS === "ios";

  const visibleRoutes = state.routes.filter((route) => isTabVisible(route.name));

  const svgHeight = PROMINENT_TAB_BAR_HEIGHT + PROMINENT_TAB_FAB_RISE;
  const totalHeight = svgHeight + insets.bottom;
  const barFill = isDarkColorScheme ? GLASS.background : colors.card;

  return (
    <View
      className="absolute bottom-0 left-0 right-0"
      style={{ height: totalHeight, paddingBottom: insets.bottom }}
    >
      <View className="absolute bottom-0 left-0 right-0" style={{ height: svgHeight + insets.bottom }}>
        <Svg
          width={width}
          height={svgHeight + insets.bottom}
          style={{ position: "absolute", bottom: 0 }}
        >
          <Path d={createTabBarPath(width, svgHeight + insets.bottom)} fill={barFill} />
        </Svg>

        {!isDarkColorScheme && !isIOS ? (
          <View
            className="absolute left-0 right-0 border-t border-border"
            style={{ bottom: insets.bottom, height: svgHeight }}
          />
        ) : null}
      </View>

      <View
        className="absolute left-0 right-0 flex-row items-end"
        style={{ bottom: insets.bottom, height: svgHeight }}
      >
        {visibleRoutes.map((route) => {
          const { options } = descriptors[route.key];
          const routeIndex = state.routes.indexOf(route);
          const isFocused = state.index === routeIndex;
          const tint = isFocused ? colors.primary : colors.mutedForeground;
          const label = options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          if (route.name === CENTER_ROUTE) {
            return (
              <View key={route.key} className="flex-1 items-center justify-end pb-1">
                <Pressable
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                  accessibilityLabel={label}
                  className="items-center active:opacity-90"
                  style={{ marginTop: -PROMINENT_TAB_FAB_RISE }}
                >
                  <View
                    className="items-center justify-center rounded-full bg-brand-purple dark:bg-primary"
                    style={{
                      width: PROMINENT_TAB_FAB_SIZE,
                      height: PROMINENT_TAB_FAB_SIZE,
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.5,
                      shadowRadius: 14,
                      elevation: 10,
                    }}
                  >
                    <MaterialCommunityIcons name="line-scan" size={27} color="#FFFFFF" />
                  </View>
                  <AppText
                    variant="caption"
                    className="mt-1.5 text-[11px] font-medium"
                    style={{ color: isFocused ? colors.primary : colors.mutedForeground }}
                  >
                    {label}
                  </AppText>
                </Pressable>
              </View>
            );
          }

          const icon = options.tabBarIcon?.({
            focused: isFocused,
            color: tint,
            size: 22,
          });

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={label}
              className="flex-1 items-center justify-end pb-2.5 active:opacity-80"
            >
              {icon}
              <AppText
                variant="caption"
                className="mt-1 text-[11px] font-medium"
                style={{ color: tint }}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
