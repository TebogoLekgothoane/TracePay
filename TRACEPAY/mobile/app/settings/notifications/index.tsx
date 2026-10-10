import { router } from "expo-router";
import { Bell, ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../../src/components/ui/Button";
import { IconButton } from "../../../src/components/ui/IconButton";
import { guidanceHref } from "../../../src/features/guidance/finding-guidance.model";
import { useFindingNotifications } from "../../../src/hooks/useFindingNotifications";
import { COLORS } from "../../../src/theme/colors";

function formatNoticeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function FindingNotificationsScreen() {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const { notifications, loading, error, markingId, retry, markRead } = useFindingNotifications();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={() => router.back()}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <View className="flex-1">
              <Text className="text-[24px] font-bold text-foreground">Notifications</Text>
              <Text className="mt-0.5 text-[14px] text-muted-foreground">
                New and changed findings from statement imports
              </Text>
            </View>
          </View>

          {loading ? (
            <View className="mt-10 items-center">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : null}

          {error ? (
            <View className="mt-6 rounded-2xl bg-card px-4 py-4">
              <Text className="text-[15px] text-foreground">{error}</Text>
              <Button className="mt-3" variant="outline" onPress={() => void retry()}>
                Try again
              </Button>
            </View>
          ) : null}

          {!loading && !error && notifications.length === 0 ? (
            <View className="mt-6 items-center rounded-2xl bg-card px-4 py-8">
              <Bell color={palette.primary} size={28} strokeWidth={2} />
              <Text className="mt-3 text-center text-[15px] font-semibold text-foreground">
                No notifications yet
              </Text>
              <Text className="mt-1 text-center text-[13px] leading-5 text-muted-foreground">
                New and changed findings appear here after a statement import.
              </Text>
            </View>
          ) : null}

          <View className="mt-5 gap-3">
            {notifications.map((notification) => {
              const unread = notification.deliveryStatus === "created";
              return (
                <Pressable
                  key={notification.id}
                  accessibilityRole="button"
                  disabled={markingId === notification.id}
                  onPress={() => {
                    void (async () => {
                      const opened = unread ? await markRead(notification) : true;
                      if (opened) {
                        router.push(guidanceHref(notification.findingId) as never);
                      }
                    })();
                  }}
                  className="rounded-2xl bg-card px-4 py-3.5 active:opacity-75"
                >
                  <View className="flex-row items-start gap-3">
                    <View
                      className={`mt-1.5 h-2.5 w-2.5 rounded-full ${unread ? "bg-primary" : "bg-transparent"}`}
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[15px] font-semibold text-foreground">
                        {notification.title}
                      </Text>
                      <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
                        {notification.body}
                      </Text>
                      <Text className="mt-2 text-[12px] text-muted-foreground">
                        {formatNoticeDate(notification.createdAt)} · {unread ? "Unread" : "Read"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
