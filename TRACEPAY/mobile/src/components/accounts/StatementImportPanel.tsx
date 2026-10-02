import * as DocumentPicker from "expo-document-picker";
import { FileText, X } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Pressable, Text, View } from "react-native";

import { BridgedTextField } from "../ui/BridgedTextField";
import { Button } from "../ui/Button";
import { StatementProcessingProgress } from "./StatementProcessingProgress";
import type { StatementImportStage } from "../../features/statement-import/statement-import.service";
import { COLORS } from "../../theme/colors";

type Props = {
  file: DocumentPicker.DocumentPickerAsset | null;
  busy: boolean;
  disabled?: boolean;
  stage: StatementImportStage | null;
  passwordRequired: boolean;
  password: string;
  passwordHint: string | null;
  message: string | null;
  onPick: () => void;
  onClear: () => void;
  onPasswordChange: (value: string) => void;
  onProcess: () => void;
};

export function StatementImportPanel({
  file,
  busy,
  disabled = false,
  stage,
  passwordRequired,
  password,
  passwordHint,
  message,
  onPick,
  onClear,
  onPasswordChange,
  onProcess,
}: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const blocked = disabled || busy;

  if (!file) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked }}
        className={`mt-4 items-center rounded-3xl bg-primary/10 px-6 py-12 ${blocked ? "opacity-50" : "active:opacity-90"}`}
        disabled={blocked}
        onPress={onPick}
      >
        <FileText color={palette.primary} size={40} strokeWidth={1.8} />
        <Text className="mt-4 text-[17px] font-bold text-foreground">Upload PDF statement</Text>
        <Text className="mt-2 text-center text-[14px] text-muted-foreground">
          PDF only · max 20 MB
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="mt-4 rounded-3xl bg-card p-5">
      <View className="flex-row items-center">
        <View className="flex-1">
          <Text className="font-semibold text-foreground" numberOfLines={2}>
            {file.name}
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">
            {file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Size unavailable"}
          </Text>
        </View>
        <Pressable disabled={busy} onPress={onClear} accessibilityLabel="Remove PDF">
          <X color={palette.mutedForeground} size={22} />
        </Pressable>
      </View>
      {passwordRequired ? (
        <View className="mt-5">
          <Text className="mb-2 text-[13px] font-semibold text-foreground">PDF password</Text>
          <View className="overflow-hidden rounded-2xl border border-border bg-background">
            <BridgedTextField
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              hostStyle={{ height: 48 }}
              inputStyle={{
                height: 48,
                paddingHorizontal: 16,
                backgroundColor: "transparent",
                borderWidth: 0,
              }}
              placeholder="Enter the PDF password"
              secureTextEntry
              value={password}
              onChangeText={onPasswordChange}
            />
          </View>
          {passwordHint ? (
            <Text className="mt-2 text-[13px] text-muted-foreground">{passwordHint}</Text>
          ) : null}
        </View>
      ) : null}
      {busy && stage ? (
        <StatementProcessingProgress fileSizeBytes={file.size} stage={stage} />
      ) : null}
      <View className="mt-6">
        <Button disabled={busy} loading={busy} onPress={onProcess}>
          {passwordRequired ? "Unlock and process" : "Process statement"}
        </Button>
      </View>
      {message ? (
        <View className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3">
          <Text className="text-center text-[13px] text-destructive">{message}</Text>
          <Pressable className="mt-2" onPress={onClear}>
            <Text className="text-center text-[13px] font-semibold text-primary">
              Choose another PDF
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
