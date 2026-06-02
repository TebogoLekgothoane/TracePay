import React, { useEffect, useState } from "react";
import { View, Alert } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Button } from "@/components/ui/button";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { LabeledInput } from "@/components/labeled-input";
import { ThemedText } from "@/components/themed-text";
import { Spacing } from "@/constants/theme";

const PASSCODE_KEY = "@tracepay_passcode";

export default function ChangePasswordScreen() {
  const router = useRouter();

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
    <ScreenContainer>
      <ScreenHeader
        title="Change password"
        onBack={() => router.back()}
        subtitle="This password is used to lock and protect your TracePay profile on this device only."
      />

      {hasExistingPasscode ? (
        <LabeledInput
          label="Current password"
          value={current}
          onChangeText={setCurrent}
          placeholder="Enter current password"
          secureTextEntry
        />
      ) : (
        <View style={{ marginBottom: Spacing.lg }}>
          <ThemedText type="small" className="text-text-muted">
            You haven&apos;t set a password yet. Create one below to add an extra layer of
            protection.
          </ThemedText>
        </View>
      )}

      <LabeledInput
        label="New password"
        value={next}
        onChangeText={setNext}
        placeholder="Enter new password"
        secureTextEntry
      />

      <LabeledInput
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter new password"
        secureTextEntry
      />

      <Button
        onPress={handleSave}
        disabled={isSaving}
        style={{ width: "100%" }}
      >
        {isSaving ? "Saving..." : "Save password"}
      </Button>
    </ScreenContainer>
  );
}

