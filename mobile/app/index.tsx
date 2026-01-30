import { useEffect } from "react";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { getBackendToken } from "@/lib/auth-storage";

/**
 * Root index: if user has a (fake) token, go to home; otherwise show auth.
 * No backend or Supabase – auth is UI-only with fake login.
 */
export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getBackendToken().then((token) => {
      if (cancelled) return;
      if (token) {
        router.replace("/(tabs)/home" as any);
      } else {
        router.replace("/(auth)" as any);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <ThemedView className="flex-1 bg-bg items-center justify-center px-6">
      <ThemedText type="body" className="text-text-muted">
        Loading…
      </ThemedText>
    </ThemedView>
  );
}
