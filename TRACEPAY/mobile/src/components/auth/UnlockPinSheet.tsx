import * as Haptics from "expo-haptics";
import { ScanFace } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import {
	type ReactElement,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	ActivityIndicator,
	Keyboard,
	Platform,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PIN_LENGTH } from "../../features/security/security.constants";
import type { BiometricKind } from "../../features/security/security.types";
import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";

type Props = {
	errorMessage?: string | null;
	resetKey?: number;
	isBusy?: boolean;
	biometricKind?: BiometricKind | null;
	onBiometricPress?: () => void;
	onComplete: (pin: readonly number[]) => Promise<void>;
	onForgotPin: () => void;
	onClearError?: () => void;
};

export function UnlockPinSheet({
	errorMessage,
	resetKey = 0,
	isBusy = false,
	biometricKind = null,
	onBiometricPress,
	onComplete,
	onForgotPin,
	onClearError,
}: Props): ReactElement {
	const { colorScheme } = useColorScheme();
	const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
	const [value, setValue] = useState("");
	const [isFocused, setIsFocused] = useState(false);
	const submittingRef = useRef(false);
	const inputRef = useRef<TextInput>(null);
	const keepKeyboardRef = useRef(false);
	const shake = useSharedValue(0);
	const insets = useSafeAreaInsets();
	const showBiometric = Boolean(biometricKind && onBiometricPress);

	useEffect(() => {
		if (resetKey === 0) {
			return;
		}

		shake.value = withSequence(
			withTiming(-8, { duration: 55 }),
			withTiming(8, { duration: 70 }),
			withTiming(-5, { duration: 60 }),
			withTiming(0, { duration: 55 }),
		);
		setValue("");
		submittingRef.current = false;

		if (keepKeyboardRef.current) {
			const refocusTimer = setTimeout(() => {
				inputRef.current?.focus();
			}, 40);
			return () => clearTimeout(refocusTimer);
		}
	}, [resetKey, shake]);

	const digitsStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: shake.value }],
	}));

	const focusInput = () => {
		if (isBusy) {
			return;
		}
		keepKeyboardRef.current = true;
		setTimeout(() => {
			inputRef.current?.focus();
		}, 0);
	};

	const handleChangeText = (nextValue: string) => {
		if (isBusy || submittingRef.current) {
			return;
		}

		const digitsOnly = nextValue.replace(/\D/g, "").slice(0, PIN_LENGTH);

		if (errorMessage && digitsOnly !== value) {
			onClearError?.();
		}

		if (digitsOnly.length > value.length) {
			void Haptics.selectionAsync();
		}

		setValue(digitsOnly);

		if (digitsOnly.length === PIN_LENGTH) {
			submittingRef.current = true;
			const pin = digitsOnly.split("").map((digit) => Number(digit));
			void onComplete(pin).catch(() => {
				submittingRef.current = false;
				setValue("");
			});
		}
	};

	return (
		<View
			className="relative px-6 pt-2.5"
			style={{ paddingBottom: Math.max(insets.bottom, 16) }}
		>
			<Pressable className="w-full" onPress={focusInput}>
				<View className="mb-3.5 items-center">
					<View className="h-1 w-[42px] rounded-sm bg-foreground/15 dark:bg-primary-foreground/20" />
				</View>

				<Text className="text-center text-2xl font-bold tracking-[-0.6px] text-foreground">
					Enter your PIN
				</Text>
				<Text className="mt-1.5 text-center text-sm leading-5 text-muted-foreground">
					{isFocused
						? "Use your PIN to unlock TracePay"
						: "Tap here to enter your PIN"}
				</Text>
			</Pressable>

			<View className="relative mt-7 min-h-[58px] justify-center">
				<Animated.View
					className="flex-row justify-center gap-3"
					pointerEvents="none"
					style={digitsStyle}
				>
					{Array.from({ length: PIN_LENGTH }, (_, index) => {
						const digit = value[index];
						const hasError =
							Boolean(errorMessage) && value.length === PIN_LENGTH;
						const isActive =
							isFocused && index === value.length && value.length < PIN_LENGTH;

						return (
							<View
								key={index}
								className={`h-[58px] w-[52px] items-center justify-center rounded-[14px] border-[1.5px] bg-transparent ${hasError
										? "border-destructive"
										: isActive
											? "border-primary"
											: "border-input-border"
									}`}
							>
								<Text
									className={`text-2xl font-semibold tracking-[0.5px] ${hasError ? "text-destructive" : "text-foreground"
										}`}
								>
									{digit ?? ""}
								</Text>
							</View>
						);
					})}
				</Animated.View>
				<TextInput
					autoCapitalize="none"
					autoCorrect={false}
					blurOnSubmit={false}
					caretHidden
					collapsable={false}
					contextMenuHidden
					editable={!isBusy}
					importantForAutofill="no"
					keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
					maxLength={PIN_LENGTH}
					onBlur={() => {
						setIsFocused(false);
						keepKeyboardRef.current = false;
					}}
					onChangeText={handleChangeText}
					onFocus={() => {
						setIsFocused(true);
						keepKeyboardRef.current = true;
					}}
					ref={inputRef}
					showSoftInputOnFocus
					className="absolute bottom-0 left-0 right-0 top-0 z-[1] bg-transparent text-transparent opacity-[0.01]"
					textContentType="oneTimeCode"
					underlineColorAndroid="transparent"
					value={value}
				/>
			</View>

			<View className="mt-2.5 h-7 items-center justify-center">
				{isBusy ? (
					<ActivityIndicator color={palette.primary} size="small" />
				) : (
					<Text
						accessibilityLiveRegion="polite"
						className={`text-[13px] font-medium text-destructive ${errorMessage ? "opacity-100" : "opacity-0"
							}`}
					>
						{errorMessage ?? " "}
					</Text>
				)}
			</View>

			{showBiometric ? (
				<Button
					accessibilityLabel="Use Face ID"
					className="mt-1 self-center bg-key-pressed/13"
					disabled={isBusy}
					size="sm"
					variant="muted"
					onPress={() => {
						Keyboard.dismiss();
						onBiometricPress?.();
					}}
				>
					<>
						<ScanFace color={palette.primary} size={20} strokeWidth={2} />
						<Text className="text-sm font-semibold text-primary">
							Use Face ID
						</Text>
					</>
				</Button>
			) : null}

			<Button
				accessibilityRole="link"
				className="mt-1 self-center"
				disabled={isBusy}
				size="sm"
				variant="ghost"
				onPress={() => {
					Keyboard.dismiss();
					onForgotPin();
				}}
			>
				Reset PIN
			</Button>
		</View>
	);
}
