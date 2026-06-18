import { Image, Text, View } from "react-native";

import { cn } from "@/lib/cn";

const logoSource = require("@/assets/images/tracepay-logo__1_-removebg-preview.png");

type TracePayLogoProps = {
  size?: number;
  showWordmark?: boolean;
  layout?: "row" | "column";
  className?: string;
  wordmarkClassName?: string;
};

export function TracePayLogo({
  size = 34,
  showWordmark = true,
  layout = "row",
  className,
  wordmarkClassName,
}: TracePayLogoProps) {
  const isColumn = layout === "column";

  return (
    <View
      className={cn(
        "items-center",
        isColumn ? "flex-col gap-3" : "flex-row gap-2",
        className,
      )}
    >
      <Image
        source={logoSource}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="TracePay logo"
      />
      {showWordmark ? (
        <Text className={cn("font-bold text-gray-900", isColumn ? "text-[28px]" : "text-lg", wordmarkClassName)}>
          TracePay
        </Text>
      ) : null}
    </View>
  );
}
