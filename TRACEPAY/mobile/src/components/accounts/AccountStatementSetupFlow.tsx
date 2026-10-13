import * as DocumentPicker from "expo-document-picker";
import { router, type Href } from "expo-router";
import { ChevronLeft, FileText } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SetupBrandHeader } from "../auth/SetupBrandHeader";
import { BankImportList } from "./BankImportList";
import {
  StatementImportComplete,
  StatementPasswordScreen,
  StatementProcessingScreen,
} from "./StatementImportScreens";
import { IconButton } from "../ui/IconButton";
import { Button } from "../ui/Button";
import {
  incorrectPdfPasswordMessage,
  isSaInstitution,
  statementPdfPasswordTip,
  type SaInstitution,
} from "../../features/accounts/account.constants";
import { parseReturnTo } from "../../features/accounts/account.navigation";
import { dismissFinancialAccountsSetup } from "../../features/accounts/account-setup.service";
import {
  createAccount,
  discardEmptyImportAccount,
  getAccountById,
  listAccounts,
} from "../../features/accounts/account.service";
import type { FinancialAccount } from "../../features/accounts/account.types";
import {
  formatAccountHeading,
  formatAccountSubtitle,
  isValidAccountName,
} from "../../features/accounts/account.validation";
import { BANK_ALREADY_UPLOADED_MESSAGE } from "../../features/statement-import/statement-bank";
import {
  importNoticeToneForMessage,
  NO_TRANSACTIONS_FOUND_MESSAGE,
  toUserFacingImportMessage,
  type ImportNoticeTone,
} from "../../features/statement-import/statement-import.messages";
import {
  isFindingReconciliationError,
  isPdfImportCancelled,
  isPdfPasswordChallenge,
  isStatementBankOccupied,
  listOccupiedStatementBankKeys,
  preparePdfStatement,
  retryFindingReconciliation,
  type PdfImportResume,
  type StatementImportStage,
} from "../../features/statement-import/statement-import.service";
import {
  clearStatementPdfPassword,
  loadStatementPdfPassword,
  saveStatementPdfPassword,
} from "../../features/statement-import/statement-pdf-password.service";
import { COLORS } from "../../theme/colors";

type Props = {
  mode: "onboarding" | "app";
  returnTo?: string | null;
  initialInstitution?: SaInstitution | null;
  existingAccountId?: string | null;
};

type ImportOutcome = {
  count: number;
  newFindings: number;
  updatedFindings: number;
};

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
  const processLock = useRef(false);
  const bankRef = useRef<SaInstitution | null>(initialInstitution);
  /** Account created for this import attempt — remove if extract/save never succeeds. */
  const provisionalAccountIdRef = useRef<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const importGenerationRef = useRef(0);

  const [bank, setBank] = useState<SaInstitution | null>(initialInstitution);
  const [accountId, setAccountId] = useState<string | null>(existingAccountId);
  const [accountBank, setAccountBank] = useState<SaInstitution | null>(initialInstitution);
  const [loadedAccount, setLoadedAccount] = useState<FinancialAccount | null>(null);
  const [existingAccounts, setExistingAccounts] = useState<FinancialAccount[]>([]);
  const [creatingNew, setCreatingNew] = useState(!existingAccountId);
  const [formError, setFormError] = useState<string | null>(null);

  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<ImportNoticeTone>("error");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<StatementImportStage | null>(null);
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [resume, setResume] = useState<PdfImportResume | null>(null);
  const [reconciliationImportId, setReconciliationImportId] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState(0);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [occupiedBankKeys, setOccupiedBankKeys] = useState<string[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshOccupiedBanks = useCallback(() => {
    void listOccupiedStatementBankKeys()
      .then((keys) => {
        if (mountedRef.current) setOccupiedBankKeys(keys);
      })
      .catch(() => {
        if (mountedRef.current) setOccupiedBankKeys([]);
      });
  }, []);

  useEffect(() => {
    refreshOccupiedBanks();
  }, [refreshOccupiedBanks]);

  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);

  useEffect(() => {
    if (existingAccountId) return;
    void listAccounts()
      .then((accounts) => {
        if (!mountedRef.current) return;
        setExistingAccounts(accounts);
        // Onboarding can prefer picking an existing account; Add account must keep
        // the bank list so it doesn't flash then jump to imported accounts.
        if (
          mode === "onboarding" &&
          accounts.length > 0 &&
          !initialInstitution
        ) {
          setCreatingNew(false);
        }
      })
      .catch(() => {
        if (mountedRef.current) setExistingAccounts([]);
      });
  }, [existingAccountId, initialInstitution, mode]);

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
          bankRef.current = institution;
        }
      })
      .catch(() => setFormError("Account not found."));
  }, [existingAccountId]);

  const showImportNotice = useCallback((text: string, tone?: ImportNoticeTone) => {
    const next = toUserFacingImportMessage(text);
    setMessage(next);
    setMessageTone(tone ?? importNoticeToneForMessage(next));
  }, []);

  const clearImport = useCallback(() => {
    if (busy) return;
    const provisionalId = provisionalAccountIdRef.current;
    provisionalAccountIdRef.current = null;
    setFile(null);
    setMessage(null);
    setMessageTone("error");
    setPasswordRequired(false);
    setPasswordError(null);
    setPassword("");
    setResume(null);
    setStage(null);
    setReconciliationImportId(null);
    setExtractedCount(0);
    if (!provisionalId) return;
    void discardEmptyImportAccount(provisionalId).then(() => {
      if (!mountedRef.current) return;
      setAccountId((current) => {
        if (current !== provisionalId) return current;
        setLoadedAccount(null);
        setAccountBank(null);
        return null;
      });
    });
  }, [busy]);

  const abortImportAndStay = (force = false) => {
    if (busy && !force) return;
    const provisionalId = provisionalAccountIdRef.current;
    provisionalAccountIdRef.current = null;
    if (provisionalId) {
      void discardEmptyImportAccount(provisionalId);
    }
    processLock.current = false;
    setBusy(false);
    setFile(null);
    setMessage(null);
    setMessageTone("error");
    setPasswordRequired(false);
    setPasswordError(null);
    setPassword("");
    setResume(null);
    setStage(null);
    setReconciliationImportId(null);
    setExtractedCount(0);
    setAccountId(null);
    setLoadedAccount(null);
    setAccountBank(null);
  };

  const cancelActiveImport = () => {
    importGenerationRef.current += 1;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    abortImportAndStay(true);
    // Keep the selected bank so they can pick another PDF for the same bank.
    if (bankRef.current) {
      setBank(bankRef.current);
      setCreatingNew(true);
    }
  };

  const leave = (force = false) => {
    if (busy && !force) return;
    // Onboarding requires a successful statement upload — back/cancel only resets the import.
    if (mode === "onboarding") {
      if (busy || stage) {
        cancelActiveImport();
        return;
      }
      abortImportAndStay(force);
      return;
    }
    if (busy || stage) {
      cancelActiveImport();
      return;
    }
    const provisionalId = provisionalAccountIdRef.current;
    provisionalAccountIdRef.current = null;
    if (provisionalId) {
      void discardEmptyImportAccount(provisionalId);
    }
    if (returnTo) return router.replace(returnTo as Href);
    router.back();
  };

  const discardProvisionalAccount = async () => {
    const provisionalId = provisionalAccountIdRef.current;
    provisionalAccountIdRef.current = null;
    if (!provisionalId) return;
    await discardEmptyImportAccount(provisionalId);
    if (accountId === provisionalId) {
      setAccountId(null);
      setAccountBank(null);
      setLoadedAccount(null);
    }
  };

  const ensureAccountId = async (selectedBank: SaInstitution | null): Promise<string> => {
    if (accountId && (importOnly || loadedAccount || accountBank === selectedBank)) {
      return accountId;
    }
    if (!selectedBank) throw new Error("Select your bank.");
    const name = selectedBank;
    if (!isValidAccountName(name)) {
      throw new Error("That bank could not be saved. Try again.");
    }
    const account = await createAccount({
      name,
      institution: selectedBank,
      accountType: "cheque",
      connectionSource: "statement_import",
    });
    provisionalAccountIdRef.current = account.id;
    setAccountId(account.id);
    setAccountBank(selectedBank);
    setLoadedAccount(account);
    return account.id;
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
      bankRef.current = institution;
    }
    clearImport();
  };

  const process = async (
    asset: DocumentPicker.DocumentPickerAsset,
    selectedBank: SaInstitution | null,
    overrides?: { password: string; resume: PdfImportResume | null },
  ) => {
    const nextPassword = overrides?.password ?? password;
    const nextResume = overrides ? overrides.resume : resume;
    if (busy || processLock.current) return;
    if (!importOnly && !loadedAccount && !selectedBank) {
      setFormError("Select your bank before uploading a statement.");
      return;
    }
    processLock.current = true;
    const generation = ++importGenerationRef.current;
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    setBusy(true);
    setMessage(null);
    setMessageTone("error");
    setFormError(null);
    setPasswordRequired(false);
    setPasswordError(null);
    setStage("preparing");
    try {
      let targetAccountId: string;
      try {
        targetAccountId = await ensureAccountId(selectedBank);
      } catch (accountError) {
        setFormError(
          accountError instanceof Error
            ? accountError.message
            : "Could not save your account.",
        );
        setStage(null);
        return;
      }

      let effectivePassword = nextPassword.trim();
      if (!effectivePassword) {
        const saved = await loadStatementPdfPassword(targetAccountId);
        if (saved) {
          effectivePassword = saved;
        }
      }

      const preview = await preparePdfStatement(asset, {
        accountId: targetAccountId,
        password: effectivePassword,
        resume: nextResume,
        signal: controller.signal,
        onProgress: (progress) => {
          if (
            mountedRef.current &&
            generation === importGenerationRef.current
          ) {
            setStage(progress.stage);
          }
        },
      });
      if (generation !== importGenerationRef.current) {
        return;
      }
      const inserted =
        preview.findingSummary?.inserted ?? preview.transactions.length;
      if (inserted <= 0) {
        // Never keep a bank account without saved transactions.
        const discardId = provisionalAccountIdRef.current ?? targetAccountId;
        provisionalAccountIdRef.current = null;
        await discardEmptyImportAccount(discardId);
        if (!mountedRef.current || generation !== importGenerationRef.current) {
          return;
        }
        setAccountId(null);
        setLoadedAccount(null);
        setAccountBank(null);
        setResume(null);
        showImportNotice(NO_TRANSACTIONS_FOUND_MESSAGE, "info");
        setStage(null);
        return;
      }
      // Transactions saved — keep the linked account and remember PDF password.
      provisionalAccountIdRef.current = null;
      if (effectivePassword) {
        await saveStatementPdfPassword(targetAccountId, effectivePassword);
      }
      if (mountedRef.current && generation === importGenerationRef.current) {
        setReconciliationImportId(null);
        finishSavedImport(inserted, preview.findingSummary);
      }
    } catch (error) {
      if (
        isPdfImportCancelled(error) ||
        generation !== importGenerationRef.current
      ) {
        return;
      }
      if (isPdfPasswordChallenge(error)) {
        const challengeAccountId =
          provisionalAccountIdRef.current ?? accountId ?? existingAccountId;
        if (challengeAccountId) {
          // Drop a stale saved password so the next unlock attempt is clean.
          const typedPassword = nextPassword.trim();
          if (!typedPassword) {
            await clearStatementPdfPassword(challengeAccountId);
          }
        }
        if (!mountedRef.current) return;
        setResume({
          statementId: error.statementId,
          filePath: error.filePath,
        });
        setPasswordRequired(true);
        const autoTriedSaved = !nextPassword.trim();
        if (autoTriedSaved) {
          setPassword("");
        }
        setPasswordError(
          autoTriedSaved
            ? null
            : error.code === "invalid_password"
              ? incorrectPdfPasswordMessage(selectedBank ?? bankRef.current)
              : null,
        );
        setStage(null);
        return;
      }
      if (isFindingReconciliationError(error)) {
        // Transactions already saved; findings retry is separate — keep account.
        provisionalAccountIdRef.current = null;
        if (!mountedRef.current) return;
        setReconciliationImportId(error.statementImportId);
        setExtractedCount(error.extractedCount);
        showImportNotice(error.message, "error");
        setStage(null);
        return;
      }
      await discardProvisionalAccount();
      if (!mountedRef.current) return;
      setResume(null);
      setReconciliationImportId(null);
      showImportNotice(
        error instanceof Error ? error.message : "The PDF could not be processed.",
      );
      setStage(null);
    } finally {
      if (importAbortRef.current === controller) {
        importAbortRef.current = null;
      }
      if (generation === importGenerationRef.current) {
        processLock.current = false;
        if (mountedRef.current) setBusy(false);
      }
    }
  };

  const pickPdf = async (selectedBank: SaInstitution | null) => {
    if (busy) return;
    if (!importOnly && !loadedAccount && !selectedBank) {
      setFormError("Select your bank before uploading a statement.");
      return;
    }
    const bankToCheck =
      selectedBank ??
      accountBank ??
      (loadedAccount ? institutionFromAccount(loadedAccount) : null);
    if (bankToCheck && isStatementBankOccupied(bankToCheck, occupiedBankKeys)) {
      setFormError(BANK_ALREADY_UPLOADED_MESSAGE);
      return;
    }
    setFormError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    clearImport();
    setFile(asset);
    void process(asset, selectedBank, { password: "", resume: null });
  };

  const chooseBankAndPick = async (name: SaInstitution) => {
    if (busy) return;
    if (isStatementBankOccupied(name, occupiedBankKeys)) {
      setFormError(BANK_ALREADY_UPLOADED_MESSAGE);
      return;
    }
    setBank(name);
    bankRef.current = name;
    setAccountId(null);
    setAccountBank(null);
    setLoadedAccount(null);
    setCreatingNew(true);
    setFormError(null);
    clearImport();
    await pickPdf(name);
  };

  const finishSavedImport = (
    count: number,
    findings?: { newFindings: number; updatedFindings: number },
  ) => {
    setOutcome({
      count,
      newFindings: findings?.newFindings ?? 0,
      updatedFindings: findings?.updatedFindings ?? 0,
    });
    setStage(null);
    refreshOccupiedBanks();
  };

  const closeFinishedImport = () => {
    if (mode === "onboarding") {
      void dismissFinancialAccountsSetup();
    }
    if (returnTo) router.replace(returnTo as Href);
    else router.replace("/(tabs)");
  };

  const retryReconciliation = async () => {
    if (!reconciliationImportId || busy) return;
    setBusy(true);
    setMessage(null);
    setMessageTone("error");
    try {
      const counts = await retryFindingReconciliation(reconciliationImportId);
      if (!mountedRef.current) return;
      setReconciliationImportId(null);
      finishSavedImport(extractedCount, counts);
    } catch (error) {
      if (!mountedRef.current) return;
      if (isFindingReconciliationError(error)) {
        setReconciliationImportId(error.statementImportId);
        showImportNotice(error.message, "error");
        return;
      }
      showImportNotice(
        "Finding reconciliation could not finish. Your statement is saved. Try again.",
        "error",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  if (outcome) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
        <StatementImportComplete
          newFindings={outcome.newFindings}
          transactionCount={outcome.count}
          updatedFindings={outcome.updatedFindings}
          onClose={closeFinishedImport}
          onImportAnother={() => {
            setOutcome(null);
            clearImport();
          }}
          onViewInsights={() => {
            if (mode === "onboarding") void dismissFinancialAccountsSetup();
            router.replace("/(tabs)/leaks");
          }}
        />
      </SafeAreaView>
    );
  }

  const bankName = bank ?? loadedAccount?.institution ?? null;

  if (passwordRequired && file) {
    return (
      <StatementPasswordScreen
        bankName={bankName}
        busy={busy}
        fileName={file.name}
        formatTip={statementPdfPasswordTip(bankName)}
        password={password}
        passwordError={passwordError}
        onChangeFile={() => {
          void pickPdf(bankRef.current);
        }}
        onClose={() => leave()}
        onPasswordChange={(value) => {
          setPassword(value);
          if (passwordError) setPasswordError(null);
        }}
        onUnlock={() => {
          const next = password.trim();
          if (!next) return;
          void process(file, bankRef.current, { password: next, resume });
        }}
      />
    );
  }

  if (busy && stage) {
    return (
      <StatementProcessingScreen
        bankName={bankName}
        fileSizeBytes={file?.size}
        stage={stage}
        onCancel={cancelActiveImport}
      />
    );
  }

  const showBankList = !importOnly && (creatingNew || existingAccounts.length === 0);
  const showExistingUpload = importOnly || (loadedAccount && !creatingNew);

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={mode === "onboarding" ? undefined : ["top"]}
    >
      <View className="flex-1 px-5">
        {mode === "onboarding" ? (
          <SetupBrandHeader />
        ) : (
          <View className="relative mt-1 min-h-11 flex-row items-center justify-center">
            <View className="absolute left-0 z-10">
              <IconButton accessibilityLabel="Go back" variant="outline" onPress={() => leave()}>
                <ChevronLeft color={palette.foreground} size={22} strokeWidth={2} />
              </IconButton>
            </View>
            <Text className="text-[17px] font-semibold text-foreground">Import statement</Text>
          </View>
        )}

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="pb-8">
            {message && !passwordRequired ? (
              <View
                className={`mt-4 rounded-2xl px-4 py-3 ${
                  messageTone === "info" ? "bg-primary/10" : "bg-destructive/10"
                }`}
              >
                <Text
                  className={`text-center text-[13px] leading-5 ${
                    messageTone === "info" ? "text-foreground" : "text-destructive"
                  }`}
                >
                  {message}
                </Text>
                {reconciliationImportId ? (
                  <Button className="mt-3" onPress={() => void retryReconciliation()}>
                    Try again
                  </Button>
                ) : null}
              </View>
            ) : null}

            {formError ? (
              <Text className="mt-3 text-[13px] text-destructive">{formError}</Text>
            ) : null}

            {!importOnly && existingAccounts.length > 0 ? (
              <View className="mt-6">
                <Text className="mb-2 text-[13px] font-semibold text-foreground">
                  Existing accounts
                </Text>
                <View className="gap-2">
                  {existingAccounts.map((account) => {
                    const selected = loadedAccount?.id === account.id && !creatingNew;
                    const institution = institutionFromAccount(account);
                    const bankOccupied = isStatementBankOccupied(
                      institution,
                      occupiedBankKeys,
                    );
                    return (
                      <Pressable
                        key={account.id}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: busy || bankOccupied }}
                        className={`rounded-2xl border px-4 py-3 ${
                          selected ? "border-primary bg-primary/5" : "border-border bg-card"
                        } ${bankOccupied ? "opacity-50" : ""}`}
                        disabled={busy || bankOccupied}
                        onPress={() => {
                          if (bankOccupied) {
                            setFormError(BANK_ALREADY_UPLOADED_MESSAGE);
                            return;
                          }
                          selectExistingAccount(account);
                          void pickPdf(institution);
                        }}
                      >
                        <Text className="text-[15px] font-semibold text-foreground">
                          {formatAccountHeading(account)}
                        </Text>
                        <Text className="mt-0.5 text-[12px] text-muted-foreground">
                          {bankOccupied
                            ? "Statement already uploaded for this bank."
                            : formatAccountSubtitle(account)}
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
                    if (!initialInstitution) {
                      setBank(null);
                      bankRef.current = null;
                    }
                    clearImport();
                  }}
                >
                  Import for a new bank
                </Button>
              </View>
            ) : null}

            {showBankList ? (
              <View className={existingAccounts.length > 0 ? "mt-6" : "mt-4"}>
                <BankImportList
                  disabled={busy}
                  occupiedBankKeys={occupiedBankKeys}
                  selected={bank}
                  onSelect={(name) => void chooseBankAndPick(name)}
                />
              </View>
            ) : null}

            {showExistingUpload && !file ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                className={`mt-4 items-center rounded-3xl border border-dashed border-border bg-card px-6 py-14 ${
                  busy ? "opacity-50" : "active:opacity-90"
                }`}
                disabled={busy}
                onPress={() => void pickPdf(bankRef.current)}
              >
                <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <FileText color={palette.primary} size={28} strokeWidth={1.8} />
                </View>
                <Text className="mt-4 text-[17px] font-bold text-foreground">Choose PDF file</Text>
                <Text className="mt-1 text-center text-[14px] text-muted-foreground">
                  or browse your files
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
