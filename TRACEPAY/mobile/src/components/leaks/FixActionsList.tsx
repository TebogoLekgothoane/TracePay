import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { FixSection } from "../../features/leaks/fixContent";
import { COLORS, type ImpactTone, getImpactToneStyles } from "../../theme/colors";

type Props = {
  leakId: string;
  sections: FixSection[];
  impact: ImpactTone;
};

export function FixActionsList({ leakId, sections, impact }: Props) {
  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const tone = getImpactToneStyles(scheme, impact);

  return (
    <View className="gap-5">
      {sections.map((section) => (
        <View key={section.title}>
          <Text className="mb-2 text-[13px] font-semibold text-muted-foreground">
            {section.title}
          </Text>
          <View className="gap-2">
            {section.actions.map((action) => (
              <Pressable
                key={action.id}
                onPress={() => {
                  if (action.hasDetailFlow) {
                    router.push(`/leak/${leakId}/fix/${action.id}`);
                  }
                }}
                className="flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
              >
                <View
                  className="h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: tone.surface }}
                >
                  <action.Icon color={tone.color} size={18} strokeWidth={2.2} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-foreground">
                    {action.title}
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-muted-foreground">
                    Potential saving:{" "}
                    <Text className="font-semibold" style={{ color: tone.color }}>
                      {action.potentialSaving}
                    </Text>
                  </Text>
                </View>
                <ChevronRight color={palette.placeholder} size={16} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}
