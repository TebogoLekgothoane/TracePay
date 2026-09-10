import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import {
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../auth/SetupBrandHeader";
import { BankPicker } from "./BankPicker";
import { Button } from "../ui/Button";
import {
  isSaInstitution,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { AccountError } from "../../features/accounts/account.errors";
import { IMPORT_SUCCESS_HREF } from "../../features/accounts/account.navigation";
import { ensureBankAccount } from "../../features/accounts/account.service";
import { toTransactionImportError } from "../../features/transaction-import/transaction-import.errors";
import {
  createCsvImportPreview,
  importCsvTransactions,
} from "../../features/transaction-import/transaction-import.service";
import type { CsvImportPreview } from "../../features/transaction-import/transaction-import.types";
import { COLORS } from "../../theme/colors";

type Props = {
  mode: "onboarding" | "app";
  initialBank?: string | null;
  returnTo?: string | null;
};

function PreviewTable({ preview }: { preview: CsvImportPreview }) {
  return (
    <View className="mt-4 rounded-2xl bg-card">
      <View className="flex-row border-b border-border px-4 py-3">
        <Text className="w-[86px] text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Date
        </Text>
        <Text className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </Text>
        <Text className="w-[92px] text-right text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Amount
        </Text>
      </View>
      {preview.previewRows.map((row) => (
        <View
          key={`${row.rowNumber}-${row.description}-${row.amountLabel}`}
          className="border-b border-border px-4 py-3 last:border-b-0"
        >
          <View className="flex-row">
            <Text className="w-[86px] text-[13px] text-foreground">{row.dateLabel}</Text>
            <View className="flex-1 pr-3">
              <Text className="text-[13px] font-medium text-foreground">
                {row.description}
              </Text>
            </View>
            <Text
              className={`w-[92px] text-right text-[13px] font-semibold ${row.transactionType === "debit" ? "text-destructive" : "text-green-600"}`}
            >
              {row.amountLabel}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function StatementImportFlow({ mode, initialBank, returnTo }: Props) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const onboarding = mode === "onboarding";

  const [bank, setBank] = useState<SaInstitution | null>(
    initialBank && isSaInstitution(initialBank) ? initialBank : null,
  );
  const [bankError, setBankError] = useState<string | null>(null);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);
  const previewController = useRef<AbortController | null>(null);
  const importController = useRef<AbortController | null>(null);

  const importableCount = preview
    ? Math.max(preview.validRows - preview.duplicateRows, 0)
    : 0;

  useEffect(() => {
    return () => {
      previewController.current?.abort();
      importController.current?.abort();
    };
  }, []);

  const leave = () => {
    if (onboarding) {
      router.replace("/(tabs)");
      return;
    }
    if (returnTo) {
      router.replace(returnTo as Href);
      return;
    }
    router.back();
  };

  const resetPreview = () => {
    previewController.current?.abort();
    importController.current?.abort();
    setPreview(null);
    setMessage(null);
    setLoadingPreview(false);
    setLoadingImport(false);
  };

  const handlePickCsv = async () => {
    if (!bank) {
      setBankError("Choose your bank first.");
      return;
    }
    if (loadingPreview || loadingImport) {
      return;
    }

    setBankError(null);
    setMessage(null);

    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "text/comma-separated-values",
        "application/vnd.ms-excel",
        "text/plain",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    previewController.current?.abort();
    const controller = new AbortController();
    previewController.current = controller;
    setLoadingPreview(true);
    setPreview(null);

    try {
      const account = await ensureBankAccount(bank);
      const nextPreview = await createCsvImportPreview({
        account,
        asset: result.assets[0],
        signal: controller.signal,
      });
      setPreview(nextPreview);
    } catch (error) {
      if (error instanceof AccountError) {
        setMessage(error.message);
      } else {
        const importError = toTransactionImportError(error);
        if (importError.code !== "cancelled") {
          setMessage(importError.message);
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingPreview(false);
      }
    }
  };

  const handleImport = async () => {
    if (!preview || importableCount === 0 || loadingImport) {
      return;
    }

    importController.current?.abort();
    const controller = new AbortController();
    importController.current = controller;
    setLoadingImport(true);
    setMessage(null);

    try {
      const result = await importCsvTransactions({
        preview,
        signal: controller.signal,
      });

      router.replace({
        pathname: IMPORT_SUCCESS_HREF,
        params: {
          count: String(result.importedCount),
          accountName: result.accountName,
        },
      });
    } catch (error) {
      const importError = toTransactionImportError(error);
      if (importError.code !== "cancelled") {
        setMessage(importError.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingImport(false);
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 px-6">
        {onboarding ? (
          <SetupBrandHeader />
        ) : (
          <View className="flex-row items-center pt-1">
            <Pressable
              accessibilityRole="button"
              className="rounded-full bg-muted p-3 active:opacity-75"
              hitSlop={8}
              onPress={leave}
            >
              <ChevronLeft color={palette.foreground} size={20} strokeWidth={2.2} />
            </Pressable>
            <Text className="ml-3 text-[20px] font-bold text-foreground">
              Import statement
            </Text>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text
            className={`text-center text-[30px] font-bold tracking-[-0.7px] text-foreground ${onboarding ? "mt-8" : "mt-6"}`}
          >
            {preview ? "Review statement" : "Import bank statement"}
          </Text>
          <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
            {preview
              ? `Confirm the transactions detected for ${bank}.`
              : "Choose your bank, then upload a CSV statement covering about the last 6 months."}
          </Text>

          {!preview ? (
            <View className="mt-8 gap-5">
              <BankPicker
                disabled={loadingPreview}
                error={bankError}
                onChange={(next) => {
                  setBank(next);
                  setBankError(null);
                  setMessage(null);
                }}
                value={bank}
              />

              <Pressable
                accessibilityRole="button"
                className="items-center rounded-3xl bg-primary/10 px-6 py-12 active:opacity-85"
                disabled={loadingPreview}
                onPress={() => {
                  void handlePickCsv();
                }}
              >
                {loadingPreview ? (
                  <Text className="text-[15px] font-semibold text-primary">
                    Reading CSV…
                  </Text>
                ) : (
                  <>
                    <FileSpreadsheet
                      color={palette.primary}
                      size={36}
                      strokeWidth={1.8}
                    />
                    <Text className="mt-4 text-[18px] font-bold text-foreground">
                      Upload CSV
                    </Text>
                    <Text className="mt-2 text-center text-[14px] leading-[20px] text-muted-foreground">
                      Tap to select your bank statement CSV.
                    </Text>
                  </>
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                className="flex-row items-center justify-center gap-1 active:opacity-75"
                onPress={() => setFormatsOpen((open) => !open)}
              >
                <Text className="text-[14px] font-semibold text-primary">
                  Supported file formats
                </Text>
                <ChevronDown
                  color={palette.primary}
                  size={16}
                  strokeWidth={2.2}
                  style={{
                    transform: [{ rotate: formatsOpen ? "180deg" : "0deg" }],
                  }}
                />
              </Pressable>

              {formatsOpen ? (
                <Text className="text-center text-[13px] leading-[19px] text-muted-foreground">
                  Date | Description | Amount{"\n"}
                  Date | Description | Debit | Credit
                </Text>
              ) : null}
            </View>
          ) : null}

          {message ? (
            <View className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3">
              <Text className="text-center text-[13px] text-destructive">{message}</Text>
            </View>
          ) : null}

          {preview ? (
            <View className="mt-6">
              <Text className="text-[13px] text-muted-foreground">
                {preview.fileName} · {preview.account.name}
              </Text>

              <View className="mt-4 flex-row flex-wrap gap-2">
                <View className="rounded-full bg-muted px-3 py-2">
                  <Text className="text-[12px] font-semibold text-foreground">
                    {preview.totalRows} detected
                  </Text>
                </View>
                <View className="rounded-full bg-muted px-3 py-2">
                  <Text className="text-[12px] font-semibold text-foreground">
                    {preview.validRows} valid
                  </Text>
                </View>
                <View className="rounded-full bg-muted px-3 py-2">
                  <Text className="text-[12px] font-semibold text-foreground">
                    {preview.duplicateRows} duplicates
                  </Text>
                </View>
              </View>

              {preview.attentionMessages.map((item) => (
                <View
                  key={item}
                  className="mt-3 flex-row items-start gap-3 rounded-2xl bg-warning/10 px-4 py-3"
                >
                  <CircleAlert
                    color={palette.warning}
                    size={18}
                    strokeWidth={2.2}
                    style={{ marginTop: 1 }}
                  />
                  <Text className="flex-1 text-[13px] leading-5 text-foreground">
                    {item}
                  </Text>
                </View>
              ))}

              <PreviewTable preview={preview} />

              <View className="mt-5 gap-3">
                <Button
                  loading={loadingImport}
                  onPress={() => {
                    void handleImport();
                  }}
                >
                  Import transactions
                </Button>
                <Button onPress={resetPreview} variant="secondary">
                  <>
                    <RefreshCw color={palette.primary} size={18} strokeWidth={2.2} />
                    <Text className="text-[15px] font-semibold text-primary">
                      Choose another file
                    </Text>
                  </>
                </Button>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {!preview ? (
          <View className="pb-4 pt-2">
            {onboarding ? (
              <>
                <View className="mb-4 flex-row items-center gap-3">
                  <View className="h-px flex-1 bg-border" />
                  <Text className="text-[13px] text-muted-foreground">or</Text>
                  <View className="h-px flex-1 bg-border" />
                </View>
                <Button onPress={leave} variant="outline">
                  Skip for now
                </Button>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
