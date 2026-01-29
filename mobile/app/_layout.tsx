import { DarkTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import { ThemeProvider } from '@/context/theme-context';
import { AppProvider } from '@/context/app-context';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function RootLayout() {
  return (
    <AppProvider>
      <ThemeProvider>
        <NavigationThemeProvider value={DarkTheme}>
          {/* All screens (index, auth, tabs, modals) must render inside this Stack so they have AppProvider. */}
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="language-selection" />
            <Stack.Screen name="consent" />
            <Stack.Screen name="analysis-loading" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="bank-autopsy" />
            <Stack.Screen name="add-account" />
            <Stack.Screen name="autopsy-dashboard" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="device-settings" />
          <Stack.Screen name="policy" />
            <Stack.Screen name="loss-detail" />
            <Stack.Screen name="freeze-control" />
            <Stack.Screen name="pause-control" />
            <Stack.Screen name="opt-out-control" />
            <Stack.Screen name="reroute-control" />
            <Stack.Screen 
              name="voicemodal" 
              options={{ 
                presentation: 'modal' 
              }} 
            />
          </Stack>
          <StatusBar style="auto" />
        </NavigationThemeProvider>
      </ThemeProvider>
    </AppProvider>
  );
}
