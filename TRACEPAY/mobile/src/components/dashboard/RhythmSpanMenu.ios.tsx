import { Button, Host, Menu } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  controlSize,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "nativewind";

import { RHYTHM_SPANS, type RhythmSpan } from "../../features/dashboard/spending-rhythm";
import { COLORS } from "../../theme/colors";

type Props = {
  span: RhythmSpan;
  onSpanChange: (span: RhythmSpan) => void;
};

/** Liquid glass SwiftUI menu for the chart period. Tapping it drops the options down. */
export function RhythmSpanMenu({ span, onSpanChange }: Props) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const palette = COLORS[isDark ? "dark" : "light"];

  return (
    <Host
      matchContents
      colorScheme={isDark ? "dark" : "light"}
      style={{ height: 34 }}
    >
      <Menu
        label={span}
        systemImage="chevron.down"
        modifiers={[
          buttonStyle("glass"),
          controlSize("small"),
          tint(palette.foreground),
          accessibilityLabel("Choose how many months to show"),
        ]}
      >
        {RHYTHM_SPANS.map((value) => (
          <Button
            key={value}
            label={value}
            systemImage={value === span ? "checkmark" : undefined}
            onPress={() => onSpanChange(value)}
          />
        ))}
      </Menu>
    </Host>
  );
}
