import { Text, View } from "react-native";

import { Button } from "../ui/Button";

type Props = {
  /** Name the user knows the payment by. */
  name: string;
  kept: boolean;
  onToggle: () => void;
};

/**
 * A recurring payment is not always a leak. This lets the user say they use it, so it stops
 * being counted as one, and lets them change their mind.
 */
export function KeepPaymentCard({ name, kept, onToggle }: Props) {
  return (
    <View className="mt-5 rounded-3xl bg-card p-4">
      <Text className="text-[15px] font-bold text-foreground">
        {kept ? `You marked ${name} as one you use` : `Is ${name} a payment you want?`}
      </Text>
      <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
        {kept
          ? "It no longer counts toward your possible leaks. It stays on your billing calendar."
          : "Recurring payments are not always leaks. If you use this one, mark it and TracePay will stop counting it."}
      </Text>
      <Button className="mt-3" variant={kept ? "outline" : "primary"} onPress={onToggle}>
        {kept ? "Count it as a possible leak again" : "I use this"}
      </Button>
    </View>
  );
}
