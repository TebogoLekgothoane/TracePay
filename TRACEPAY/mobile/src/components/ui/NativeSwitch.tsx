import { useColorScheme } from "nativewind";
import { Switch } from "react-native";

import { COLORS } from "../../theme/colors";

type Props = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  accessibilityLabel?: string;
};

/** Platform switch for settings toggles (stable in Expo Go). */
export function NativeSwitch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <Switch
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      thumbColor={value ? palette.card : palette.card}
      trackColor={{ false: palette.border, true: palette.primary }}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
