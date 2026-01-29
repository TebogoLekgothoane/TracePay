import React, { useEffect, useState } from "react";
import { View, TextInput, StyleSheet, Alert, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";
import { Feather } from "@expo/vector-icons";

const PASSCODE_KEY = "@tracepay_passcode";

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();

  const [hasExistingPasscode, setHasExistingPasscode] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(PASSCODE_KEY);
      if (stored) {
        setHasExistingPasscode(true);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (next.length < 4) {
      Alert.alert("Too short", "Your PIN/password should be at least 4 characters.");
      return;
    }
    if (next !== confirm) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }

    setIsSaving(true);
    try {
      const stored = await AsyncStorage.getItem(PASSCODE_KEY);
      if (stored && stored !== current) {
        Alert.alert("Incorrect password", "Your current password does not match.");
        setIsSaving(false);
        return;
      }

      await AsyncStorage.setItem(PASSCODE_KEY, next);
      Alert.alert("Saved", "Your TracePay password has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView
      style={{
        flex: 1,
        paddingTop: insets.top + Spacing.sm,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={{ marginBottom: Spacing["3xl"] }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: Spacing.md,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{ padding: Spacing.xs, marginRight: Spacing.sm }}
            hitSlop={10}
          >
            <Feather name="arrow-left" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="h2" className="text-text">
            Change password
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text-muted">
          This password is used to lock and protect your TracePay profile on this device only.
        </ThemedText>
      </View>

      {hasExistingPasscode ? (
        <View style={{ marginBottom: Spacing.lg }}>
          <ThemedText type="small" className="text-text mb-1">
            Current password
          </ThemedText>
          <TextInput
            value={current}
            onChangeText={setCurrent}
            secureTextEntry
            placeholder="Enter current password"
            placeholderTextColor={theme.textSecondary}
            style={[
              styles.input,
              {
                borderColor: theme.backgroundTertiary,
                color: theme.text,
                backgroundColor: theme.backgroundDefault,
              },
            ]}
          />
        </View>
      ) : (
        <View style={{ marginBottom: Spacing.lg }}>
          <ThemedText type="small" className="text-text-muted">
            You haven&apos;t set a password yet. Create one below to add an extra layer of
            protection.
          </ThemedText>
        </View>
      )}

      <View style={{ marginBottom: Spacing.lg }}>
        <ThemedText type="small" className="text-text mb-1">
          New password
        </ThemedText>
        <TextInput
          value={next}
          onChangeText={setNext}
          secureTextEntry
          placeholder="Enter new password"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            {
              borderColor: theme.backgroundTertiary,
              color: theme.text,
              backgroundColor: theme.backgroundDefault,
            },
          ]}
        />
      </View>

      <View style={{ marginBottom: Spacing["3xl"] }}>
        <ThemedText type="small" className="text-text mb-1">
          Confirm new password
        </ThemedText>
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          placeholder="Re-enter new password"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.input,
            {
              borderColor: theme.backgroundTertiary,
              color: theme.text,
              backgroundColor: theme.backgroundDefault,
            },
          ]}
        />
      </View>

      <Button
        onPress={handleSave}
        disabled={isSaving}
        style={{ width: "100%" }}
      >
        {isSaving ? "Saving..." : "Save password"}
      </Button>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});

