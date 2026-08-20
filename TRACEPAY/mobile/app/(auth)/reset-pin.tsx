import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "../../src/theme/colors";

const CODE_LENGTH = 6;

export default function ResetPinScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [code, setCode] = useState("");
  const verifyingRef = useRef(false);

  const verify = () => {
    if (verifyingRef.current) {
      return;
    }
    verifyingRef.current = true;
    router.replace("/(auth)/reset-pin-create");
  };

  const handleChangeText = (nextValue: string) => {
    if (verifyingRef.current) {
      return;
    }

    const digitsOnly = nextValue.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digitsOnly);

    if (digitsOnly.length === CODE_LENGTH) {
      verify();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center px-6 pb-5">
        <Pressable
          accessibilityLabel="Back to unlock"
          onPress={() => router.replace("/(auth)/unlock")}
          className="h-[42px] w-[42px] items-center justify-center self-start active:opacity-70"
        >
          <Ionicons color={palette.mutedForeground} name="chevron-back" size={24} />
        </Pressable>

        <View className="mt-[72px] h-[92px] w-[92px] items-center justify-center">
          <Ionicons color={palette.primary} name="shield-checkmark-outline" size={42} />
        </View>

        <Text className="mt-[26px] text-[28px] font-bold tracking-[-0.6px] text-foreground">
          Reset PIN
        </Text>
        <Text className="mt-2.5 max-w-[330px] text-center text-[14px] leading-[21px] text-muted-foreground">
          Enter the 6-digit verification code sent to your registered phone
          number.
        </Text>

        <TextInput
          accessibilityLabel="Verification code"
          autoFocus
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          onChangeText={handleChangeText}
          placeholder="000000"
          placeholderTextColor={palette.placeholder}
          className="mt-[38px] h-[60px] w-[258px] rounded-2xl border-[1.5px] border-input-border bg-input pl-[25px] text-center text-[25px] font-semibold tracking-[18px] text-foreground"
          value={code}
        />

        <Pressable className="p-4 active:opacity-70">
          <Text className="text-[14px] font-semibold text-primary">
            Resend code
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
