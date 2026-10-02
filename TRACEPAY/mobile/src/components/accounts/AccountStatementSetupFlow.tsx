import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../auth/SetupBrandHeader";
import { AccountTypePicker } from "./AccountTypePicker";
import { BankPicker } from "./BankPicker";
import { InstitutionLogo } from "./InstitutionLogo";
import { StatementImportPanel } from "./StatementImportPanel";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import {
  INSTITUTION_COLORS,
  isSaInstitution,
  resolveInstitutionLogoDomain,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { parseReturnTo, IMPORT_SUCCESS_HREF, LINKED_ACCOUNTS_HREF } from "../../features/accounts/account.navigation";
import { dismissFinancialAccountsSetup } from "../../features/accounts/account-setup.service";
import { createAccount, getAccountById, listAccounts } from "../../features/accounts/account.service";
import type { AccountType, FinancialAccount } from "../../features/accounts/account.types";
import {
  colorForAccount,
  formatAccountHeading,
  formatAccountSubtitle,
  formatAccountTypeLabel,
  isValidAccountName,
} from "../../features/accounts/account.validation";
import {
  isPdfPasswordChallenge,
  preparePdfStatement,
  type PdfImportResume,
  type StatementImportStage,
} from "../../features/statement-import/statement-import.service";
import { COLORS } from "../../theme/colors";

type Props = {
  mode: "onboarding" | "app";
  returnTo?: string | null;
  initialInstitution?: SaInstitution | null;
  existingAccountId?: string | null;
};

function institutionColor(institution: SaInstitution): string {
  const key = institution.toLowerCase();
  return INSTITUTION_COLORS[key] ?? "#6366F1";
}

function institutionFromAccount(account: FinancialAccount): SaInstitution | null {
  const institution = account.institution?.trim();
  if (institution && isSaInstitution(institution)) {
    return institution;
  }
  return null;
}

export function AccountStatementSetupFlow({
  mode,
  returnTo: returnToProp,
  initialInstitution = null,
  existingAccountId = null,
}: Props) {
  const importOnly = Boolean(existingAccountId);
  const returnTo = parseReturnTo(returnToProp) ?? (mode === "onboarding" ? "/(tabs)" : null);
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const mountedRef = useRef(true);

  const [bank, setBank] = useState<SaInstitution | null>(initialInstitution);
  const [accountId, setAccountId] = useState<string | null>(existingAccountId);
  const [accountBank, setAccountBank] = useState<SaInstitution | null>(
    initialInstitution,
  );
  const [loadedAccount, setLoadedAccount] = useState<FinancialAccount | null>(null);
  const [existingAccounts, setExistingAccounts] = useState<FinancialAccount[]>([]);
  const [creatingNew, setCreatingNew] = useState(!existingAccountId);
  const [accountType, setAccountType] = useState<AccountType>("cheque");
  const [nickname, setNickname] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<StatementImportStage | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [resume, setResume] = useState<PdfImportResume | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (existingAccountId) return;
    void listAccounts()
      .then((accounts) => {
        if (!mountedRef.current) return;
        setExistingAccounts(accounts);
        if (accounts.length > 0 && !initialInstitution) {
          setCreatingNew(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setExistingAccounts([]);
      });
  }, [existingAccountId, initialInstitution]);

  useEffect(() => {
    if (!existingAccountId) return;
    void getAccountById(existingAccountId)
      .then((account) => {
        if (!account) {
          setFormError("Account not found.");
          return;
        }
        setLoadedAccount(account);
        setAccountId(account.id);
        setCreatingNew(false);
        const institution = institutionFromAccount(account);
        if (institution) {
          setBank(institution);
          setAccountBank(institution);
        }
      })
      .catch(() => setFormError("Account not found."));
  }, [existingAccountId]);

  const clearImport = useCallback(() => {
    if (busy) return;
    setFile(null);
    setMessage(null);
    setPasswordRequired(false);
    setPasswordHint(null);
    setPassword("");
    setResume(null);
    setStage(null);
  }, [busy]);

  const handleBankChange = useCallback(
    (next: SaInstitution) => {
      setBank(next);
      setAccountId(null);
      setAccountBank(null);
      setFormError(null);
      setCreatingNew(true);
      clearImport();
    },
    [clearImport],
  );

  const leave = () => {
    if (busy) return;
    if (mode === "onboarding") {
      void dismissFinancialAccountsSetup();
      return router.replace("/(tabs)");
    }
    if (returnTo) return router.replace(returnTo as Href);
    router.back();
  };

  const resolveNickname = () => {
    const custom = nickname.trim();
    if (custom.length > 0) return custom;
    return formatAccountTypeLabel(accountType);
  };

  const ensureAccountId = async (): Promise<string> => {
    if (accountId && (importOnly || loadedAccount || accountBank === bank)) {
      return accountId;
    }
    if (!bank) throw new Error("Select your bank.");
    const name = resolveNickname();
    if (!isValidAccountName(name)) {
      throw new Error("Enter a nickname between 2 and 80 characters.");
    }
    const account = await createAccount({
      name,
      institution: bank,
      accountType,
      connectionSource: "statement_import",
    });
    setAccountId(account.id);
    setAccountBank(bank);
    setLoadedAccount(account);
    return account.id;
  };

  const saveAccountOnly = async () => {
    if (busy || importOnly) return;
    setBusy(true);
    setFormError(null);
    try {
      await ensureAccountId();
      if (!mountedRef.current) return;
      if (mode === "onboarding") {
        void dismissFinancialAccountsSetup();
        router.replace("/(tabs)");
        return;
      }
      router.replace((returnTo ?? LINKED_ACCOUNTS_HREF) as Href);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Could not save your account.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const selectExistingAccount = (account: FinancialAccount) => {
    if (busy) return;
    setLoadedAccount(account);
    setAccountId(account.id);
    setCreatingNew(false);
    setFormError(null);
    const institution = institutionFromAccount(account);
    if (institution) {
      setBank(institution);
      setAccountBank(institution);
    }
    clearImport();
  };

  const canImport = Boolean(importOnly || loadedAccount || bank);

  const pickPdf = async () => {
    if (busy || !canImport) return;
    setFormError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      clearImport();
      setFile(result.assets[0]);
    }
  };

  const process = async () => {
    if (!file || busy || !canImport) return;
    setBusy(true);
    setMessage(null);
    setFormError(null);
    setPasswordHint(null);
    setStage("preparing");
    try {
      let targetAccountId: string;
      try {
        targetAccountId = await ensureAccountId();
      } catch (accountError) {
        setFormError(
          accountError instanceof Error
            ? accountError.message
            : "Could not save your account.",
        );
        setStage(null);
        return;
      }
      const preview = await preparePdfStatement(file, {
        accountId: targetAccountId,
        password,
        resume,
        onProgress: (progress) => {
          if (mountedRef.current) setStage(progress.stage);
        },
      });
      if (mountedRef.current) {
        if (mode === "onboarding") {
          router.replace({
            pathname: IMPORT_SUCCESS_HREF,
            params: {
              count: String(preview.transactions.length),
              accountName: bank ?? loadedAccount?.name ?? "your account",
            },
          } as Href);
          return;
        }
        if (returnTo) router.replace(returnTo as Href);
        else router.replace("/(tabs)");
      }
    } catch (error) {
      if (isPdfPasswordChallenge(error)) {
        if (!mountedRef.current) return;
        setResume({
          statementId: error.statementId,
          filePath: error.filePath,
        });
        setPasswordRequired(true);
        setPasswordHint(error.message);
        setStage(null);
        return;
      }
      if (!mountedRef.current) return;
      setResume(null);
      const nextMessage =
        error instanceof Error ? error.message : "The PDF could not be processed.";
      setMessage(nextMessage);
      setStage(null);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const heroBank = bank;
  const heroAccount = loadedAccount;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={mode === "onboarding" ? undefined : ["top"]}>
      <View className="flex-1 px-5">
        {mode === "onboarding" ? (
          <SetupBrandHeader />
        ) : (
          <View className="flex-row items-center gap-3 pt-1">
            <IconButton accessibilityLabel="Go back" variant="ghost" onPress={leave}>
              <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
            </IconButton>
            <Text className="text-[24px] font-bold text-foreground">
              {importOnly || loadedAccount ? "Import statement" : "Add account"}
            </Text>
          </View>
        )}

        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          className="flex-1"
        >
          {mode === "onboarding" ? (
            <>
              <Text className="mt-8 text-center text-[30px] font-bold text-foreground">
                Connect your bank
              </Text>
              <Text className="mt-3 text-center text-[15px] leading-[22px] text-muted-foreground">
                Start with one bank now. You can add FNB, Capitec, credit cards, and more
                anytime from Home or Settings after setup.
              </Text>
            </>
          ) : importOnly || loadedAccount ? (
            <Text className="mt-4 text-[14px] leading-6 text-muted-foreground">
              Upload another PDF statement for this account. Previous statements are kept.
            </Text>
          ) : (
            <Text className="mt-4 text-[14px] leading-6 text-muted-foreground">
              Choose an existing account or create a new one. You can save the account now and
              import a statement later.
            </Text>
          )}

          {!importOnly && existingAccounts.length > 0 ? (
            <View className="mt-6">
              <Text className="mb-2 text-[13px] font-semibold text-foreground">
                Existing accounts
              </Text>
              <View className="gap-2">
                {existingAccounts.map((account) => {
                  const selected = loadedAccount?.id === account.id && !creatingNew;
                  return (
                    <Pressable
                      key={account.id}
                      accessibilityRole="button"
                      className={`rounded-2xl border px-4 py-3 ${
                        selected ? "border-primary bg-primary/5" : "border-border bg-card"
                      }`}
                      disabled={busy}
                      onPress={() => selectExistingAccount(account)}
                    >
                      <Text className="text-[15px] font-semibold text-foreground">
                        {formatAccountHeading(account)}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {formatAccountSubtitle(account)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                className="mt-3"
                disabled={busy}
                size="sm"
                variant="secondary"
                onPress={() => {
                  setCreatingNew(true);
                  setLoadedAccount(null);
                  setAccountId(null);
                  setAccountBank(null);
                  if (!initialInstitution) setBank(null);
                  clearImport();
                }}
              >
                New account
              </Button>
            </View>
          ) : null}

          {!importOnly && (creatingNew || existingAccounts.length === 0) ? (
            <View className="mt-6 gap-4">
              <BankPicker
                value={bank}
                onChange={handleBankChange}
                error={formError && !bank ? formError : null}
                disabled={busy}
              />
              {bank ? (
                <>
                  <AccountTypePicker
                    disabled={busy}
                    value={accountType}
                    onChange={setAccountType}
                  />
                  <Input
                    editable={!busy}
                    label="Nickname (optional)"
                    placeholder={formatAccountTypeLabel(accountType)}
                    value={nickname}
                    onChangeText={setNickname}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {(importOnly || loadedAccount) && heroAccount ? (
            <View className="mt-6 items-center rounded-3xl bg-card px-5 py-6">
              <InstitutionLogo
                name={formatAccountHeading(heroAccount)}
                logoDomain={resolveInstitutionLogoDomain(heroAccount.institution)}
                color={colorForAccount(heroAccount)}
                size={72}
              />
              <Text className="mt-4 text-[20px] font-bold text-foreground">
                {formatAccountHeading(heroAccount)}
              </Text>
              <Text className="mt-1 text-[13px] text-muted-foreground">
                {formatAccountSubtitle(heroAccount)}
              </Text>
            </View>
          ) : null}

          {!importOnly && creatingNew && heroBank && !loadedAccount ? (
            <View className="mt-5 items-center rounded-3xl bg-card px-5 py-6">
              <InstitutionLogo
                name={heroBank}
                logoDomain={resolveInstitutionLogoDomain(heroBank)}
                color={institutionColor(heroBank)}
                size={72}
              />
              <Text className="mt-4 text-[20px] font-bold text-foreground">{heroBank}</Text>
              <Text className="mt-1 text-[13px] text-muted-foreground">
                {formatAccountTypeLabel(accountType)}
                {nickname.trim() ? ` · ${nickname.trim()}` : ""}
              </Text>
            </View>
          ) : null}

          {(importOnly && heroAccount) || loadedAccount || (!importOnly && creatingNew && heroBank) ? (
            <View className="mt-6">
              <StatementImportPanel
                busy={busy}
                file={file}
                message={message}
                password={password}
                passwordHint={passwordHint}
                passwordRequired={passwordRequired}
                stage={stage}
                onClear={clearImport}
                onPasswordChange={setPassword}
                onPick={() => void pickPdf()}
                onProcess={() => void process()}
              />
              {!importOnly && creatingNew && heroBank ? (
                <Button
                  className="mt-3"
                  disabled={busy}
                  variant="outline"
                  onPress={() => void saveAccountOnly()}
                >
                  Save account without a statement
                </Button>
              ) : null}
              {formError ? (
                <Text className="mt-3 text-[13px] text-destructive">{formError}</Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {mode === "onboarding" ? (
          <Button className="mb-2" disabled={busy} onPress={leave} variant="outline">
            Skip for now
          </Button>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
