/**
 * Open Banking: consent creation, authorisation URL, list OB accounts, transaction sync.
 * Backend flow: POST /open-banking/consent → user visits authorization_url → POST /open-banking/fetch-transactions.
 */
import React, { useCallback, useEffect, useState } from "react";
import { View, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { ScreenHeader } from "@/components/screen-header";
import { Spacing } from "@/constants/theme";
import {
  createConsent,
  listOpenBankingAccounts,
  fetchTransactionsFromBackend,
  type OpenBankingAccount,
} from "@/lib/backend-client";

export default function OpenBankingLinkScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [accounts, setAccounts] = useState<OpenBankingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOpenBankingAccounts();
      setAccounts(res.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const handleCreateConsent = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createConsent({
        permissions: [
          "ReadAccountsBasic",
          "ReadTransactionsBasic",
          "ReadTransactionsCredits",
          "ReadTransactionsDebits",
        ],
        expiration_days: 90,
      });
      if (res.authorization_url) {
        await WebBrowser.openBrowserAsync(res.authorization_url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadAccounts();
      } else {
        setError("No authorisation URL returned. Check backend consent response.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create consent");
    } finally {
      setCreating(false);
    }
  };

  const handleSync = async (accountId: number) => {
    setSyncingId(accountId);
    setError(null);
    try {
      await fetchTransactionsFromBackend(accountId);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.sm,
          paddingBottom: insets.bottom + Spacing["5xl"],
          paddingHorizontal: Spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          title="Link bank (Open Banking)"
          subtitle="Create consent, authorise in the browser, then sync transactions."
          onBack={() => router.back()}
        />

        {error ? (
          <View className="mb-4 rounded-xl bg-red-100 px-4 py-3">
            <ThemedText type="body" className="text-red-700">
              {error}
            </ThemedText>
          </View>
        ) : null}

        <View className="mb-6">
          <ThemedText type="h3" className="text-text mb-2">
            Consent &amp; authorisation
          </ThemedText>
          <ThemedText type="small" className="text-text-muted mb-3">
            Create a consent — a browser will open. Approve within 90 seconds, then return here and sync.
          </ThemedText>
          <Pressable
            onPress={handleCreateConsent}
            disabled={creating}
            className="rounded-2xl bg-primary py-3 px-4 active:opacity-80"
          >
            {creating ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator size="small" color="#fff" />
                <ThemedText type="button" className="text-primary-foreground ml-2">
                  Creating…
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="button" className="text-primary-foreground text-center">
                Create consent and open authorisation
              </ThemedText>
            )}
          </Pressable>
        </View>

        <View>
          <ThemedText type="h3" className="text-text mb-2">
            Open Banking accounts
          </ThemedText>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : accounts.length === 0 ? (
            <ThemedText type="small" className="text-text-muted">
              No Open Banking accounts yet. Create a consent above and authorise in the browser.
            </ThemedText>
          ) : (
            <View className="gap-3">
              {accounts.map((acc) => (
                <View
                  key={acc.id}
                  className="rounded-2xl bg-bg-card px-4 py-3 flex-row items-center justify-between"
                >
                  <View>
                    <ThemedText type="body" className="text-text">
                      {acc.bank_name} · {acc.account_id}
                    </ThemedText>
                    <ThemedText type="small" className="text-text-muted">
                      Status: {acc.status}
                    </ThemedText>
                  </View>
                  <Pressable
                    onPress={() => handleSync(acc.id)}
                    disabled={syncingId === acc.id}
                    className="rounded-xl bg-primary/20 py-2 px-3 active:opacity-80"
                  >
                    {syncingId === acc.id ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <ThemedText type="button" className="text-primary">
                        Sync
                      </ThemedText>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
