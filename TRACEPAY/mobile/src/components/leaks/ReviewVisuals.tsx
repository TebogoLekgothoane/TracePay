import type { LucideIcon } from "lucide-react-native";
import { Activity, Calendar, Copy, Receipt, RefreshCw } from "lucide-react-native";
import { Text, View } from "react-native";

import type { ReviewIcon, ReviewStatus } from "../../features/leaks/potential-leaks";
import { REVIEW_STATUS_LABEL } from "../../features/leaks/potential-leaks";
import { COLORS, type ColorScheme } from "../../theme/colors";

const ICONS: Record<ReviewIcon, LucideIcon> = {
  copy: Copy,
  refresh: RefreshCw,
  receipt: Receipt,
  activity: Activity,
  calendar: Calendar,
};

export function reviewIconColor(
  scheme: ColorScheme,
  icon: ReviewIcon,
): string {
  const palette = COLORS[scheme];
  if (icon === "copy") return palette.destructive;
  if (icon === "refresh") return palette.primary;
  if (icon === "receipt") return palette.warning;
  if (icon === "activity") return palette.blue;
  return palette.success;
}

export function statusColor(scheme: ColorScheme, status: ReviewStatus): string {
  const palette = COLORS[scheme];
  if (status === "new") return palette.primary;
  if (status === "unchanged") return palette.warning;
  return palette.success;
}

export function ReviewIconTile({
  icon,
  color,
  size = 44,
}: {
  icon: ReviewIcon;
  color: string;
  size?: number;
}) {
  const Icon = ICONS[icon];
  return (
    <View
      className="items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,

      }}
    >
      <Icon color={color} size={Math.round(size * 0.42)} strokeWidth={2.2} />
    </View>
  );
}

export function ReviewStatusBadge({
  status,
  color,
}: {
  status: ReviewStatus;
  color: string;
}) {
  return (
    <Text className="text-[12px] font-semibold" style={{ color }}>
      {REVIEW_STATUS_LABEL[status]}
    </Text>
  );
}
