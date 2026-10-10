import {
  FindingReconciliationError,
  isFindingReconciliationError,
  postFindingReconciliation,
  reconcileIfSaved,
  retrySavedImportReconciliation,
  shouldReconcileSavedImport,
  type ReconciliationFetch,
} from "./statement-import.reconciliation";

const IMPORT_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "user-access-token";
const BASE = "http://127.0.0.1:8001";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function resultBody(statementImportId: string) {
  return {
    statement_import_id: statementImportId,
    findings_seen: 1,
    new_findings: 1,
    unchanged_findings: 0,
    materially_changed_findings: 0,
    not_observed_findings: 0,
    writes: 1,
    skipped: null,
  };
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function testSuccessfulReconciliation(): Promise<void> {
  const calls: { url: string; init: Parameters<ReconciliationFetch>[1] }[] = [];
  const fetchImpl: ReconciliationFetch = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse(200, resultBody(IMPORT_ID));
  };
  await postFindingReconciliation({
    statementImportId: IMPORT_ID,
    accessToken: TOKEN,
    baseUrl: `${BASE}/`,
    fetchImpl,
  });
  assert(calls.length === 1, "one reconciliation request");
  assert(
    calls[0].url === `${BASE}/finding-registry/imports/${IMPORT_ID}`,
    "uses the saved statement import id",
  );
  assert(!calls[0].url.includes("financial-intelligence-report"), "does not call the report");
  assert(calls[0].init.method === "POST", "post");
  assert(calls[0].init.headers.Authorization === `Bearer ${TOKEN}`, "user access token");
  assert(!calls[0].init.headers.Authorization.includes("service_role"), "no service role");
  assert(!("body" in calls[0].init), "no transaction body");
}

async function testFailedReconciliationKeepsTheImportId(): Promise<void> {
  const fetchImpl: ReconciliationFetch = async () =>
    jsonResponse(503, { detail: "Finding registry is temporarily unavailable. Please try again." });
  try {
    await postFindingReconciliation({
      statementImportId: IMPORT_ID,
      accessToken: TOKEN,
      baseUrl: BASE,
      fetchImpl,
    });
    throw new Error("expected reconciliation to fail");
  } catch (error) {
    assert(isFindingReconciliationError(error), "reconciliation error");
    assert(error.statementImportId === IMPORT_ID, "same import id");
    assert(error.message.includes("Your statement is saved"), "import stays saved");
    assert(!/insert/i.test(error.message), "does not ask for another insert");
  }
}

async function testAuthenticationIsRequiredBeforeTheRequest(): Promise<void> {
  let called = false;
  const fetchImpl: ReconciliationFetch = async () => {
    called = true;
    return jsonResponse(200, resultBody(IMPORT_ID));
  };
  try {
    await postFindingReconciliation({
      statementImportId: IMPORT_ID,
      accessToken: "  ",
      baseUrl: BASE,
      fetchImpl,
    });
    throw new Error("expected a missing token to fail");
  } catch (error) {
    assert(isFindingReconciliationError(error), "auth error type");
    assert(error.message.includes("Sign in"), "asks the user to sign in");
  }
  assert(!called, "unsigned request is not sent");

  try {
    await postFindingReconciliation({
      statementImportId: "statement.pdf",
      accessToken: TOKEN,
      baseUrl: BASE,
      fetchImpl,
    });
    throw new Error("expected a filename to be rejected");
  } catch (error) {
    assert(error instanceof FindingReconciliationError, "filename rejected");
  }
  assert(!called, "filename is not sent");
}

async function testRetryUsesTheSameImportAndDoesNotInsertAgain(): Promise<void> {
  let inserts = 0;
  const posts: string[] = [];
  const saveTransactions = async () => {
    inserts += 1;
  };
  const reconcile = async (statementImportId: string) => {
    posts.push(statementImportId);
    if (posts.length === 1) {
      throw new FindingReconciliationError(
        statementImportId,
        "Finding reconciliation timed out. Your statement is saved. Try again.",
      );
    }
  };

  await saveTransactions();
  try {
    await reconcileIfSaved({
      statementImportId: IMPORT_ID,
      status: "processed",
      savedTransactionCount: 2,
      reconcile,
    });
    throw new Error("expected the first reconciliation to fail");
  } catch (error) {
    assert(isFindingReconciliationError(error), "first attempt failed after save");
    assert(error.statementImportId === IMPORT_ID, "retry target");
  }
  await retrySavedImportReconciliation({
    statementImportId: IMPORT_ID,
    reconcile,
  });
  assert(inserts === 1, "transactions were inserted once");
  assert(posts.length === 2, "reconciliation was retried");
  assert(posts[0] === IMPORT_ID && posts[1] === IMPORT_ID, "retry uses the same import id");
}

async function testSkippedImportsDoNotReconcile(): Promise<void> {
  let calls = 0;
  const reconcile = async () => {
    calls += 1;
  };
  await reconcileIfSaved({
    statementImportId: IMPORT_ID,
    status: "failed",
    savedTransactionCount: 4,
    reconcile,
  });
  await reconcileIfSaved({
    statementImportId: IMPORT_ID,
    status: "discarded",
    savedTransactionCount: 4,
    reconcile,
  });
  await reconcileIfSaved({
    statementImportId: IMPORT_ID,
    status: "processed",
    savedTransactionCount: 0,
    reconcile,
  });
  assert(calls === 0, "failed, discarded, and empty imports are not reconciled");
  assert(shouldReconcileSavedImport("processed", 1), "a saved transaction is reconciled");
}

async function main(): Promise<void> {
  await testSuccessfulReconciliation();
  await testFailedReconciliationKeepsTheImportId();
  await testAuthenticationIsRequiredBeforeTheRequest();
  await testRetryUsesTheSameImportAndDoesNotInsertAgain();
  await testSkippedImportsDoNotReconcile();
  console.log("statement-import reconciliation tests passed");
}

void main();
