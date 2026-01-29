import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://qbosrqpfcenylivvhzgl.supabase.co";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFib3NycXBmY2VueWxpdnZoemdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDcwNDksImV4cCI6MjA4NTE4MzA0OX0.-xr6_OCTOP3DpGjCs6FR-xl4NBuBdwc61kTcbq-fNQo";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
