import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, ZoomIn, ZoomOut } from "react-native-reanimated";

import { useCustomCharges } from "../../features/leaks/custom-charges.preferences";
import { kindLabel } from "../../features/leaks/recurring-charges.catalog";
import {
  buildSubscriptionCalendarMonth,
  shiftCalendarMonth,
  WEEKDAY_LABELS,
  type CalendarChargeMark,
  type SubscriptionCalendarDay,
} from "../../features/leaks/subscriptions.calendar";
import { COLORS, withAlpha } from "../../theme/colors";
import { formatRandAmount } from "../../utils/currency";
import { BrandLogo } from "../ui/BrandLogo";
import { SimpleBrandLogo } from "../ui/SimpleBrandLogo";
import { resolveMarkColor } from "./LeakFlowShell";

type Props = {
  onOpenCharge?: (charge: CalendarChargeMark) => void;
};

function DayLogos({ day }: { day: SubscriptionCalendarDay }) {
  const marks = day.charges.slice(0, 2);
  if (marks.length === 0) return null;

  return (
    <View className="mt-0.5 flex-row items-center justify-center gap-0.5">
      {marks.map((mark) =>
        mark.logoDomain ? (
          <BrandLogo
            key={mark.id}
            name={mark.name}
            logoDomain={mark.logoDomain}
            size={12}
            shape="circle"
          />
        ) : mark.brandId ? (
          <SimpleBrandLogo
            key={mark.id}
            name={mark.name}
            brandId={mark.brandId}
            size={12}
            shape="circle"
          />
        ) : (
          <View
            key={mark.id}
            className="h-3 w-3 items-center justify-center rounded-full bg-muted"
          >
            <Text className="text-[7px] font-bold text-foreground">{mark.mark}</Text>
          </View>
        ),
      )}
    </View>
  );
}

function OverlayShell({
  visible,
  onClose,
  children,
  keyboardAware = false,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  keyboardAware?: boolean;
}) {
  if (!visible) return null;

  const card = (
    <Animated.View
      entering={ZoomIn.springify().damping(28).stiffness(420)}
      exiting={ZoomOut.duration(160)}
      className="w-full max-w-[360px] rounded-[26px] border border-border bg-card p-5"
    >
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        className="absolute right-4 top-4 z-10"
        hitSlop={8}
        onPress={onClose}
      >
        <X color={COLORS.light.mutedForeground} size={20} strokeWidth={2} />
      </Pressable>
      {keyboardAware ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </Animated.View>
  );

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlayRoot}
      >
        <View style={styles.overlayCenter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={onClose}
            style={StyleSheet.absoluteFillObject}
          />
          {/* Card must stay a View — Pressable parents steal TextInput focus on Android. */}
          {card}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Watermelon-style billing calendar for all recurring charges
 * (subscriptions, debit orders, rent, loans, insurance, etc.).
 * @see https://ui.watermelon.sh/animated-components/category/cards
 */
export function SubscriptionCalendar({ onOpenCharge }: Props) {
  const now = useMemo(() => new Date(), []);
  const [{ year, month }, setCursor] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => `day-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`,
  );
  const [addingOpen, setAddingOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [dayText, setDayText] = useState(String(now.getDate()));
  const [cadence, setCadence] = useState<"monthly" | "yearly">("monthly");

  const { colorScheme } = useColorScheme();
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = COLORS[scheme];
  const { charges: customCharges, addCharge, removeCharge } = useCustomCharges();

  const calendar = useMemo(
    () => buildSubscriptionCalendarMonth(year, month, now, customCharges),
    [year, month, now, customCharges],
  );

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  useEffect(() => {
    if (!isCurrentMonth) return;
    setSelectedKey(`day-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`);
  }, [isCurrentMonth, now]);

  const selectedDay = calendar.days.find((day) => day.key === selectedKey) ?? null;

  const goMonth = (delta: number) => {
    setCursor((current) => shiftCalendarMonth(current.year, current.month, delta));
    setSelectedKey(null);
  };

  const goToCurrentMonth = () => {
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setSelectedKey(`day-${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`);
  };

  const openAdd = () => {
    setAddError(null);
    setName("");
    setAmount("");
    setCadence("monthly");
    const preferredDay =
      selectedDay && !selectedDay.isMuted ? selectedDay.date : now.getDate();
    setDayText(String(preferredDay));
    setAddingOpen(true);
  };

  const submitCustomCharge = async () => {
    if (saving) return;
    setSaving(true);
    setAddError(null);
    try {
      const day = Number(dayText);
      const created = await addCharge({
        name,
        amount,
        day,
        cadence,
        month,
      });
      if (!created) {
        setAddError("Enter a name, amount, and a day between 1 and 31.");
        return;
      }

      setAddingOpen(false);
      const clampedDay = Math.min(Math.max(1, Math.trunc(day)), 31);
      setSelectedKey(`day-${year}-${month}-${clampedDay}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      className="rounded-[26px] border border-border bg-card p-4"
      style={{
        shadowColor: "#1A0F3A",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: scheme === "dark" ? 0.35 : 0.08,
        shadowRadius: 24,
        elevation: 8,
      }}
    >
      <View className="mb-4 flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Text className="text-[13px] font-medium text-foreground" numberOfLines={1}>
            {calendar.monthLabel}, {calendar.year}
          </Text>
          {isCurrentMonth ? (
            <View className="rounded-full border border-border px-2.5 py-0.5">
              <Text className="text-[10px] text-muted-foreground">Today</Text>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              className="rounded-full border border-border px-2.5 py-0.5 active:opacity-70"
              onPress={goToCurrentMonth}
            >
              <Text className="text-[10px] text-primary">This month</Text>
            </Pressable>
          )}
          <View className="ml-1 flex-row items-center">
            <Pressable
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              className="rounded-md p-1 active:opacity-70"
              hitSlop={8}
              onPress={() => goMonth(-1)}
            >
              <ChevronLeft color={palette.mutedForeground} size={18} strokeWidth={2} />
            </Pressable>
            <Pressable
              accessibilityLabel="Next month"
              accessibilityRole="button"
              className="rounded-md p-1 active:opacity-70"
              hitSlop={8}
              onPress={() => goMonth(1)}
            >
              <ChevronRight color={palette.mutedForeground} size={18} strokeWidth={2} />
            </Pressable>
          </View>
        </View>

        <Pressable
          accessibilityLabel="Add charge due"
          accessibilityRole="button"
          className="h-8 w-8 items-center justify-center active:opacity-70"
          hitSlop={8}
          onPress={openAdd}
        >
          <Plus color={palette.foreground} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View className="mb-2 flex-row gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <View
            key={label}
            className="flex-1 items-center rounded-full bg-muted/70 py-1.5"
          >
            <Text className="text-[9px] font-semibold tracking-wider text-muted-foreground">
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-1">
        {Array.from({ length: calendar.days.length / 7 }, (_, week) => (
          <View key={`week-${week}`} className="flex-row gap-1">
            {calendar.days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = selectedKey === day.key;
              const hasCharges = day.charges.length > 0;

              return (
                <Pressable
                  key={day.key}
                  accessibilityLabel={`${day.date}${hasCharges ? `, ${day.charges.length} recurring charges` : ""}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={day.isMuted}
                  onPress={() => setSelectedKey(day.key)}
                  className="flex-1 items-center justify-center overflow-hidden rounded-xl border active:opacity-80"
                  style={{
                    aspectRatio: 1,
                    borderColor: day.isMuted
                      ? withAlpha(palette.border, 0.5)
                      : palette.border,
                    backgroundColor: day.isMuted
                      ? withAlpha(palette.muted, 0.55)
                      : withAlpha(palette.muted, 0.35),
                  }}
                >
                  <Text
                    className="text-[11px] font-medium"
                    style={{
                      color: day.isMuted
                        ? withAlpha(palette.mutedForeground, 0.45)
                        : palette.foreground,
                    }}
                  >
                    {day.date}
                  </Text>
                  {!day.isMuted ? <DayLogos day={day} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {selectedDay && !selectedDay.isMuted && selectedDay.charges.length > 0 ? (
        <Animated.View entering={FadeIn.duration(180)} className="mt-3 gap-2">
          {selectedDay.charges.map((item) => (
            <Pressable
              key={`${item.kind}-${item.id}`}
              accessibilityRole="button"
              className="flex-row items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 active:opacity-80"
              onPress={() => onOpenCharge?.(item)}
            >
              {item.logoDomain ? (
                <BrandLogo
                  name={item.name}
                  logoDomain={item.logoDomain}
                  size={28}
                  fallbackColor={resolveMarkColor(palette, "primary")}
                  shape="squircle"
                />
              ) : item.brandId ? (
                <SimpleBrandLogo
                  name={item.name}
                  brandId={item.brandId}
                  size={28}
                  fallbackColor={resolveMarkColor(palette, "primary")}
                  shape="squircle"
                />
              ) : (
                <View className="h-7 w-7 items-center justify-center rounded-lg bg-card">
                  <Text className="text-[12px] font-bold text-foreground">{item.mark}</Text>
                </View>
              )}
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-foreground" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-[11px] text-muted-foreground">
                  {kindLabel(item.kind)} · {item.category} ·{" "}
                  {item.cadence === "yearly" ? "Yearly" : "Monthly"}
                </Text>
              </View>
              <Text className="text-[13px] font-bold text-foreground">
                {formatRandAmount(item.amount)}
              </Text>
              {item.kind === "custom" ? (
                <Pressable
                  accessibilityLabel={`Remove ${item.name}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation?.();
                    void removeCharge(item.id);
                  }}
                >
                  <Trash2 color={palette.mutedForeground} size={16} strokeWidth={2} />
                </Pressable>
              ) : null}
            </Pressable>
          ))}
        </Animated.View>
      ) : null}

      <View className="mt-5 border-t border-border pt-4">
        <Text className="text-[10px] font-medium text-muted-foreground" numberOfLines={1}>
          MONTHLY TOTAL :{" "}
          <Text className="text-[12px] font-bold text-foreground">
            {formatRandAmount(calendar.monthlyTotal)}
          </Text>
        </Text>
      </View>

      <OverlayShell
        keyboardAware
        visible={addingOpen}
        onClose={() => setAddingOpen(false)}
      >
        <View
          className="mb-4 h-12 w-12 items-center justify-center rounded-full"
          style={{ backgroundColor: withAlpha(palette.primary, 0.14) }}
        >
          <Plus color={palette.primary} size={24} strokeWidth={2.2} />
        </View>
        <Text className="pr-8 text-[15px] font-bold text-foreground">Add charge due</Text>
        <Text className="mt-1 text-[12px] text-muted-foreground">
          Track another recurring payment that TracePay has not detected yet.
        </Text>

        <View className="mt-4 gap-3">
          <View className="rounded-2xl border border-border px-4">
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Name (e.g. Wifi, Insurance)"
              placeholderTextColor={palette.placeholder}
              value={name}
              onChangeText={setName}
              style={[styles.fieldInput, { color: palette.foreground }]}
            />
          </View>
          <View className="flex-row gap-3">
            <View className="min-w-0 flex-1 rounded-2xl border border-border px-4">
              <TextInput
                keyboardType="decimal-pad"
                placeholder="Amount (e.g. 450)"
                placeholderTextColor={palette.placeholder}
                value={amount}
                onChangeText={setAmount}
                style={[styles.fieldInput, { color: palette.foreground }]}
              />
            </View>
            <View className="w-24 rounded-2xl border border-border px-3">
              <TextInput
                keyboardType="number-pad"
                maxLength={2}
                placeholder="Day"
                placeholderTextColor={palette.placeholder}
                value={dayText}
                onChangeText={setDayText}
                style={[styles.fieldInput, styles.dayInput, { color: palette.foreground }]}
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            {(["monthly", "yearly"] as const).map((option) => {
              const selected = cadence === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="flex-1 items-center rounded-2xl border px-3 py-3.5 active:opacity-80"
                  style={{
                    borderColor: selected ? palette.primary : palette.border,
                    backgroundColor: selected
                      ? withAlpha(palette.primary, 0.1)
                      : "transparent",
                  }}
                  onPress={() => setCadence(option)}
                >
                  <Text
                    className="text-[14px] font-semibold capitalize"
                    style={{ color: selected ? palette.primary : palette.foreground }}
                  >
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {addError ? (
            <Text className="text-center text-[13px] text-destructive">{addError}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            className="mt-1 flex-row items-center justify-center gap-2 rounded-2xl py-3.5 active:opacity-90"
            style={{ backgroundColor: palette.primary, opacity: saving ? 0.7 : 1 }}
            onPress={() => void submitCustomCharge()}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Check color="#FFFFFF" size={16} strokeWidth={2.4} />
            )}
            <Text className="text-[14px] font-bold text-white">Add charge</Text>
          </Pressable>
        </View>
      </OverlayShell>

    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  overlayCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  fieldInput: {
    minHeight: 52,
    fontSize: 16,
    paddingVertical: 14,
  },
  dayInput: {
    textAlign: "center",
  },
});
