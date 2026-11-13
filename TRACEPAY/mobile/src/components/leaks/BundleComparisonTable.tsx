import { useColorScheme } from "nativewind";
import { Text, View } from "react-native";

import {
  BUNDLE_COMPARISON_AS_OF,
  BUNDLE_COMPARISON_DISCLAIMER,
  bundlePricePerGb,
  sortedBundleListings,
} from "../../features/leaks/bundle-comparison";
import { formatRandAmount } from "../../utils/currency";
import { COLORS } from "../../theme/colors";
import { BrandLogo } from "../ui/BrandLogo";
import { neutralCardStyle } from "./LeakFlowShell";

/** Every mobile network and MVNO side by side, cheapest per GB first. */
export function BundleComparisonTable() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const listings = sortedBundleListings();

  return (
    <View>
      <View className="mt-4 overflow-hidden rounded-3xl bg-card" style={neutralCardStyle(palette)}>
        {listings.map((item, index) => (
          <View
            key={item.id}
            className="flex-row items-start gap-3 px-4 py-3.5"
            style={
              index > 0
                ? { borderTopWidth: 1, borderTopColor: neutralCardStyle(palette).borderColor }
                : undefined
            }
          >
            <BrandLogo
              name={item.provider}
              logoDomain={item.logoDomain}
              size={36}
              fallbackColor={palette.primary}
              shape="squircle"
            />
            <View className="min-w-0 flex-1">
              <Text className="text-[14px] font-semibold text-foreground">{item.provider}</Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">{item.plan}</Text>
              <Text className="mt-1.5 text-[12px] leading-[17px] text-muted-foreground">
                {item.note}
              </Text>
              <Text className="mt-1 text-[11px] text-muted-foreground">{item.source}</Text>
            </View>
            <View className="items-end">
              <Text className="text-[15px] font-bold text-foreground">
                {formatRandAmount(item.priceRand)}
              </Text>
              <Text className="mt-0.5 text-[12px] text-muted-foreground">
                {formatRandAmount(Math.round(bundlePricePerGb(item)))}/GB
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="mt-4 rounded-3xl bg-card p-4" style={neutralCardStyle(palette)}>
        <Text className="text-[12px] font-semibold text-foreground">
          About these figures · {BUNDLE_COMPARISON_AS_OF}
        </Text>
        <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {BUNDLE_COMPARISON_DISCLAIMER}
        </Text>
      </View>
    </View>
  );
}
