import { MenuView, type MenuAction } from "@expo/ui/community/menu";
import { ChevronDown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import { COLORS } from "../../theme/colors";

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** Used by screen readers, e.g. "Group trend by". */
  accessibilityLabel: string;
};

/**
 * A pill that opens the same native menu as DocumentActionsMenu (SwiftUI on iOS, Material on
 * Android) so the user picks one option from a short list. The current choice is ticked.
 */
export function ChoiceMenu<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const actions: MenuAction[] = options.map((option) => ({
    id: option,
    title: option,
    state: option === value ? "on" : "off",
  }));

  return (
    <View className="shrink-0">
      <MenuView
        actions={actions}
        onPressAction={({ nativeEvent }) => {
          const next = options.find((option) => option === nativeEvent.event);
          if (next && next !== value) onChange(next);
        }}
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${accessibilityLabel}, ${value}`}
          className="flex-row items-center gap-1 rounded-full bg-muted px-3.5 py-2"
        >
          <Text className="text-[13px] font-medium text-foreground">{value}</Text>
          <ChevronDown color={palette.mutedForeground} size={14} strokeWidth={2} />
        </View>
      </MenuView>
    </View>
  );
}
