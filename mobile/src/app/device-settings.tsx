import React, { useEffect, useState } from "react";
import { View, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { ScreenContainer } from "@/components/screen-container";
import { ScreenHeader } from "@/components/screen-header";
import { LabeledInput } from "@/components/labeled-input";
import { Spacing } from "@/constants/theme";

const MOBILE_KEY = "@tracepay_mobile";

export default function DeviceSettingsScreen() {
  const router = useRouter();

  const [mobileNumber, setMobileNumber] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await AsyncStorage.getItem(MOBILE_KEY);
      if (stored) {
        setMobileNumber(stored);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!mobileNumber.trim()) {
      Alert.alert("Missing number", "Please enter a valid mobile number.");
      return;
    }
    setIsSaving(true);
    try {
      await AsyncStorage.setItem(MOBILE_KEY, mobileNumber.trim());
      Alert.alert("Saved", "Your mobile number has been updated for TracePay alerts.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <ScreenHeader
        title="Mobile & device"
        onBack={() => router.back()}
        subtitle="Keep your contact details up to date so TracePay can stay tied to the right phone."
      />

      <LabeledInput
        label="Mobile number"
        value={mobileNumber}
        onChangeText={setMobileNumber}
        keyboardType="phone-pad"
        placeholder="+27 82 000 0000"
      />

      <View style={{ marginBottom: Spacing["3xl"] }}>
        <ThemedText type="small" className="text-text mb-1">
          This device
        </ThemedText>
        <ThemedText type="body" className="text-text-muted">
          {Platform.OS.toUpperCase()} · {String(Platform.Version)}
        </ThemedText>
      </View>

      <Button
        onPress={handleSave}
        disabled={isSaving}
        style={{ width: "100%" }}
      >
        {isSaving ? "Saving..." : "Save changes"}
      </Button>
    </ScreenContainer>
  );
}

