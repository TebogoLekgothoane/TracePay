import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertSupabaseConfig, config } from "./config.js";

let adminClient: SupabaseClient | null = null;
let userClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  assertSupabaseConfig();
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

export function getUserClient(): SupabaseClient {
  assertSupabaseConfig();
  if (!userClient) {
    userClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return userClient;
}
