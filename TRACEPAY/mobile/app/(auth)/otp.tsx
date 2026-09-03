import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/hooks/useAuth";
import { Button } from "../../src/components/ui/Button";
import { OTPInput } from "../../src/components/ui/OTPInput";

export default function Screen() {
  const { error, resendPhone, setError, submitting, verifyPhone } = useAuth();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = typeof params.phone === "string" ? params.phone : undefined;
  const [code, setCode] = useState("");
  const verifyingRef = useRef(false);

  const handleVerify = useCallback(async (nextCode = code) => {
    if (verifyingRef.current || nextCode.replace(/\D/g, "").length < 6) {
      return;
    }

    verifyingRef.current = true;
    try {
      await verifyPhone(nextCode, phone);
      router.replace("/(auth)/device-security");
    } catch {
      return;
    } finally {
      verifyingRef.current = false;
    }
  }, [code, phone, verifyPhone]);

  const handleResend = async () => {
    try {
      await resendPhone(phone);
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
          <OTPInput
            editable={!submitting}
            value={code}
            onChange={setCode}
            onComplete={(nextCode) => {
              void handleVerify(nextCode);
            }}
          />
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
