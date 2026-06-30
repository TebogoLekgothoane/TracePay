import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, View } from "react-native";
import { useColorScheme } from "@/hooks/useColorScheme";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="budget">
        <Icon sf={{ default: "chart.pie", selected: "chart.pie.fill" }} />
        <Label>Budget</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Profile</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { isDarkColorScheme, colors } = useColorScheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS || isDarkColorScheme ? "transparent" : colors.card,
          borderTopWidth: isDarkColorScheme ? 0 : 1,
          borderTopColor: isDarkColorScheme ? "transparent" : colors.border,
          elevation: 0,
          height: isWeb ? 84 : 60,
          paddingBottom: isWeb ? 20 : 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Inter_500Medium",
        },
        tabBarBackground: () =>
          isIOS || isDarkColorScheme ? (
            <BlurView
              intensity={isDarkColorScheme ? 60 : 100}
              tint={isDarkColorScheme ? "dark" : "light"}
              className="absolute inset-0"
            />
          ) : isWeb ? (
            <View
              className={
                isDarkColorScheme
                  ? "absolute inset-0 bg-white/5"
                  : "absolute inset-0 bg-card"
              }
            />
          ) : isDarkColorScheme ? (
            <View className="absolute inset-0 bg-white/5" />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="house" tintColor={color} size={24} />
            ) : (
              <Feather name="home" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="sms-scan"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="budget"
        options={{
          title: "Budget",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="chart.pie" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="chart-donut" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: "Rewards",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="gift" tintColor={color} size={24} />
            ) : (
              <MaterialCommunityIcons name="gift" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="person" tintColor={color} size={24} />
            ) : (
              <Feather name="user" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
