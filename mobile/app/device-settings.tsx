import React, { useEffect, useState } from "react";
import { View, TextInput, StyleSheet, Alert, Platform, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { Button } from "@/components/ui/button";
import { Spacing, BorderRadius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme-color";
import { Feather } from "@expo/vector-icons";

const MOBILE_KEY = "@tracepay_mobile";

export default function DeviceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { theme } = useTheme();

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
            Mobile &amp; device
          </ThemedText>
        </View>
        <ThemedText type="body" className="text-text-muted">
          Keep your contact details up to date so TracePay can stay tied to the right phone.
        </ThemedText>
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <ThemedText type="small" className="text-text mb-1">
          Mobile number
        </ThemedText>
        <TextInput
          value={mobileNumber}
          onChangeText={setMobileNumber}
          keyboardType="phone-pad"
          placeholder="+27 82 000 0000"
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
          This device
        </ThemedText>
        <ThemedText type="body" className="text-text-muted">
          {Platform.OS.toUpperCase()} · {Platform.Version}
        </ThemedText>
      </View>

      <Button
        onPress={handleSave}
        disabled={isSaving}
        style={{ width: "100%" }}
      >
        {isSaving ? "Saving..." : "Save changes"}
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

