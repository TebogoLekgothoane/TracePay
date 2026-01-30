import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useApp } from "@/context/app-context";
import { clearAuthStorage } from "@/lib/auth-storage";

/** Sign-out: clears local auth storage only (no backend). Then redirects to login. */
export default function SignOutScreen() {
  const router = useRouter();
  const { setUserId } = useApp();

  useEffect(() => {
    let cancelled = false;

    async function signOut() {
      try {
        await clearAuthStorage();
        setUserId(null);
        // No backend/Supabase – UI-only
      } catch {
        // Ignore
      }
      if (!cancelled) {
        router.replace("/(auth)" as any);
      }
    }

    signOut();
    return () => {
      cancelled = true;
    };
  }, [router, setUserId]);

  return (
    <ThemedView className="flex-1 bg-bg items-center justify-center px-6">
      <ThemedText type="body" className="text-text-muted">
        Signing out…
      </ThemedText>
    </ThemedView>
  );
}
