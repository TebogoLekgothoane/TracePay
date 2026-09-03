import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']+|["';,\s]+$/g, "");
}

const supabaseUrl = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = readEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to TRACEPAY/mobile/.env and restart Expo.",
    );
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
