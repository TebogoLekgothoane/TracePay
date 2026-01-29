import { useEffect } from "react";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { getBackendToken } from "@/lib/auth-storage";
import { supabase } from "@/lib/supabase";

/**
 * Root index: if user has a backend JWT or Supabase session, go to tabs; otherwise go to login.
 * (You don't see sign-in because the app "remembers" you – sign out from Settings to see it again.)
 */
export default function IndexScreen() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function resolveRoute() {
      try {
        const token = await getBackendToken();
        if (token) {
          if (!cancelled) router.replace("/(tabs)/home" as any);
          return;
        }
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) router.replace("/(tabs)/home" as any);
          return;
        }
      } catch {
        // Ignore
      }
      if (!cancelled) router.replace("/(auth)" as any);
    }

    resolveRoute();
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
