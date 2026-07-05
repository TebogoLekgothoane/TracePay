import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { AppText } from "@/components/Typography";
import { useColorScheme } from "@/hooks/useColorScheme";
import { hunterLogoUrl } from "@/constants/merchants";
import type { PartnerDeal } from "@/constants/partners";

type PartnerDealCardProps = {
  partner: PartnerDeal;
  pointsBalance: number;
  className?: string;
};

function PartnerDealLogo({ name, logoDomain }: { name: string; logoDomain: string }) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(logoDomain) && !failed;

  useEffect(() => {
    setFailed(false);
  }, [logoDomain]);

  if (!showLogo) {
    return (
      <View className="h-10 w-10 items-center justify-center">
        <AppText variant="title" className="text-muted-foreground">
          {name.slice(0, 1).toUpperCase()}
        </AppText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: hunterLogoUrl(logoDomain) }}
      style={{ width: 40, height: 40 }}
      contentFit="contain"
      cachePolicy="disk"
      onError={() => setFailed(true)}
      accessibilityLabel={`${name} logo`}
    />
  );
}

export function PartnerDealCard({ partner, pointsBalance, className }: PartnerDealCardProps) {
  const { colors } = useColorScheme();
  const canRedeem = pointsBalance >= partner.pts;

  return (
    <Card className={className ?? "w-[140px]"} contentClassName="items-center gap-0">
      <View className="mb-1 h-12 items-center justify-center">
        <PartnerDealLogo name={partner.name} logoDomain={partner.logoDomain} />
      </View>
      <AppText variant="label" className="mb-0.5 text-center" numberOfLines={1}>
        {partner.name}
      </AppText>
      <AppText variant="caption" className="mb-2 text-center leading-4" numberOfLines={2}>
        {partner.offer}
      </AppText>
      <View className="mb-2.5 flex-row items-center gap-[3px]">
        <MaterialCommunityIcons name="star-circle-outline" size={12} color={colors.primary} />
        <AppText variant="caption" className="text-brand-purple dark:text-primary">
          {partner.pts} pts
        </AppText>
      </View>
      <Button
        size="sm"
        fullWidth
        disabled={!canRedeem}
        className="rounded-lg py-[7px]"
        variant={canRedeem ? "primary" : "outline"}
      >
        {canRedeem ? "Redeem" : "Need more pts"}
      </Button>
    </Card>
  );
}
