import AsyncStorage from "@react-native-async-storage/async-storage";

import { AUTH_KEYS } from "@/lib/auth-storage";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

export async function getUserId(): Promise<string> {
  if (isSupabaseConfigured()) {
    const {
      data: { session },
    } = await getSupabase().auth.getSession();
    if (session?.user.id) {
      return session.user.id;
    }
  }

  const storedId = await AsyncStorage.getItem(AUTH_KEYS.userId);
  if (storedId) {
    return storedId;
  }

  const fallbackId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await AsyncStorage.setItem(AUTH_KEYS.userId, fallbackId);
  return fallbackId;
}
