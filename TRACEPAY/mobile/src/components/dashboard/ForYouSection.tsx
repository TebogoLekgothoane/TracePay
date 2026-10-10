import * as Haptics from "expo-haptics";
import { Sparkles } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import type { ForYouCard } from "../../features/for-you/for-you.types";
import { COLORS } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";

type Props = {
  cards: ForYouCard[];
  onAction: (card: ForYouCard) => void;
  onIgnore: (cardId: string) => void;
};

function ForYouInsightCard({
  card,
  iconColor,
  onAction,
  onIgnore,
}: {
  card: ForYouCard;
  iconColor: string;
  onAction: (card: ForYouCard) => void;
  onIgnore: (cardId: string) => void;
}) {
  return (
    <View className="rounded-[28px] border border-border/70 bg-card px-5 py-5">
      <View className="flex-row items-center gap-2.5">
        {card.brands.map((brand) => (
          <BrandLogo
            key={brand.id}
            name={brand.name}
            logoDomain={brand.logoDomain}
            size={28}
            shape="squircle"
          />
        ))}
      </View>

      <Text className="mt-4 text-[18px] font-semibold leading-6 text-foreground">
        {card.title}
      </Text>
      <Text className="mt-1.5 text-[14px] leading-5 text-muted-foreground">
        {card.subtitle}
      </Text>

      <View className="mt-5 flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={card.actionLabel}
          className="flex-row items-center gap-1.5 rounded-full bg-muted px-4 py-2.5 active:opacity-75"
          onPress={() => onAction(card)}
        >
          <Sparkles color={iconColor} size={14} strokeWidth={2.2} />
          <Text className="text-[13px] font-semibold text-foreground">
            {card.actionLabel}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ignore ${card.title}`}
          className="rounded-full bg-muted px-4 py-2.5 active:opacity-75"
          onPress={() => {
            void Haptics.selectionAsync();
            onIgnore(card.id);
          }}
        >
          <Text className="text-[13px] font-semibold text-foreground">
            Ignore
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ForYouSection({ cards, onAction, onIgnore }: Props) {
  const { colorScheme } = useColorScheme();
  const iconColor = COLORS[colorScheme === "dark" ? "dark" : "light"].foreground;

  if (cards.length === 0) {
    return null;
  }

  return (
    <View>
      <Text className="mb-3 text-[17px] font-bold text-foreground">For you</Text>
      <View className="gap-3">
        {cards.map((card) => (
          <ForYouInsightCard
            key={card.id}
            card={card}
            iconColor={iconColor}
            onAction={onAction}
            onIgnore={onIgnore}
          />
        ))}
      </View>
    </View>
  );
}
