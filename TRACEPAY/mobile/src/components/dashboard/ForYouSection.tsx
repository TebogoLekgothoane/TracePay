import * as Haptics from "expo-haptics";
import { Sparkles } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import type { ForYouCard } from "../../features/for-you/for-you.types";
import { COLORS } from "../../theme/colors";
import { Button } from "../ui/Button";
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
    <View className="rounded-[28px] bg-card px-5 py-5">
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
        <Button variant="muted" accessibilityLabel={card.actionLabel} onPress={() => onAction(card)}>
          {card.actionLabel}
        </Button>
        <Button
          variant="muted"
          accessibilityLabel={`Ignore ${card.title}`}
          onPress={() => {
            void Haptics.selectionAsync();
            onIgnore(card.id);
          }}
        >
          Ignore
        </Button>
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
