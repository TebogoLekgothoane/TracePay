import { Bell } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import TracePayIcon from "../../../assets/icons/assembled TracePay icon.svg";
import { COLORS, withAlpha } from "../../theme/colors";

type Props = {
  greeting: string;
  name: string;
  initials: string;
  hasUnreadNotifications: boolean;
  onNotificationsPress: () => void;
};

export function HomeHeader({
  greeting,
  name,
  initials,
  hasUnreadNotifications,
  onNotificationsPress,
  
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];

  return (
    <View className="mb-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <TracePayIcon width={30} height={26} />
          <Text className="text-[20px] font-bold tracking-[-0.4px] text-foreground">
            TracePay
          </Text>
        </View>

        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hasUnreadNotifications ? "Notifications, unread" : "Notifications"
            }
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            onPress={onNotificationsPress}
          >
            <Bell color={palette.foreground} size={22} strokeWidth={2} />
            {hasUnreadNotifications ? (
              <View
                className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: palette.accent,
                  borderWidth: 2,
                  borderColor: palette.background,
                }}
              />
            ) : null}
          </Pressable>
        </View>
      </View>

      <View className="mt-4 px-2.5">
        <Text className="text-[16px] font-medium text-muted-foreground" numberOfLines={1}>
          {greeting}
        </Text>
        {name ? (
          <Text
            className="text-[30px] font-bold tracking-[-0.5px] text-foreground"
            numberOfLines={1}
          >
            {name}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
