import { Tabs } from "expo-router";
import { useColorScheme } from "nativewind";
import { View } from "react-native";

import { LiquidTabBar } from "../../src/components/navigation/LiquidTabBar";
import { TabBarScrollProvider } from "../../src/context/TabBarScrollContext";
import { COLORS } from "../../src/theme/colors";

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const background = COLORS[isDark ? "dark" : "light"].background;

  return (
    <TabBarScrollProvider>
      <View
        className={`flex-1 bg-background ${isDark ? "dark" : ""}`}
        style={{ flex: 1, backgroundColor: background }}
      >
        <Tabs
          tabBar={(props) => <LiquidTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: background },
          }}
        >
          <Tabs.Screen name="index" options={{ title: "Home" }} />
          <Tabs.Screen name="budget" options={{ title: "Insights" }} />
          <Tabs.Screen name="leaks" options={{ href: null }} />
          <Tabs.Screen
            name="transactions"
            options={{ title: "Transactions" }}
          />
          <Tabs.Screen name="settings" options={{ title: "Profile" }} />
        </Tabs>
      </View>
    </TabBarScrollProvider>
  );
}
