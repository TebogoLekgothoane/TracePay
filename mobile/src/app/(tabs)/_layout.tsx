import { Tabs } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Platform, View } from "react-native";

import { ProminentTabBar } from "@/components/ProminentTabBar";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabLayout() {
  const { colors } = useColorScheme();
  const isIOS = Platform.OS === "ios";

  return (
    <View className="flex-1 bg-background">
      <Tabs
      tabBar={(props) => <ProminentTabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.background,
        },
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
        name="sms-scan"
        options={{
          title: "Scan SMS",
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
      <Tabs.Screen
        name="history"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sms-scanning"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sms-results"
        options={{
          href: null,
        }}
      />
    </Tabs>
    </View>
  );
}
