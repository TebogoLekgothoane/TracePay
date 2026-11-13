import {
  getActionDetail,
  getFixContent,
  getPrimaryFixActionId,
} from "./fixContent";
import {
  nextMonthStart,
  nextMonthlyCharge,
  type ReviewIcon,
  type ReviewStatus,
  type ReviewStep,
  type ReviewTransaction,
} from "./potential-leaks";

const STATUS: Record<string, ReviewStatus> = {
  fees: "unchanged",
  subs: "new",
  debit: "new",
  airtime: "unchanged",
  atm: "resolved",
};

const ICONS: Record<string, ReviewIcon> = {
  fees: "receipt",
  subs: "refresh",
  debit: "calendar",
  airtime: "activity",
  atm: "receipt",
};

type Breakdown = {
  id: string;
  title: string;
  description: string;
  amount: string;
  percent: string;
};

type Subscription = {
  id: string;
  name: string;
  category: string;
  billing: string;
  amount: string;
  status: string;
  logoDomain?: string;
  mark: string;
  markColor: string;
};

export function categoryReview(input: {
  leakId: string;
  subtitle: string;
  changeLabel: string;
  percentOfLeaks: string;
  why: string;
  breakdown?: Breakdown[];
  subscriptions?: Subscription[];
}): {
  status: ReviewStatus;
  icon: ReviewIcon;
  evidence: { label: string; value: string }[];
  transactions: ReviewTransaction[];
  steps: ReviewStep[];
  known: string[];
  uncertain: string[];
  history: { title: string; detail: string }[];
  nextCharge: string;
} {
  const transactions: ReviewTransaction[] = input.subscriptions
    ? input.subscriptions.map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: `${item.category} · ${item.billing}`,
        amount: item.amount,
        trailing: item.status,
        nextCharge: item.billing.toLowerCase().includes("year")
          ? nextYearlyCharge()
          : nextMonthlyCharge(),
        logoDomain: item.logoDomain,
        mark: item.mark,
        markColor: item.markColor,
      }))
    : (input.breakdown ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.description,
        amount: item.amount,
        trailing: item.percent,
        nextCharge: nextMonthStart(),
        mark: item.title.slice(0, 1),
        markColor: "primary",
      }));

  const known = transactions.slice(0, 3).map((item) => `${item.title}: ${item.amount}`);
  const actionId = getPrimaryFixActionId(input.leakId);
  const action = actionId ? getActionDetail(actionId) : null;
  const fallback = getFixContent(input.leakId)?.sections.flatMap((section) => section.actions) ?? [];
  const steps: ReviewStep[] = action?.steps.length
    ? action.steps.slice(0, 3).map((step) => ({
        title: step.title,
        detail: step.description,
      }))
    : fallback.slice(0, 3).map((item) => ({
        title: item.title,
        detail: `Potential saving ${item.potentialSaving}`,
      }));

  return {
    status: STATUS[input.leakId] ?? "new",
    icon: ICONS[input.leakId] ?? "receipt",
    evidence: [
      { label: "What we noticed", value: input.subtitle },
      { label: "Share of leaks", value: input.percentOfLeaks },
    ],
    transactions,
    steps,
    known: known.length > 0 ? known : [input.why],
    uncertain: [
      "Only you can confirm which of these charges you still want. TracePay does not cancel anything for you.",
    ],
    history: [
      { title: "Compared with last month", detail: input.changeLabel },
      {
        title: "Share of your leaks",
        detail: `This is ${input.percentOfLeaks} of the leaks we totalled for the period.`,
      },
      { title: "Next charge", detail: categoryNextCharge(input.leakId, input.subscriptions) },
    ],
    nextCharge: categoryNextCharge(input.leakId, input.subscriptions),
  };
}

function categoryNextCharge(leakId: string, subscriptions?: Subscription[]): string {
  if (leakId === "atm") return "The next time you withdraw cash";
  if (leakId === "airtime") return "When your next bundle renews";
  if (leakId === "fees") return nextMonthStart();
  const plans = subscriptions ?? [];
  const yearlyOnly =
    plans.length > 0 && plans.every((item) => item.billing.toLowerCase().includes("year"));
  return yearlyOnly ? nextYearlyCharge() : nextMonthlyCharge();
}

function nextYearlyCharge(from = new Date()): string {
  return new Date(from.getFullYear() + 1, from.getMonth(), from.getDate()).toLocaleDateString(
    "en-ZA",
    { day: "numeric", month: "short", year: "numeric" },
  );
}
