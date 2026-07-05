import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { create } from "zustand";

import { AUTH_KEYS } from "@/lib/auth-storage";
import { clearPin, hasPin, savePinHash, verifyPin as verifyStoredPin } from "@/lib/pin-storage";

interface DeviceAuthState {
  isUnlocked: boolean;
  biometricEnabled: boolean;
  pinEnabled: boolean;
  isLoaded: boolean;
  loadFromStorage: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<boolean>;
  clearDeviceAuth: () => Promise<void>;
  initializeAppLock: () => () => void;
}

export const useDeviceAuthStore = create<DeviceAuthState>((set, get) => ({
  isUnlocked: false,
  biometricEnabled: false,
  pinEnabled: false,
  isLoaded: false,

  loadFromStorage: async () => {
    const [biometric, pinFlag] = await Promise.all([
      AsyncStorage.getItem(AUTH_KEYS.biometricEnabled),
      AsyncStorage.getItem(AUTH_KEYS.pinEnabled),
    ]);
    const pinExists = await hasPin();
    set({
      biometricEnabled: biometric === "true",
      pinEnabled: pinFlag === "true" || pinExists,
      isLoaded: true,
    });
  },

  unlock: () => set({ isUnlocked: true }),

  lock: () => set({ isUnlocked: false }),

  setBiometricEnabled: async (enabled) => {
    await AsyncStorage.setItem(AUTH_KEYS.biometricEnabled, String(enabled));
    set({ biometricEnabled: enabled });
  },

  setupPin: async (pin) => {
    await savePinHash(pin);
    await AsyncStorage.setItem(AUTH_KEYS.pinEnabled, "true");
    set({ pinEnabled: true });
  },

  verifyPin: async (pin) => {
    const ok = await verifyStoredPin(pin);
    if (ok) get().unlock();
    return ok;
  },

  clearDeviceAuth: async () => {
    await Promise.all([
      AsyncStorage.multiRemove([AUTH_KEYS.biometricEnabled, AUTH_KEYS.pinEnabled]),
      clearPin(),
    ]);
    set({ biometricEnabled: false, pinEnabled: false, isUnlocked: false });
  },

  initializeAppLock: () => {
    let currentState = AppState.currentState;

    const onChange = (nextState: AppStateStatus) => {
      if (currentState.match(/active/) && nextState.match(/inactive|background/)) {
        get().lock();
      }
      currentState = nextState;
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  },
}));
