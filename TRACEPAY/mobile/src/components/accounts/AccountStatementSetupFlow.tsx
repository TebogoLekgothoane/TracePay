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
  CoverageNotes,
  StatementImportComplete,
  StatementPasswordScreen,
  StatementProcessingScreen,
  type QueueStatusRow,
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
import { normalizeStatementBankKey } from "../../features/statement-import/statement-bank";
import {
  buildQueueSummary,
  CHOOSE_ACCOUNT_HELP,
  chooseAccountTitle,
  classifyStatementSave,
  differentAccountLabel,
  importNoticeToneForMessage,
  isAccountMismatchMessage,
  nextAccountName,
  NO_TRANSACTIONS_FOUND_MESSAGE,
  statementProgressLabel,
  toUserFacingImportMessage,
  type ImportNoticeTone,
  type QueueItemStatus,
} from "../../features/statement-import/statement-import.messages";
import {
  isFindingReconciliationError,
  isPdfImportCancelled,
  isPdfPasswordChallenge,
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

/** Where statements in this session go: an account the user chose, or a new one at `bank`. */
type Target = {
  account: FinancialAccount | null;
  bank: SaInstitution | null;
};

type QueueItem = {
  id: string;
  asset: DocumentPicker.DocumentPickerAsset;
  status: QueueItemStatus;
  newTransactions: number;
  overlapDuplicates: number;
  possibleDuplicates: number;
  message: string | null;
  warnings: string[];
  resume: PdfImportResume | null;
  passwordError: string | null;
  /** Statement saved, but findings still need to finish. */
  reconcileId: string | null;
};

type FileResult =
  | { kind: "cancelled" }
  | {
      kind: "saved";
      status: "saved" | "already_imported";
      newTransactions: number;
      overlapDuplicates: number;
      possibleDuplicates: number;
      warnings: string[];
    }
  | { kind: "empty" }
  | { kind: "password"; resume: PdfImportResume; passwordError: string | null }
  | { kind: "reconcile"; importId: string; extractedCount: number; message: string }
  | { kind: "problem"; message: string };

type Phase = "select" | "running" | "password" | "summary";

const FINISHED: ReadonlyArray<QueueItemStatus> = [
  "saved",
  "already_imported",
  "problem",
  "empty",
];

const ACCOUNT_MISMATCH_HINT =
  "Tap the button below to choose the matching account, or add this statement as a different account at the same bank.";

function institutionFromAccount(account: FinancialAccount): SaInstitution | null {
  const institution = account.institution?.trim();
  if (institution && isSaInstitution(institution)) {
    return institution;
  }
  return null;
}

function accountsAtBank(
  accounts: ReadonlyArray<FinancialAccount>,
  bank: string | null,
): FinancialAccount[] {
  const key = normalizeStatementBankKey(bank);
  if (!key) return [];
  return accounts.filter((account) => normalizeStatementBankKey(account.institution) === key);
}

function rowDetail(item: QueueItem): string | null {
  switch (item.status) {
    case "saved": {
      const parts = [`${item.newTransactions.toLocaleString("en-ZA")} new`];
      if (item.overlapDuplicates > 0) {
        parts.push(`${item.overlapDuplicates.toLocaleString("en-ZA")} already imported`);
      }
      if (item.possibleDuplicates > 0) {
        parts.push(`${item.possibleDuplicates.toLocaleString("en-ZA")} may repeat another statement`);
      }
      return parts.join(" · ");
    }
    case "already_imported":
      return "Nothing new to add";
    case "empty":
      return "No usable transactions";
    case "problem":
      return item.message;
    default:
      return null;
  }
}

function toRows(items: ReadonlyArray<QueueItem>): QueueStatusRow[] {
  return items.map((item) => ({
    id: item.id,
    name: item.asset.name,
    status: item.status,
    detail: rowDetail(item),
  }));
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
  const targetRef = useRef<Target | null>(null);
  /** Account used for this session's statements (chosen, or created for the first file). */
  const accountIdRef = useRef<string | null>(existingAccountId);
  /** Account created for this import attempt — remove if extract/save never succeeds. */
  const provisionalAccountIdRef = useRef<string | null>(null);
  const importAbortRef = useRef<AbortController | null>(null);
  const importGenerationRef = useRef(0);
  const queueRunRef = useRef(0);
  const itemsRef = useRef<QueueItem[]>([]);

  const [bank, setBank] = useState<SaInstitution | null>(initialInstitution);
  const [loadedAccount, setLoadedAccount] = useState<FinancialAccount | null>(null);
  const [existingAccounts, setExistingAccounts] = useState<FinancialAccount[]>([]);
  const [chooserBank, setChooserBank] = useState<SaInstitution | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [items, setItems] = useState<QueueItem[]>([]);
  const [phase, setPhase] = useState<Phase>("select");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [passwordItemId, setPasswordItemId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<ImportNoticeTone>("error");
  const [busy, setBusy] = useState(false);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [stage, setStage] = useState<StatementImportStage | null>(null);
  const [password, setPassword] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);

  const commitItems = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem>) => {
      commitItems(
        itemsRef.current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [commitItems],
  );

  const refreshAccounts = useCallback(async (): Promise<FinancialAccount[]> => {
    try {
      const accounts = await listAccounts();
      if (mountedRef.current) setExistingAccounts(accounts);
      return accounts;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    if (existingAccountId) return;
    void refreshAccounts().then((accounts) => {
      if (!mountedRef.current || !initialInstitution) return;
      // Never guess the account: if the bank already has accounts, ask which one.
      if (accountsAtBank(accounts, initialInstitution).length > 0) {
        setChooserBank(initialInstitution);
      }
    });
  }, [existingAccountId, initialInstitution, refreshAccounts]);

  useEffect(() => {
    if (!existingAccountId) return;
    void getAccountById(existingAccountId)
      .then((account) => {
        if (!account) {
          setFormError("Account not found.");
          return;
        }
        const institution = institutionFromAccount(account);
        setLoadedAccount(account);
        accountIdRef.current = account.id;
        targetRef.current = { account, bank: institution };
        if (institution) {
          setBank(institution);
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

  /** Remove an account created for this attempt when nothing was saved to it. */
  const discardProvisionalAccount = async () => {
    const provisionalId = provisionalAccountIdRef.current;
    if (!provisionalId) return;
    // A file waiting for its password already points at this account.
    if (itemsRef.current.some((item) => item.status === "password")) return;
    provisionalAccountIdRef.current = null;
    if (accountIdRef.current === provisionalId) accountIdRef.current = null;
    await discardEmptyImportAccount(provisionalId);
  };

  const resetToSelect = () => {
    commitItems([]);
    setPhase("select");
    setActiveItemId(null);
    setPasswordItemId(null);
    setPassword("");
    setStage(null);
    setChooserBank(null);
    setFormError(null);
    if (!importOnly) {
      targetRef.current = null;
      accountIdRef.current = null;
      setLoadedAccount(null);
    }
  };

  const cancelActiveImport = () => {
    importGenerationRef.current += 1;
    queueRunRef.current += 1;
    importAbortRef.current?.abort();
    importAbortRef.current = null;
    processLock.current = false;
    setBusy(false);
    setStage(null);
    const finished = itemsRef.current.filter((item) => FINISHED.includes(item.status));
    const anySaved = finished.some(
      (item) => item.status === "saved" || item.status === "already_imported",
    );
    if (!anySaved) {
      const provisionalId = provisionalAccountIdRef.current;
      provisionalAccountIdRef.current = null;
      if (provisionalId) {
        if (accountIdRef.current === provisionalId) accountIdRef.current = null;
        void discardEmptyImportAccount(provisionalId);
      }
    }
    setMessage(null);
    if (anySaved) {
      // Statements that finished stay saved; the rest of the queue is dropped.
      commitItems(finished);
      setActiveItemId(null);
      setPasswordItemId(null);
      setPhase("summary");
      return;
    }
    resetToSelect();
  };

  const ensureAccountId = async (): Promise<string> => {
    const target = targetRef.current;
    if (target?.account) return target.account.id;
    if (accountIdRef.current) return accountIdRef.current;
    const selectedBank = target?.bank ?? null;
    if (!selectedBank) throw new Error("Select your bank.");
    let names: string[] = [];
    try {
      names = (await listAccounts()).map((account) => account.name);
    } catch {
      names = [];
    }
    const name = nextAccountName(selectedBank, names);
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
    accountIdRef.current = account.id;
    return account.id;
  };

  /** Runs one PDF through the existing extract and save pipeline. */
  const processOne = async (item: QueueItem, passwordInput: string): Promise<FileResult> => {
    const generation = ++importGenerationRef.current;
    importAbortRef.current?.abort();
    const controller = new AbortController();
    importAbortRef.current = controller;
    const selectedBank = targetRef.current?.bank ?? bankRef.current;
    const typedPassword = passwordInput.trim();
    try {
      let targetAccountId: string;
      try {
        targetAccountId = await ensureAccountId();
      } catch (accountError) {
        return {
          kind: "problem",
          message:
            accountError instanceof Error
              ? accountError.message
              : "Could not save your account.",
        };
      }

      let effectivePassword = typedPassword;
      if (!effectivePassword) {
        const saved = await loadStatementPdfPassword(targetAccountId);
        if (saved) effectivePassword = saved;
      }

      const preview = await preparePdfStatement(item.asset, {
        accountId: targetAccountId,
        password: effectivePassword,
        resume: item.resume,
        signal: controller.signal,
        onProgress: (progress) => {
          if (mountedRef.current && generation === importGenerationRef.current) {
            setStage(progress.stage);
          }
        },
      });
      if (generation !== importGenerationRef.current) return { kind: "cancelled" };

      const summary = preview.importSummary;
      const classified = classifyStatementSave({
        inserted:
          preview.findingSummary?.inserted ??
          summary?.newTransactions ??
          (summary ? 0 : preview.transactions.length),
        received: summary?.received,
        overlapDuplicates: summary?.overlapDuplicates,
        extractedRows: preview.transactions.length,
      });

      if (classified.status === "empty") {
        // Only the account created for this file is ever removed, and only when empty.
        await discardProvisionalAccount();
        return { kind: "empty" };
      }

      // Saved (possibly everything overlapped earlier uploads): keep the account.
      provisionalAccountIdRef.current = null;
      if (effectivePassword) {
        await saveStatementPdfPassword(targetAccountId, effectivePassword);
      }
      return {
        kind: "saved",
        status: classified.status,
        newTransactions: classified.newTransactions,
        overlapDuplicates: summary?.overlapDuplicates ?? 0,
        possibleDuplicates: summary?.possibleDuplicates ?? 0,
        warnings: preview.warnings ?? [],
      };
    } catch (error) {
      if (isPdfImportCancelled(error) || generation !== importGenerationRef.current) {
        return { kind: "cancelled" };
      }
      if (isPdfPasswordChallenge(error)) {
        const challengeAccountId =
          provisionalAccountIdRef.current ?? accountIdRef.current ?? existingAccountId;
        if (challengeAccountId && !typedPassword) {
          // Drop a stale saved password so the next unlock attempt is clean.
          await clearStatementPdfPassword(challengeAccountId);
        }
        return {
          kind: "password",
          resume: { statementId: error.statementId, filePath: error.filePath },
          passwordError:
            !typedPassword || error.code !== "invalid_password"
              ? null
              : incorrectPdfPasswordMessage(selectedBank),
        };
      }
      if (isFindingReconciliationError(error)) {
        // Transactions already saved; the findings retry is separate, so keep the account.
        provisionalAccountIdRef.current = null;
        return {
          kind: "reconcile",
          importId: error.statementImportId,
          extractedCount: error.extractedCount,
          message: error.message,
        };
      }
      await discardProvisionalAccount();
      const text = toUserFacingImportMessage(
        error instanceof Error ? error.message : "The PDF could not be processed.",
      );
      if (text === NO_TRANSACTIONS_FOUND_MESSAGE) return { kind: "empty" };
      return { kind: "problem", message: text };
    }
  };

  /** Decide what the user sees once the queue has nothing left to read. */
  const finalizeQueue = () => {
    const list = itemsRef.current;
    const pending = list.find((item) => item.status === "password");
    if (pending) {
      setPassword("");
      setPasswordItemId(pending.id);
      setPhase("password");
      return;
    }
    const summary = buildQueueSummary(list);
    if (list.length === 1 && summary.saved === 0) {
      // A single file that failed behaves as before: notice on the upload screen.
      const only = list[0];
      commitItems([]);
      setPhase("select");
      setPasswordItemId(null);
      if (only.status === "empty") {
        showImportNotice(NO_TRANSACTIONS_FOUND_MESSAGE, "info");
      } else {
        showImportNotice(only.message ?? "The PDF could not be processed.");
      }
      return;
    }
    setPasswordItemId(null);
    setPhase("summary");
  };

  const applyResult = (id: string, result: FileResult) => {
    switch (result.kind) {
      case "saved":
        patchItem(id, {
          status: result.status,
          newTransactions: result.newTransactions,
          overlapDuplicates: result.overlapDuplicates,
          possibleDuplicates: result.possibleDuplicates,
          warnings: result.warnings,
          resume: null,
          passwordError: null,
          message: null,
        });
        break;
      case "empty":
        patchItem(id, { status: "empty", resume: null, message: NO_TRANSACTIONS_FOUND_MESSAGE });
        break;
      case "password":
        patchItem(id, {
          status: "password",
          resume: result.resume,
          passwordError: result.passwordError,
        });
        break;
      case "reconcile":
        patchItem(id, {
          status: "saved",
          newTransactions: result.extractedCount,
          reconcileId: result.importId,
          resume: null,
          message: result.message,
        });
        break;
      case "problem":
        patchItem(id, { status: "problem", resume: null, message: result.message });
        break;
      default:
        break;
    }
  };

  /** Processes the given items one at a time. A file that needs a password is set aside. */
  const runQueue = async (ids: string[], passwords: Record<string, string> = {}) => {
    if (processLock.current) return;
    processLock.current = true;
    const run = ++queueRunRef.current;
    setBusy(true);
    setMessage(null);
    setMessageTone("error");
    setFormError(null);
    setPasswordItemId(null);
    setPhase("running");
    setStage("preparing");
    try {
      for (const id of ids) {
        if (run !== queueRunRef.current || !mountedRef.current) return;
        const item = itemsRef.current.find((candidate) => candidate.id === id);
        if (!item) continue;
        patchItem(id, { status: "reading", message: null, passwordError: null });
        setActiveItemId(id);
        setStage("preparing");
        const result = await processOne(item, passwords[id] ?? "");
        if (run !== queueRunRef.current || !mountedRef.current) return;
        if (result.kind === "cancelled") return;
        applyResult(id, result);
      }
      finalizeQueue();
    } finally {
      if (run === queueRunRef.current) {
        processLock.current = false;
        importAbortRef.current = null;
        if (mountedRef.current) {
          setBusy(false);
          setStage(null);
          setActiveItemId(null);
        }
      }
    }
  };

  const pickAndRun = async (target: Target) => {
    if (busy || processLock.current) return;
    if (!target.account && !target.bank) {
      setFormError("Select your bank before uploading a statement.");
      return;
    }
    setFormError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: true,
    });
    const assets = result.canceled ? [] : (result.assets ?? []);
    if (assets.length === 0 || !mountedRef.current) return;

    targetRef.current = target;
    accountIdRef.current = target.account?.id ?? null;
    provisionalAccountIdRef.current = null;
    bankRef.current = target.bank;
    setBank(target.bank);
    setLoadedAccount(target.account);
    setChooserBank(null);

    const queued: QueueItem[] = assets.map((asset, index) => ({
      id: `${index}-${asset.uri}`,
      asset,
      status: "waiting",
      newTransactions: 0,
      overlapDuplicates: 0,
      possibleDuplicates: 0,
      message: null,
      warnings: [],
      resume: null,
      passwordError: null,
      reconcileId: null,
    }));
    commitItems(queued);
    void runQueue(queued.map((item) => item.id));
  };

  const chooseBank = async (name: SaInstitution) => {
    if (busy) return;
    setBank(name);
    bankRef.current = name;
    setFormError(null);
    setMessage(null);
    const accounts = await refreshAccounts();
    if (!mountedRef.current) return;
    // Never attach a statement to an account by guess: ask when the bank has accounts.
    if (accountsAtBank(accounts, name).length > 0) {
      setChooserBank(name);
      return;
    }
    await pickAndRun({ account: null, bank: name });
  };

  const unlockPending = () => {
    const pending = itemsRef.current.find((item) => item.id === passwordItemId);
    const next = password.trim();
    if (!pending || !next) return;
    setPassword("");
    void runQueue([pending.id], { [pending.id]: next });
  };

  const skipPending = () => {
    if (!passwordItemId) return;
    patchItem(passwordItemId, {
      status: "problem",
      resume: null,
      message: "Skipped. Add this statement again when you have its password.",
    });
    finalizeQueue();
  };

  const swapPendingFile = async () => {
    const pendingId = passwordItemId;
    if (!pendingId || busy) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
      multiple: false,
    });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    patchItem(pendingId, {
      asset,
      status: "waiting",
      resume: null,
      passwordError: null,
      message: null,
    });
    void runQueue([pendingId]);
  };

  const leavePasswordScreen = () => {
    // Back leaves the locked statements out; saved ones are kept.
    commitItems(
      itemsRef.current.map((item) =>
        item.status === "password"
          ? {
              ...item,
              status: "problem" as const,
              resume: null,
              message: "Skipped. Add this statement again when you have its password.",
            }
          : item,
      ),
    );
    finalizeQueue();
  };

  const leave = () => {
    if (busy || stage) {
      cancelActiveImport();
      return;
    }
    // Onboarding requires a saved statement, so back only resets the picker.
    if (mode === "onboarding") {
      resetToSelect();
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

  const closeFinishedImport = () => {
    if (mode === "onboarding") {
      void dismissFinancialAccountsSetup();
    }
    if (returnTo) router.replace(returnTo as Href);
    else router.replace("/(tabs)");
  };

  const addAnotherStatement = () => {
    resetToSelect();
    setMessage(null);
    void refreshAccounts();
  };

  const retryInsights = async () => {
    if (insightsBusy) return;
    setInsightsBusy(true);
    try {
      for (const item of itemsRef.current) {
        if (!item.reconcileId) continue;
        try {
          await retryFindingReconciliation(item.reconcileId);
          patchItem(item.id, { reconcileId: null, message: null });
        } catch (error) {
          if (isFindingReconciliationError(error)) {
            patchItem(item.id, { reconcileId: error.statementImportId });
          }
        }
      }
    } finally {
      if (mountedRef.current) setInsightsBusy(false);
    }
  };

  const bankName = bank ?? loadedAccount?.institution ?? null;

  if (phase === "summary") {
    const summary = buildQueueSummary(items);
    const hasMismatch = items.some(
      (item) =>
        item.status === "problem" && item.message && isAccountMismatchMessage(item.message),
    );
    const needsInsightsRetry = items.some((item) => item.reconcileId);
    return (
      <StatementImportComplete
        insightsBusy={insightsBusy}
        insightsNotice={
          needsInsightsRetry
            ? "Your statements are saved, but TracePay could not finish updating your insights."
            : null
        }
        mismatchHint={hasMismatch ? ACCOUNT_MISMATCH_HINT : null}
        rows={toRows(items)}
        summary={summary}
        onAddAnother={addAnotherStatement}
        onClose={() => {
          if (summary.saved > 0) closeFinishedImport();
          else if (mode === "onboarding") addAnotherStatement();
          else leave();
        }}
        onDone={closeFinishedImport}
        onRetryInsights={needsInsightsRetry ? () => void retryInsights() : undefined}
      />
    );
  }

  const pendingItem = items.find((item) => item.id === passwordItemId) ?? null;
  if (phase === "password" && pendingItem && !busy) {
    const position = items.findIndex((item) => item.id === pendingItem.id) + 1;
    return (
      <StatementPasswordScreen
        bankName={bankName}
        busy={busy}
        fileName={pendingItem.asset.name}
        formatTip={statementPdfPasswordTip(bankName)}
        password={password}
        passwordError={pendingItem.passwordError}
        queueLabel={
          items.length > 1 ? statementProgressLabel(position, items.length, "needs a password") : null
        }
        onChangeFile={() => void swapPendingFile()}
        onClose={leavePasswordScreen}
        onPasswordChange={(value) => {
          setPassword(value);
          if (pendingItem.passwordError) patchItem(pendingItem.id, { passwordError: null });
        }}
        onSkip={items.length > 1 ? skipPending : undefined}
        onUnlock={unlockPending}
      />
    );
  }

  if (busy && stage) {
    const activeIndex = items.findIndex((item) => item.id === activeItemId);
    const active = activeIndex >= 0 ? items[activeIndex] : null;
    return (
      <StatementProcessingScreen
        bankName={bankName}
        fileSizeBytes={active?.asset.size}
        queueLabel={
          active ? statementProgressLabel(activeIndex + 1, items.length, active.asset.name) : null
        }
        queueRows={toRows(items)}
        stage={stage}
        onCancel={cancelActiveImport}
      />
    );
  }

  const chooserAccounts = chooserBank ? accountsAtBank(existingAccounts, chooserBank) : [];
  const showChooser = !importOnly && chooserBank !== null && chooserAccounts.length > 0;

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
            <Text className="text-[17px] font-semibold text-foreground">Add statements</Text>
          </View>
        )}

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="pb-8">
            {message ? (
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
                {isAccountMismatchMessage(message) ? (
                  <Text className="mt-2 text-center text-[13px] leading-5 text-foreground">
                    {ACCOUNT_MISMATCH_HINT}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {formError ? (
              <Text className="mt-3 text-[13px] text-destructive">{formError}</Text>
            ) : null}

            <View className="mt-4">
              <CoverageNotes />
            </View>

            {showChooser && chooserBank ? (
              <View className="mt-6">
                <Text className="text-[22px] font-bold tracking-[-0.4px] text-foreground">
                  {chooseAccountTitle(chooserBank)}
                </Text>
                <Text className="mt-2 text-[14px] leading-5 text-muted-foreground">
                  {CHOOSE_ACCOUNT_HELP}
                </Text>
                <View className="mt-4 gap-2">
                  {chooserAccounts.map((account) => (
                    <Pressable
                      key={account.id}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      className="rounded-2xl border border-border bg-card px-4 py-3 active:opacity-80"
                      disabled={busy}
                      onPress={() =>
                        void pickAndRun({
                          account,
                          bank: institutionFromAccount(account) ?? chooserBank,
                        })
                      }
                    >
                      <Text className="text-[15px] font-semibold text-foreground">
                        {formatAccountHeading(account)}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {formatAccountSubtitle(account)}
                      </Text>
                    </Pressable>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    className="rounded-2xl border border-dashed border-primary bg-primary/5 px-4 py-3 active:opacity-80"
                    disabled={busy}
                    onPress={() => void pickAndRun({ account: null, bank: chooserBank })}
                  >
                    <Text className="text-[15px] font-semibold text-primary">
                      {differentAccountLabel(chooserBank)}
                    </Text>
                    <Text className="mt-0.5 text-[12px] text-muted-foreground">
                      TracePay will add it as a new account.
                    </Text>
                  </Pressable>
                </View>
                <Button
                  className="mt-4"
                  disabled={busy}
                  size="sm"
                  variant="secondary"
                  onPress={() => setChooserBank(null)}
                >
                  Choose a different bank
                </Button>
              </View>
            ) : null}

            {!showChooser && !importOnly && existingAccounts.length > 0 ? (
              <View className="mt-6">
                <Text className="mb-2 text-[13px] font-semibold text-foreground">
                  Add to an account you already have
                </Text>
                <View className="gap-2">
                  {existingAccounts.map((account) => (
                    <Pressable
                      key={account.id}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      className="rounded-2xl border border-border bg-card px-4 py-3 active:opacity-80"
                      disabled={busy}
                      onPress={() =>
                        void pickAndRun({
                          account,
                          bank: institutionFromAccount(account),
                        })
                      }
                    >
                      <Text className="text-[15px] font-semibold text-foreground">
                        {formatAccountHeading(account)}
                      </Text>
                      <Text className="mt-0.5 text-[12px] text-muted-foreground">
                        {formatAccountSubtitle(account)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {!showChooser && !importOnly ? (
              <View className={existingAccounts.length > 0 ? "mt-6" : "mt-4"}>
                <BankImportList
                  disabled={busy}
                  selected={bank}
                  onSelect={(name) => void chooseBank(name)}
                />
              </View>
            ) : null}

            {importOnly ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy }}
                className={`mt-4 items-center rounded-3xl border border-dashed border-border bg-card px-6 py-14 ${
                  busy ? "opacity-50" : "active:opacity-90"
                }`}
                disabled={busy}
                onPress={() => {
                  const target = targetRef.current;
                  if (!target) {
                    setFormError("Account not found.");
                    return;
                  }
                  void pickAndRun(target);
                }}
              >
                <View className="h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <FileText color={palette.primary} size={28} strokeWidth={1.8} />
                </View>
                <Text className="mt-4 text-[17px] font-bold text-foreground">
                  Choose PDF files
                </Text>
                <Text className="mt-1 text-center text-[14px] text-muted-foreground">
                  You can select several statements at once
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

