import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useColorScheme } from "nativewind";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../src/components/ui/Button";
import { BridgedTextField } from "../../src/components/ui/BridgedTextField";
import { IconButton } from "../../src/components/ui/IconButton";
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
        <IconButton
          accessibilityLabel="Back to unlock"
          className="self-start"
          variant="ghost"
          onPress={() => router.replace("/(auth)/unlock")}
        >
          <Ionicons color={palette.mutedForeground} name="chevron-back" size={24} />
        </IconButton>

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

        <View className="mt-[38px] h-[60px] w-[258px] overflow-hidden rounded-2xl border-[1.5px] border-input-border bg-input">
          <BridgedTextField
            autoFocus
            hostStyle={{ height: 60, width: 258 }}
            inputStyle={{
              height: 60,
              width: 258,
              backgroundColor: "transparent",
              borderWidth: 0,
              paddingHorizontal: 25,
            }}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            placeholder="000000"
            textStyle={{
              fontSize: 25,
              fontWeight: "600",
              letterSpacing: 18,
              textAlign: "center",
            }}
            value={code}
            onChangeText={handleChangeText}
          />
        </View>

        <Button size="sm" variant="ghost">
          Resend code
        </Button>
      </View>
    </SafeAreaView>
  );
}
