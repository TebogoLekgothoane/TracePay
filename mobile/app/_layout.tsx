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
    <ThemeProvider>
      <AppProvider>
        <NavigationThemeProvider value={DarkTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="language-selection" />
            <Stack.Screen name="consent" />
            <Stack.Screen name="analysis-loading" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="dashboard" />
            <Stack.Screen name="bank-autopsy" />
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
            <Stack.Screen 
              name="modal" 
              options={{ 
                presentation: 'modal',
                title: 'Modal' 
              }} 
            />
          </Stack>
          <StatusBar style="auto" />
        </NavigationThemeProvider>
      </AppProvider>
    </ThemeProvider>
  );
}
