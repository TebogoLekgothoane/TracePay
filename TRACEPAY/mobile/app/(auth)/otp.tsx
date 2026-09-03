import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/hooks/useAuth";
import { Button } from "../../src/components/ui/Button";
import { OTPInput } from "../../src/components/ui/OTPInput";

export default function Screen() {
  const { error, resendPhone, setError, submitting, verifyPhone } = useAuth();
  const [code, setCode] = useState("");

  const handleVerify = async () => {
    try {
      await verifyPhone(code);
      router.replace("/(auth)/device-security");
    } catch {
      return;
    }
  };

  const handleResend = async () => {
    try {
      await resendPhone();
      setCode("");
    } catch {
      return;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-7 pt-10">
        <Text className="text-center text-[28px] font-bold text-foreground">
          Verify your phone
        </Text>
        <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
          Enter the 6-digit code sent to your phone.
        </Text>

        <View className="mt-10">
          <OTPInput editable={!submitting} value={code} onChange={setCode} />
        </View>

        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="mt-4 text-center text-[13px] text-destructive"
          >
            {error}
          </Text>
        ) : null}

        <View className="mt-auto gap-3 pb-8">
          <Button
            disabled={code.replace(/\D/g, "").length < 6}
            loading={submitting}
            onPress={() => {
              void handleVerify();
            }}
          >
            Continue
          </Button>
          <Pressable
            accessibilityRole="button"
            disabled={submitting}
            hitSlop={8}
            onPress={() => {
              void handleResend();
            }}
          >
            <Text className="text-center text-[14px] font-semibold text-primary">
              Resend code
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
