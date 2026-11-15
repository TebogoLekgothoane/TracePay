import type { GuideLink, GuideStep } from "./fixContent";
import { GUIDE_STEPS } from "./fixGuideSteps";
import { formatRandAmount } from "../../utils/currency";
import {
  belongsToCategory,
  isVisibleLeak,
  leakDebugCategoryByKey,
} from "../leak-intelligence/leak-debug-categories";
import type {
  LeakDetection,
  LeakDetectionResult,
} from "../leak-intelligence/leak-intelligence.types";
import { resolveLogoDomainFromMerchantLabel } from "../transactions/merchant-logos";

/**
 * The "How to cancel unused recurring payments" and "How to pause or stop a debit order"
 * guides, written from the user's own statements: one step per payment TracePay found,
 * with its real name, amount, last charge date, the text their bank prints, and direct
 * links to the service, the user's app store subscriptions, or their banking app.
 * Nothing is invented; with no findings the caller keeps the generic steps.
 */

const MAX_PAYMENTS = 6;
/** Services that already have their own step-by-step guide, so we can link straight to the right page. */
const KNOWN_SUB_SERVICES = ["netflix", "showmax", "spotify", "adobe", "canva"] as const;
const KNOWN_DEBIT_SERVICES = ["dstv", "gym", "insurance"] as const;

export const STORE_SUBSCRIPTION_LINKS: readonly GuideLink[] = [
  {
    label: "Google Play subscriptions",
    url: "https://play.google.com/store/account/subscriptions",
    fallbackUrl: "https://play.google.com/store/account/subscriptions",
  },
  {
    label: "App Store subscriptions",
    url: "itms-apps://apps.apple.com/account/subscriptions",
    fallbackUrl: "https://apps.apple.com/account/subscriptions",
  },
];

export const BANK_APP_LINKS: readonly GuideLink[] = [
  { label: "Capitec", url: "https://www.capitecbank.co.za/" },
  { label: "FNB", url: "https://www.fnb.co.za/" },
  { label: "Standard Bank", url: "https://www.standardbank.co.za/" },
  { label: "Absa", url: "https://www.absa.co.za/" },
  { label: "Nedbank", url: "https://www.nedbank.co.za/" },
  { label: "Discovery Bank", url: "https://www.discovery.co.za/bank/" },
  { label: "TymeBank", url: "https://www.tymebank.co.za/" },
];

type ServiceLinkSpec = {
  label: string;
  patterns: readonly RegExp[];
  url: string;
  appUrl?: string;
};

/** Direct cancel/account pages and app deep-links for common recurring services. */
const SERVICE_LINKS: readonly ServiceLinkSpec[] = [
  {
    label: "Netflix account",
    patterns: [/netflix/i],
    url: "https://www.netflix.com/cancelplan",
    appUrl: "nflx://www.netflix.com/account",
  },
  {
    label: "Spotify subscription",
    patterns: [/spotify/i],
    url: "https://www.spotify.com/account/subscription/",
    appUrl: "spotify://",
  },
  {
    label: "Showmax account",
    patterns: [/showmax/i],
    url: "https://www.showmax.com/",
  },
  {
    label: "Adobe plans",
    patterns: [/\badobe\b|creative\s*cloud/i],
    url: "https://account.adobe.com/plans",
  },
  {
    label: "Canva billing",
    patterns: [/\bcanva\b/i],
    url: "https://www.canva.com/settings/billing-and-teams",
    appUrl: "canva://",
  },
  {
    label: "YouTube memberships",
    patterns: [/youtube|youtu\.be/i],
    url: "https://www.youtube.com/paid_memberships",
    appUrl: "vnd.youtube://www.youtube.com/paid_memberships",
  },
  {
    label: "Google One",
    patterns: [/google\s*one|\bg1sk/i],
    url: "https://one.google.com/settings",
  },
  {
    label: "Crunchyroll membership",
    patterns: [/crunchyroll|google\s*crunch/i],
    url: "https://www.crunchyroll.com/account/membership",
    appUrl: "crunchyroll://",
  },
  {
    label: "Disney+ account",
    patterns: [/disney\s*\+|disney\s*plus/i],
    url: "https://www.disneyplus.com/account/subscription",
    appUrl: "disneyplus://",
  },
  {
    label: "Prime Video",
    patterns: [/prime\s*video|amazon\s*prime/i],
    url: "https://www.primevideo.com/settings",
    appUrl: "aiv://",
  },
  {
    label: "Apple subscriptions",
    patterns: [/\bapple\b|itunes|app\s*store|icloud/i],
    url: "https://apps.apple.com/account/subscriptions",
    appUrl: "itms-apps://apps.apple.com/account/subscriptions",
  },
  {
    label: "Microsoft account",
    patterns: [/microsoft|\boffice\s*365\b|\bm365\b|\bxbox\b/i],
    url: "https://account.microsoft.com/services",
  },
  {
    label: "PlayStation subscriptions",
    patterns: [/play\s*station|\bpsn\b/i],
    url: "https://store.playstation.com/",
  },
  {
    label: "ChatGPT account",
    patterns: [/chat\s*gpt|\bopenai\b/i],
    url: "https://chatgpt.com/#settings/Subscription",
  },
  {
    label: "Claude billing",
    patterns: [/\bclaude\b|\banthropic\b/i],
    url: "https://claude.ai/settings/billing",
  },
  {
    label: "Cursor billing",
    patterns: [/\bcursor\b/i],
    url: "https://www.cursor.com/settings",
  },
  {
    label: "CapCut",
    patterns: [/cap\s*cut/i],
    url: "https://www.capcut.com/",
    appUrl: "capcut://",
  },
  {
    label: "OpenArt",
    patterns: [/open\s*art/i],
    url: "https://openart.ai/",
  },
  {
    label: "DStv",
    patterns: [/dstv|multichoice/i],
    url: "https://www.dstv.com/",
  },
  {
    label: "LinkedIn subscription",
    patterns: [/linked\s*in/i],
    url: "https://www.linkedin.com/mypreferences/d/manage-subscription",
    appUrl: "linkedin://",
  },
  {
    label: "X Premium",
    patterns: [/\bx\s*premium\b|\btwitter\b/i],
    url: "https://x.com/settings/manage_subscription",
    appUrl: "twitter://",
  },
  {
    label: "Strava account",
    patterns: [/strava/i],
    url: "https://www.strava.com/account",
    appUrl: "strava://",
  },
  {
    label: "Duolingo settings",
    patterns: [/duolingo/i],
    url: "https://www.duolingo.com/settings/super",
    appUrl: "duolingo://",
  },
  {
    label: "Audible account",
    patterns: [/audible/i],
    url: "https://www.audible.com/account/overview",
    appUrl: "audible://",
  },
  {
    label: "Dropbox billing",
    patterns: [/dropbox/i],
    url: "https://www.dropbox.com/account/plan",
    appUrl: "dbapi-1://",
  },
  {
    label: "Notion billing",
    patterns: [/\bnotion\b/i],
    url: "https://www.notion.so/my-account",
    appUrl: "notion://",
  },
  {
    label: "Figma billing",
    patterns: [/\bfigma\b/i],
    url: "https://www.figma.com/settings",
  },
  {
    label: "GitHub billing",
    patterns: [/\bgithub\b/i],
    url: "https://github.com/settings/billing",
    appUrl: "github://",
  },
];

export type PersonalCancelGuide = {
  steps: GuideStep[];
  subtitle: string;
  count: number;
  monthlyTotal: number;
};

type Payment = {
  name: string;
  monthly: number;
  lastCharge: string | null;
  statementText: string | null;
};

function merchantName(leak: LeakDetection): string {
  const evidence = leak.evidence ?? {};
  for (const key of ["merchant_display_name", "merchant_name"]) {
    const value = evidence[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return leak.title.trim() || "this payment";
}

function shortDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function toPayment(leak: LeakDetection): Payment {
  const debits = (leak.supporting_transactions ?? [])
    .filter((row) => !String(row.direction).toLowerCase().startsWith("c") && row.role !== "reversal")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const latest = debits[0];
  const monthly = Number(leak.estimated_monthly_impact);
  return {
    name: merchantName(leak),
    monthly: Number.isFinite(monthly) && monthly > 0 ? monthly : Math.abs(Number(latest?.amount) || 0),
    lastCharge: latest?.date ? String(latest.date).slice(0, 10) : null,
    statementText: latest?.description?.trim() || null,
  };
}

function knownSubGuideKey(name: string): (typeof KNOWN_SUB_SERVICES)[number] | null {
  const lower = name.toLowerCase();
  return KNOWN_SUB_SERVICES.find((key) => lower.includes(key)) ?? null;
}

function knownDebitGuideKey(name: string): (typeof KNOWN_DEBIT_SERVICES)[number] | null {
  const lower = name.toLowerCase();
  if (lower.includes("dstv") || lower.includes("multichoice")) return "dstv";
  if (lower.includes("gym") || lower.includes("virgin active") || lower.includes("planet fitness")) {
    return "gym";
  }
  if (
    lower.includes("insur") ||
    lower.includes("outsurance") ||
    lower.includes("sanlam") ||
    lower.includes("old mutual") ||
    lower.includes("miway") ||
    lower.includes("king price")
  ) {
    return "insurance";
  }
  return null;
}

/** Resolve direct service link (with app deep-link fallback when known) from merchant name or statement line. */
export function resolveServiceLink(
  name: string,
  statementText?: string | null,
): GuideLink | null {
  const haystack = `${name} ${statementText ?? ""}`;
  for (const spec of SERVICE_LINKS) {
    if (spec.patterns.some((pattern) => pattern.test(haystack))) {
      return spec.appUrl
        ? { label: spec.label, url: spec.appUrl, fallbackUrl: spec.url }
        : { label: spec.label, url: spec.url };
    }
  }
  const domain =
    resolveLogoDomainFromMerchantLabel(name) ??
    resolveLogoDomainFromMerchantLabel(statementText);
  if (domain && !domain.endsWith(".tracepay")) {
    return { label: name, url: `https://${domain}` };
  }
  return null;
}

function billedViaGooglePlay(name: string, statementText: string | null): boolean {
  return /\bgoogle\b|\bg\.co\b|play\s*store/i.test(`${name} ${statementText ?? ""}`);
}

function billedViaApple(name: string, statementText: string | null): boolean {
  return /\bapple\b|itunes|app\s*store|icloud/i.test(`${name} ${statementText ?? ""}`);
}

function dedupeLinks(links: readonly (GuideLink | null | undefined)[]): GuideLink[] {
  const seen = new Set<string>();
  const out: GuideLink[] = [];
  for (const link of links) {
    if (!link) continue;
    const key = link.fallbackUrl ?? link.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function whereToCancel(payment: Payment): {
  text: string;
  link?: GuideLink;
  links: GuideLink[];
} {
  const key = knownSubGuideKey(payment.name);
  const first = key ? GUIDE_STEPS[`cancel-${key}`]?.[0] : undefined;
  const serviceLink = resolveServiceLink(payment.name, payment.statementText) ?? first?.link ?? null;

  const storeLinks = billedViaGooglePlay(payment.name, payment.statementText)
    ? [STORE_SUBSCRIPTION_LINKS[0]]
    : billedViaApple(payment.name, payment.statementText)
      ? [STORE_SUBSCRIPTION_LINKS[1]]
      : [...STORE_SUBSCRIPTION_LINKS];

  const links = dedupeLinks([serviceLink, ...storeLinks]);
  const primary = serviceLink ?? links[0];

  if (first) {
    return { text: first.description, link: primary, links };
  }
  return {
    text: `Sign in on ${payment.name}'s own website or app, open Account, Billing or Membership, and choose Cancel. If you subscribed through Google Play or the App Store, open your store subscriptions below to cancel it on your phone.`,
    link: primary,
    links,
  };
}

function whereToStopDebit(payment: Payment): {
  text: string;
  link?: GuideLink;
  links: GuideLink[];
} {
  const key = knownDebitGuideKey(payment.name);
  const first = key ? GUIDE_STEPS[`pause-${key}`]?.[0] : undefined;
  const serviceLink = resolveServiceLink(payment.name, payment.statementText) ?? first?.link ?? null;
  const links = dedupeLinks([serviceLink]);

  if (first) {
    return { text: first.description, link: links[0], links };
  }
  return {
    text: `Contact ${payment.name} first to cancel or pause and ask for a reference number and final debit date in writing. Then open Debit orders or Mandates in your banking app and stop the mandate so no further debit comes through.`,
    link: links[0],
    links,
  };
}

function collectCategoryPayments(
  result: LeakDetectionResult | null | undefined,
  categoryKey: "subs" | "debit",
): Payment[] {
  const category = leakDebugCategoryByKey(categoryKey);
  if (!result || !category) return [];
  return result.leaks
    .filter(
      (leak) =>
        isVisibleLeak(leak) &&
        belongsToCategory(category, leak) &&
        (leak.status === "active" || leak.status === "monitoring") &&
        leak.analysis?.counted_in_total !== false,
    )
    .map(toPayment)
    .filter((payment) => payment.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);
}

export function personalCancelGuide(
  result: LeakDetectionResult | null | undefined,
): PersonalCancelGuide | null {
  const payments = collectCategoryPayments(result, "subs");
  if (payments.length === 0) return null;

  const shown = payments.slice(0, MAX_PAYMENTS);
  const monthlyTotal = payments.reduce((sum, payment) => sum + payment.monthly, 0);
  const steps: GuideStep[] = shown.map((payment, index) => {
    const where = whereToCancel(payment);
    const seen = [
      payment.lastCharge ? `Last charged ${shortDate(payment.lastCharge)}` : "Charged every month",
      payment.statementText ? `shows on your statement as "${payment.statementText}"` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: String(index + 1),
      title: `Cancel ${payment.name}, ${formatRandAmount(payment.monthly)} a month`,
      description: `${seen}. ${where.text}`,
      ...(where.link ? { link: where.link } : {}),
      ...(where.links.length > 0 ? { links: where.links } : {}),
    };
  });

  const names = shown.map((payment) => payment.name);
  const hidden = payments.length - shown.length;
  steps.push({
    id: String(steps.length + 1),
    title: "Save the confirmation for each one",
    description: `Screenshot the final page or keep the email for ${joinNames(names)}. If a charge still comes through, this is your proof for the company and your bank.`,
  });
  steps.push({
    id: String(steps.length + 1),
    title: "Check your next statement",
    description: `Look for ${joinNames(names)}${hidden > 0 ? ` and ${hidden} more` : ""} on your next statement. None should appear. If one does, send your confirmation to the company and ask your bank to dispute the charge.`,
  });

  return {
    steps,
    count: payments.length,
    monthlyTotal,
    subtitle: `${payments.length} recurring ${payments.length === 1 ? "payment" : "payments"} found on your statements, about ${formatRandAmount(monthlyTotal)} a month. Cancel only the ones you don't use. If you use one, open it from your billing calendar and tap "I use this".`,
  };
}

export function personalDebitGuide(
  result: LeakDetectionResult | null | undefined,
): PersonalCancelGuide | null {
  const payments = collectCategoryPayments(result, "debit");
  if (payments.length === 0) return null;

  const shown = payments.slice(0, MAX_PAYMENTS);
  const monthlyTotal = payments.reduce((sum, payment) => sum + payment.monthly, 0);
  const steps: GuideStep[] = shown.map((payment, index) => {
    const where = whereToStopDebit(payment);
    const seen = [
      payment.lastCharge ? `Last debited ${shortDate(payment.lastCharge)}` : "Debited every month",
      payment.statementText ? `shows on your statement as "${payment.statementText}"` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return {
      id: String(index + 1),
      title: `Stop ${payment.name}, ${formatRandAmount(payment.monthly)} a month`,
      description: `${seen}. ${where.text}`,
      ...(where.link ? { link: where.link } : {}),
      ...(where.links.length > 0 ? { links: where.links } : {}),
    };
  });

  const names = shown.map((payment) => payment.name);
  const hidden = payments.length - shown.length;
  steps.push({
    id: String(steps.length + 1),
    title: "Stop the mandate in your banking app",
    description: `Open Debit orders or Mandates in your banking app, select ${joinNames(names)}, and choose Stop or Cancel. Confirm with your PIN or biometric and save the reference number.`,
    links: [...BANK_APP_LINKS],
  });
  steps.push({
    id: String(steps.length + 1),
    title: "Check your next two statements",
    description: `Look for ${joinNames(names)}${hidden > 0 ? ` and ${hidden} more` : ""} on your next two statements. If a debit still comes through after you stopped it, send your confirmation to your bank to reverse it.`,
    link: { label: "Ombudsman for Banking Services", url: "https://www.obssa.co.za/" },
    links: [{ label: "Ombudsman for Banking Services", url: "https://www.obssa.co.za/" }],
  });

  return {
    steps,
    count: payments.length,
    monthlyTotal,
    subtitle: `${payments.length} recurring ${payments.length === 1 ? "debit" : "debits"} found on your statements, about ${formatRandAmount(monthlyTotal)} a month. Cancel with the provider first, then stop the bank mandate.`,
  };
}

/** Return the personalised guide for a fix action when the user has matching live findings. */
export function personalGuideForAction(
  actionId: string | null | undefined,
  result: LeakDetectionResult | null | undefined,
): PersonalCancelGuide | null {
  if (actionId === "cancel") return personalCancelGuide(result);
  if (actionId === "pause" || actionId === "cancel-debit") return personalDebitGuide(result);
  return null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
