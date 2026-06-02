import { createClient, SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy mobile/env.example to mobile/.env and set your Supabase project values.`,
    );
  }
  return value;
}

const supabaseUrl = requireEnv("EXPO_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requireEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
);
