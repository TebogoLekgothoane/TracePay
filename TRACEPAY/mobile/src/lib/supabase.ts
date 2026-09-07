import "react-native-url-polyfill/auto";

import * as SecureStore from "expo-secure-store";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function readEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^["']+|["';,\s]+$/g, "");
}

const supabaseUrl = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = readEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const SECURE_STORE_CHUNK = 1800;

const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}.chunks`);
    if (!chunkCountRaw) {
      return SecureStore.getItemAsync(key);
    }

    const chunkCount = Number(chunkCountRaw);
    if (!Number.isFinite(chunkCount) || chunkCount < 1) {
      return null;
    }

    const parts: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${index}`);
      if (part == null) {
        return null;
      }
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key: string, value: string): Promise<void> {
    await secureAuthStorage.removeItem(key);

    if (value.length <= SECURE_STORE_CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }

    const chunkCount = Math.ceil(value.length / SECURE_STORE_CHUNK);
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunkCount));
    for (let index = 0; index < chunkCount; index += 1) {
      const start = index * SECURE_STORE_CHUNK;
      await SecureStore.setItemAsync(
        `${key}.${index}`,
        value.slice(start, start + SECURE_STORE_CHUNK),
      );
    }
  },

  async removeItem(key: string): Promise<void> {
    const chunkCountRaw = await SecureStore.getItemAsync(`${key}.chunks`);
    if (chunkCountRaw) {
      const chunkCount = Number(chunkCountRaw);
      if (Number.isFinite(chunkCount) && chunkCount > 0) {
        await Promise.all(
          Array.from({ length: chunkCount }, (_, index) =>
            SecureStore.deleteItemAsync(`${key}.${index}`),
          ),
        );
      }
      await SecureStore.deleteItemAsync(`${key}.chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

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
        storage: secureAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }

  return client;
}
