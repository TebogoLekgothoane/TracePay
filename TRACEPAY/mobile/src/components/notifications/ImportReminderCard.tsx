import { Text, View } from "react-native";

import {
  REMINDER_FREQUENCIES,
  useImportReminder,
} from "../../features/notifications/import-reminder.preferences";
import { syncImportReminder } from "../../features/notifications/import-reminder.scheduler";
import { NativeSwitch } from "../ui/NativeSwitch";
import { SegmentToggle } from "../ui/SegmentToggle";

export function ImportReminderCard() {
  const { preference, update } = useImportReminder();
  const change = (patch: Parameters<typeof update>[0]) => {
    void update(patch).then(syncImportReminder);
  };

  return (
    <View className="overflow-hidden rounded-3xl bg-card">
      <View className="flex-row items-center gap-3 px-5 py-4">
        <View className="min-w-0 flex-1">
          <Text className="text-[18px] font-bold text-foreground">Remind me to import</Text>
          <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
            After each import, remind me in {preference.frequency}
          </Text>
        </View>
        <NativeSwitch
          accessibilityLabel="Remind me to import"
          value={preference.enabled}
          onValueChange={(enabled) => change({ enabled })}
        />
      </View>

      {preference.enabled ? (
        <View className="border-t border-border/60 px-5 pb-5 pt-4">
          <Text className="mb-3 text-[14px] text-muted-foreground">Import reminder frequency</Text>
          <SegmentToggle
            fill
            value={preference.frequency}
            options={REMINDER_FREQUENCIES}
            onChange={(frequency) => change({ frequency })}
          />
        </View>
      ) : null}
    </View>
  );
}
