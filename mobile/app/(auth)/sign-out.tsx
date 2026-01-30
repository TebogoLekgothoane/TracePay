import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { clearBackendAuthToken } from "@/lib/backend-client";
import { supabase } from "@/lib/supabase";

/**
 * Sign-out screen: clears backend JWT and Supabase session, then redirects to login.
 * Can be navigated to directly (e.g. from settings) or used as a redirect target.
 */
export default function SignOutScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function signOut() {
      try {
        await clearBackendAuthToken();
        await supabase.auth.signOut();
      } catch {
        // Ignore errors; still redirect
      }
      if (!cancelled) {
        router.replace("/(auth)" as any);
      }
    }

    signOut();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <ThemedView className="flex-1 bg-bg items-center justify-center px-6">
      <ThemedText type="body" className="text-text-muted">
        Signing out…
      </ThemedText>
    </ThemedView>
  );
}
