import React, { useState } from "react";
import { View, Pressable, Modal, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedView } from "@/components/themed-view";
import { ThemedText } from "@/components/themed-text";
import { useApp } from "@/context/app-context";
import { useTheme } from "@/hooks/use-theme-color";
import { Spacing, Colors, BorderRadius } from "@/constants/theme";
import { getSubscriptionLogo } from "@/lib/subscription-logos";
import type { Subscription } from "@/types/app";

const NAVY = "#1e40af";
const navyTint = "rgba(30, 64, 175, 0.15)";

function SubscriptionRow({
  subscription,
  onPress,
  index,
}: {
  subscription: Subscription;
  onPress: () => void;
  index: number;
}) {
  const { theme, isDark } = useTheme();
  const { t } = useApp();
  const activeColor = NAVY;
  const optedOutColor = isDark ? Colors.dark.hopeGreen : Colors.light.hopeGreen;
  const isActive = !subscription.isOptedOut;
  const logo = getSubscriptionLogo(subscription.name);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View
      entering={FadeInDown.delay(100 + index * 40).springify()}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: Spacing.lg,
        borderRadius: BorderRadius.lg,
        backgroundColor: theme.backgroundSecondary,
        borderWidth: 1,
        borderLeftWidth: 4,
        borderColor: theme.backgroundTertiary,
        borderLeftColor: isActive ? activeColor : optedOutColor,
        marginBottom: Spacing.md,
      }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: BorderRadius.md,
          backgroundColor: (isActive ? activeColor : optedOutColor) + "22",
          alignItems: "center",
          justifyContent: "center",
          marginRight: Spacing.md,
          overflow: "hidden",
        }}
      >
        {logo ? (
          <Image
            source={logo}
            style={{ width: 52, height: 52 }}
            resizeMode="cover"
          />
        ) : (
          <Feather
            name={isActive ? "repeat" : "check-circle"}
            size={24}
            color={isActive ? activeColor : optedOutColor}
          />
        )}
      </View>
      <View style={{ flex: 1, marginRight: Spacing.md }}>
        <ThemedText type="body" style={{ color: theme.text, fontWeight: "600", fontSize: 16 }}>
          {subscription.name}
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.textSecondary, marginTop: 4, fontSize: 14 }}>
          R{subscription.amount.toFixed(2)}/month
        </ThemedText>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: Spacing.sm,
            alignSelf: "flex-start",
            backgroundColor: (subscription.isOptedOut ? optedOutColor : activeColor) + "20",
            paddingVertical: 4,
            paddingHorizontal: Spacing.sm,
            borderRadius: BorderRadius.full,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              marginRight: 6,
              backgroundColor: subscription.isOptedOut ? optedOutColor : activeColor,
            }}
          />
          <ThemedText
            type="small"
            style={{
              color: subscription.isOptedOut ? optedOutColor : activeColor,
              fontSize: 12,
            }}
          >
            {subscription.isOptedOut ? t("subscriptionOptedOut") : t("optOutSubscription")}
          </ThemedText>
        </View>
      </View>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          borderRadius: BorderRadius.lg,
          backgroundColor: subscription.isOptedOut ? theme.backgroundTertiary : NAVY,
          borderWidth: subscription.isOptedOut ? 1 : 0,
          borderColor: theme.backgroundTertiary,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Feather
          name={subscription.isOptedOut ? "rotate-ccw" : "x-circle"}
          size={18}
          color={subscription.isOptedOut ? theme.text : "#FFFFFF"}
        />
        <ThemedText
          type="button"
          style={{
            marginLeft: 6,
            color: subscription.isOptedOut ? theme.text : "#FFFFFF",
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          {subscription.isOptedOut ? "Resume" : "Unsubscribe"}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

export default function OptOutControlScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const { subscriptions, toggleSubscriptionOptOut, t } = useApp();
  const router = useRouter();

  const navyTintBg = navyTint;

  const activeCount = subscriptions.filter((s) => !s.isOptedOut).length;
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const handlePressSubscription = (subscription: Subscription) => {
    if (subscription.isOptedOut) {
      toggleSubscriptionOptOut(subscription.id);
      return;
    }
    setPendingId(subscription.id);
    setPendingName(subscription.name);
    setConfirmVisible(true);
  };

  const handleConfirmOptOut = () => {
    if (pendingId) {
      toggleSubscriptionOptOut(pendingId);
    }
    setConfirmVisible(false);
    setPendingId(null);
    setPendingName(null);
  };

  const handleCancel = () => {
    setConfirmVisible(false);
    setPendingId(null);
    setPendingName(null);
  };

  return (
    <ThemedView className="flex-1 bg-bg">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + Spacing.xl,
          paddingBottom: insets.bottom + Spacing["4xl"],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing["2xl"] }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: Spacing.sm, marginRight: Spacing.sm }}>
            <Feather name="arrow-left" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="h2">Manage all subscriptions</ThemedText>
        </View>

        <View style={{ marginBottom: Spacing["2xl"] }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: Spacing.lg }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: BorderRadius.xs,
                backgroundColor: navyTint,
                alignItems: "center",
                justifyContent: "center",
                marginRight: Spacing.sm,
              }}
            >
              <Feather name="repeat" size={18} color={NAVY} />
            </View>
            <ThemedText type="h3" style={{ color: theme.text, fontSize: 18 }}>
              Your subscriptions
            </ThemedText>
          </View>
          <ThemedText type="body" style={{ color: theme.textSecondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
            Every subscription we see in your statements – app stores, MTN/Vodacom, streaming, insurance and more – shows up here. Tap Unsubscribe to stop a subscription.
          </ThemedText>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              alignSelf: "flex-start",
              backgroundColor: navyTintBg,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              borderRadius: BorderRadius.lg,
              borderWidth: 1,
              borderColor: NAVY + "55",
              marginBottom: Spacing.xl,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginRight: Spacing.sm,
                backgroundColor: NAVY,
              }}
            />
            <ThemedText type="small" style={{ color: NAVY, fontWeight: "600", fontSize: 14 }}>
              {activeCount} active {activeCount === 1 ? "subscription" : "subscriptions"}
            </ThemedText>
          </View>

          {subscriptions.map((item, index) => (
            <SubscriptionRow
              key={item.id}
              subscription={item}
              index={index}
              onPress={() => handlePressSubscription(item)}
            />
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: Spacing["2xl"] }}>
          <Animated.View
            entering={FadeIn}
            style={{
              width: "100%",
              borderRadius: BorderRadius["2xl"],
              padding: Spacing["2xl"],
              alignItems: "center",
              backgroundColor: theme.backgroundRoot,
              borderWidth: 1,
              borderColor: theme.backgroundTertiary,
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: navyTintBg,
                borderWidth: 1,
                borderColor: NAVY + "45",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: Spacing.lg,
              }}
            >
              <Feather name="alert-circle" size={36} color={NAVY} />
            </View>
            <ThemedText type="h2" style={{ color: theme.text, marginBottom: Spacing.sm }}>
              {t("confirm")}
            </ThemedText>
            <ThemedText
              type="body"
              style={{
                color: theme.textSecondary,
                textAlign: "center",
                marginBottom: Spacing["2xl"],
                lineHeight: 22,
              }}
            >
              Do you want to automatically unsubscribe from {pendingName ?? "this subscription"} using TracePay?
            </ThemedText>
            <View style={{ flexDirection: "row", gap: Spacing.md, width: "100%" }}>
              <Pressable
                onPress={handleCancel}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.backgroundSecondary,
                  borderWidth: 1,
                  borderColor: theme.backgroundTertiary,
                }}
              >
                <ThemedText type="button" style={{ color: theme.text, fontWeight: "600" }}>
                  {t("cancel")}
                </ThemedText>
              </Pressable>
              <Pressable
                onPress={handleConfirmOptOut}
                style={{
                  flex: 1,
                  height: 52,
                  borderRadius: BorderRadius.lg,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: NAVY,
                }}
              >
                <ThemedText type="button" style={{ color: "#FFFFFF", fontWeight: "600" }}>
                  Unsubscribe
                </ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </ThemedView>
  );
}
