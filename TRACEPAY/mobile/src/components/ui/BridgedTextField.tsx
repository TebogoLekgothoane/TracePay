import { useColorScheme } from "nativewind";
import { useImperativeHandle, useRef, type Ref } from "react";
import {
  TextInput as RNTextInput,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { COLORS } from "../../theme/colors";

export type BridgedTextFieldRef = {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  isFocused: () => boolean;
};

type BridgedTextFieldProps = {
  value?: string;
  defaultValue?: string;
  onChangeText?: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onSubmitEditing?: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  secureTextEntry?: boolean;
  autoFocus?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  autoComplete?:
    | "name"
    | "email"
    | "password"
    | "new-password"
    | "tel"
    | "off"
    | "username";
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  maxLength?: number;
  caretHidden?: boolean;
  multiline?: boolean;
  hostStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  textStyle?: StyleProp<TextStyle>;
  seedColor?: string;
  inputRef?: Ref<BridgedTextFieldRef>;
  placeholderTextColor?: string;
};

/**
 * Controlled text field with TracePay chrome outside and a stable RN TextInput
 * inside. Avoids Expo UI TextInput/ObservableState crashes in Expo Go.
 */
export function BridgedTextField({
  value,
  defaultValue,
  onChangeText,
  onFocus,
  onBlur,
  onSubmitEditing,
  placeholder,
  editable = true,
  secureTextEntry,
  autoFocus,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  keyboardType,
  returnKeyType,
  maxLength,
  caretHidden,
  multiline,
  hostStyle,
  inputStyle,
  textStyle,
  inputRef,
  placeholderTextColor,
}: BridgedTextFieldProps) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const nativeRef = useRef<RNTextInput>(null);

  useImperativeHandle(
    inputRef,
    () => ({
      focus: () => {
        nativeRef.current?.focus();
      },
      blur: () => {
        nativeRef.current?.blur();
      },
      clear: () => {
        nativeRef.current?.clear();
      },
      isFocused: () => nativeRef.current?.isFocused() ?? false,
    }),
    [],
  );

  return (
    <RNTextInput
      ref={nativeRef}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      autoCorrect={autoCorrect}
      autoFocus={autoFocus}
      caretHidden={caretHidden}
      defaultValue={value === undefined ? defaultValue : undefined}
      editable={editable}
      keyboardType={keyboardType}
      maxLength={maxLength}
      multiline={multiline}
      placeholder={placeholder}
      placeholderTextColor={placeholderTextColor ?? palette.placeholder}
      returnKeyType={returnKeyType}
      secureTextEntry={secureTextEntry}
      style={[
        {
          flex: 1,
          height: 52,
          color: palette.foreground,
          fontSize: 16,
          padding: 0,
        },
        hostStyle as StyleProp<TextStyle>,
        inputStyle,
        textStyle,
      ]}
      value={value}
      onBlur={onBlur}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onSubmitEditing={
        onSubmitEditing
          ? (event) => onSubmitEditing(event.nativeEvent.text)
          : undefined
      }
    />
  );
}
