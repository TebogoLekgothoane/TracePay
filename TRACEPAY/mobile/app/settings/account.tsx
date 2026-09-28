import { LinearGradient } from "expo-linear-gradient";
import { router, useNavigation } from "expo-router";
import { ChevronLeft, Lock } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { IconButton } from "../../src/components/ui/IconButton";
import { Input } from "../../src/components/ui/Input";
import { AuthError } from "../../src/features/auth/auth.errors";
import {
  FALLBACK_PROFILE_NAME,
  PROFILE_NAME_MAX_LENGTH,
} from "../../src/features/auth/auth.constants";
import { updateCurrentProfile } from "../../src/features/auth/auth.service";
import {
  formatSaPhoneDisplay,
  initialsFromName,
  isValidName,
  sanitizeName,
} from "../../src/features/auth/auth.validation";
import { useProfile } from "../../src/hooks/useProfile";
import { COLORS, TRACEPAY } from "../../src/theme/colors";

function LockedField({
  label,
  value,
  helper,
  emptyLabel,
}: {
  label: string;
  value: string;
  helper: string;
  emptyLabel: string;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-semibold text-foreground">{label}</Text>
      <View className="h-[52px] flex-row items-center rounded-2xl border border-input-border bg-muted px-4">
        <Text
          className="min-w-0 flex-1 text-[16px] text-foreground"
          numberOfLines={1}
        >
          {value || emptyLabel}
        </Text>
        <Lock color={palette.placeholder} size={16} strokeWidth={2.2} />
      </View>
      <Text className="text-[12px] leading-4 text-muted-foreground">{helper}</Text>
    </View>
  );
}

export default function PersonalDetailsScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const trace = TRACEPAY[scheme];
  const { error, loading, profile, retry } = useProfile();

  const [fullName, setFullName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const allowLeaveRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setFullName(
      profile.fullName === FALLBACK_PROFILE_NAME ? "" : profile.fullName,
    );
    setNameError(null);
  }, [profile]);

  const showPlaceholder = loading && !profile;
  const displayPhone = formatSaPhoneDisplay(profile?.phone);
  const previewName =
    sanitizeName(fullName) || profile?.fullName || FALLBACK_PROFILE_NAME;
  const initials = initialsFromName(previewName);

  const baselineName = profile
    ? profile.fullName === FALLBACK_PROFILE_NAME
      ? ""
      : sanitizeName(profile.fullName)
    : "";
  const trimmedName = sanitizeName(fullName);
  const hasChanges = Boolean(profile) && trimmedName !== baselineName;
  const canSave =
    Boolean(profile) &&
    hasChanges &&
    isValidName(fullName) &&
    !saving &&
    !loading;

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (allowLeaveRef.current || !hasChanges || saving) {
        return;
      }

      event.preventDefault();
      Alert.alert(
        "Discard changes?",
        "You have unsaved changes to your personal details.",
        [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              allowLeaveRef.current = true;
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });

    return unsubscribe;
  }, [hasChanges, navigation, saving]);

  const handleBack = () => {
    router.back();
  };

  const handleSave = () => {
    if (!canSave || saving) {
      return;
    }

    if (!isValidName(fullName)) {
      setNameError("Enter your legal full name (2–80 characters).");
      return;
    }

    setNameError(null);
    setSaving(true);

    void (async () => {
      try {
        await updateCurrentProfile({ fullName });
        if (!mountedRef.current) {
          return;
        }
        allowLeaveRef.current = true;
        Alert.alert("Details updated", "Your name has been saved.", [
          { text: "OK", onPress: () => router.back() },
        ]);
      } catch (caught) {
        if (!mountedRef.current) {
          return;
        }
        const message =
          caught instanceof AuthError
            ? caught.message
            : "Could not save your details. Please try again.";
        Alert.alert("Could not save", message);
      } finally {
        if (mountedRef.current) {
          setSaving(false);
        }
      }
    })();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-1">
            <View className="flex-row items-center gap-3">
              <IconButton
                accessibilityLabel="Go back"
                variant="ghost"
                onPress={handleBack}
              >
                <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
              </IconButton>
              <View className="flex-1">
                <Text className="text-[24px] font-bold text-foreground">
                  Personal details
                </Text>
              </View>
            </View>

            {error && !profile ? (
              <View className="mt-5 rounded-2xl bg-destructive/10 px-4 py-3">
                <Text className="text-[14px] text-destructive">{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={loading}
                  hitSlop={8}
                  onPress={retry}
                >
                  <Text className="mt-1 text-[13px] font-semibold text-primary">
                    Retry
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className="mt-4 gap-4 rounded-3xl bg-card p-4">
              <Input
                autoCapitalize="words"
                autoCorrect={false}
                editable={!showPlaceholder && !saving}
                error={nameError}
                label="Full name"
                maxLength={PROFILE_NAME_MAX_LENGTH}
                placeholder="Name and surname"
                returnKeyType="done"
                textContentType="name"
                value={fullName}
                onChangeText={(value) => {
                  setFullName(value);
                  if (nameError) {
                    setNameError(null);
                  }
                }}
              />
              <Text className="-mt-2 text-[12px] leading-4 text-muted-foreground">
                Use the name that matches your banking documents.
              </Text>

              <LockedField
                emptyLabel="No mobile number on file"
                helper="This mobile number is used to sign in to TracePay and cannot be changed from this screen."
                label="Mobile number"
                value={showPlaceholder ? "" : displayPhone}
              />
            </View>

            <Button
              className="mt-8"
              disabled={!canSave}
              loading={saving}
              onPress={handleSave}
              size="md"
            >
              Save changes
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
