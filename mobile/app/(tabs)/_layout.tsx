import { Tabs } from "expo-router";
import React from "react";
import { Feather } from "@expo/vector-icons";

import { AnimatedTabBar } from "@/components/animated-tab-bar";
import { IconSymbol } from "@/components/ui/icon-symbol";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="actions"
        options={{
          title: "Actions",
          tabBarIcon: ({ color }) => (
            <Feather name="plus" size={36} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="leaks"
        options={{
          title: "Leaks",
          tabBarIcon: ({ color }) => (
            <Feather name="alert-triangle" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="gearshape.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
