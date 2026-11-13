import { Pressable, Text, View } from "react-native";

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  /** Stretch to the container width with equal-width segments. */
  fill?: boolean;
};

/** Compact two- or three-way switch for flipping a card between views. */
export function SegmentToggle<T extends string>({ value, options, onChange, fill }: Props<T>) {
  return (
    <View className="flex-row rounded-full bg-muted p-1">
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            className={`rounded-full ${fill ? "flex-1 items-center py-3" : "px-3 py-1.5"} ${selected ? "bg-card" : ""}`}
          >
            <Text
              className={`${fill ? "text-[15px]" : "text-[12px]"} ${selected ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
