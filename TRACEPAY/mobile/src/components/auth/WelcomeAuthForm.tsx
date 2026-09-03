import { useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

import {
  isValidName,
  isValidPassword,
  isValidSaPhone,
} from "../../features/auth/auth.validation";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { PasswordInput } from "../ui/PasswordInput";
import { PhoneInput } from "./PhoneInput";

export type WelcomeAuthMode = "create" | "login" | "forgot";

export type WelcomeAuthPayload = {
  name?: string;
  phone: string;
  password: string;
};

type FieldErrors = {
  name?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
};

type Props = {
  mode: WelcomeAuthMode;
  submitting: boolean;
  reveal: SharedValue<number>;
  error?: string | null;
  onSubmit: (payload: WelcomeAuthPayload) => void;
  onSwitchMode: (mode: WelcomeAuthMode) => void;
};

function RevealRow({
  index,
  reveal,
  children,
}: {
  index: number;
  reveal: SharedValue<number>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const start = 0.28 + index * 0.1;
    const t = interpolate(
      reveal.value,
      [start, Math.min(1, start + 0.18)],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * 16 }],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function WelcomeAuthForm({
  mode,
  submitting,
  reveal,
  error,
  onSubmit,
  onSwitchMode,
}: Props) {
  const isCreate = mode === "create";
  const isForgot = mode === "forgot";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    setErrors({});
    setResetSent(false);
  }, [mode]);

  const canSubmit = isForgot
    ? isValidSaPhone(phone)
    : isCreate
      ? isValidName(name) &&
        isValidSaPhone(phone) &&
        isValidPassword(password) &&
        password === confirmPassword
      : isValidSaPhone(phone) && password.length > 0;

  const submit = () => {
    if (submitting) {
      return;
    }

    const nextErrors: FieldErrors = {};

    if (isCreate && !isValidName(name)) {
      nextErrors.name = "Enter your full name.";
    }

    if (!isValidSaPhone(phone)) {
      nextErrors.phone = "Enter a valid SA mobile number (9 digits after +27).";
    }

    if (isCreate && !isValidPassword(password)) {
      nextErrors.password = "Use at least 8 characters.";
    }

    if (!isCreate && !isForgot && !password) {
      nextErrors.password = "Enter your password.";
    }

    if (isCreate && password !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (isForgot) {
      setResetSent(true);
      return;
    }

    onSubmit({
      name: isCreate ? name.trim() : undefined,
      phone,
      password,
    });
  };

  return (
    <View className="gap-3.5">
      <RevealRow index={0} reveal={reveal}>
        <View className="mb-1 items-center">
          <Text className="text-center text-[24px] font-bold text-foreground">
            {isForgot
              ? "Forgot password"
              : isCreate
                ? "Create your account"
                : "Log in"}
          </Text>
          <Text className="mt-1.5 text-center text-[14px] text-muted-foreground">
            {isForgot
              ? "Enter the phone number on your account. We'll send a reset code if it exists."
              : isCreate
                ? "Set up TracePay with your name, phone number, and a secure password."
                : "Use the phone number and password from when you created your account."}
          </Text>
        </View>
      </RevealRow>

      {isCreate ? (
        <RevealRow index={1} reveal={reveal}>
          <Input
            autoCapitalize="words"
            autoComplete="name"
            editable={!submitting}
            error={errors.name}
            icon="person-outline"
            label="Full name"
            onChangeText={(value) => {
              setName(value);
              setErrors((current) => ({ ...current, name: undefined }));
            }}
            placeholder="Your full name"
            textContentType="name"
            value={name}
          />
        </RevealRow>
      ) : null}

      <RevealRow index={isCreate ? 2 : 1} reveal={reveal}>
        <PhoneInput
          autoComplete="tel"
          editable={!submitting}
          error={errors.phone}
          onChangeText={(value) => {
            setPhone(value);
            setErrors((current) => ({ ...current, phone: undefined }));
          }}
          value={phone}
        />
      </RevealRow>

      {!isForgot ? (
      <RevealRow index={isCreate ? 3 : 2} reveal={reveal}>
        <PasswordInput
          autoCapitalize="none"
          autoComplete={isCreate ? "new-password" : "password"}
          autoCorrect={false}
          editable={!submitting}
          error={errors.password}
          label="Password"
          onChangeText={(value) => {
            setPassword(value);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          placeholder={isCreate ? "At least 8 characters" : "Your password"}
          textContentType={isCreate ? "newPassword" : "password"}
          value={password}
        />
        {!isCreate ? (
          <Pressable
            accessibilityRole="button"
            className="mt-2 self-end"
            hitSlop={8}
            onPress={() => onSwitchMode("forgot")}
          >
            <Text className="text-[13px] font-semibold text-primary">
              Forgot your password?
            </Text>
          </Pressable>
        ) : null}
      </RevealRow>
      ) : null}

      {isCreate ? (
        <RevealRow index={4} reveal={reveal}>
          <PasswordInput
            autoCapitalize="none"
            autoComplete="new-password"
            autoCorrect={false}
            editable={!submitting}
            error={errors.confirmPassword}
            icon="lock-closed-outline"
            label="Confirm password"
            onChangeText={(value) => {
              setConfirmPassword(value);
              setErrors((current) => ({
                ...current,
                confirmPassword: undefined,
              }));
            }}
            placeholder="Re-enter password"
            textContentType="newPassword"
            value={confirmPassword}
          />
        </RevealRow>
      ) : null}

      <RevealRow index={isCreate ? 5 : 3} reveal={reveal}>
        <View>
          {error && !isForgot ? (
            <Text className="mb-3 text-center text-[13px] text-destructive">
              {error}
            </Text>
          ) : null}
          {isForgot && resetSent ? (
            <Text className="mb-3 text-center text-[13px] text-muted-foreground">
              If that number is registered, we'll send a reset code shortly.
            </Text>
          ) : null}
          <Button
            arrow
            className="mt-1"
            disabled={!canSubmit || (isForgot && resetSent)}
            gradient
            loading={submitting && !isForgot}
            onPress={submit}
          >
          {isForgot ? "Send reset code" : isCreate ? "Create Account" : "Log In"}
        </Button>
        </View>
      </RevealRow>

      <RevealRow index={isCreate ? 6 : 4} reveal={reveal}>
        <View className="mt-2 items-center gap-4">
          {isForgot ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onSwitchMode("login")}
            >
              <Text className="text-center text-[14px] text-muted-foreground">
                Remembered it?{" "}
                <Text className="font-semibold text-primary">Log in</Text>
              </Text>
            </Pressable>
          ) : (
            <>
          <View className="w-full flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border" />
            <Text className="text-[13px] text-muted-foreground">or</Text>
            <View className="h-px flex-1 bg-border" />
          </View>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onSwitchMode(isCreate ? "login" : "create")}
          >
            <Text className="text-center text-[14px] text-muted-foreground">
              {isCreate ? "Already have an account? " : "New here? "}
              <Text className="font-semibold text-primary">
                {isCreate ? "Log in" : "Create an account"}
              </Text>
            </Text>
          </Pressable>
            </>
          )}
        </View>
      </RevealRow>
    </View>
  );
}
