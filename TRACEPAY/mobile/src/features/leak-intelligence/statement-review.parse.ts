/**
 * The statement report the server builds, read into what the screens need. Nothing here
 * calculates a finding: it only checks the shape of what the server sent and keeps the part
 * a screen shows.
 */

import { parseFindingQuestions } from "./leak-intelligence.parse";
import type { FindingQuestion } from "./leak-intelligence.types";

export type ReviewGroup = "recoverable" | "review" | "commitment" | "good_news";
export type ReviewDisplay = "card" | "table" | "item";

/** One statement row a finding is built from, so any figure can be checked against it. */
export type EvidenceRowView = {
  /** ISO date, as posted. */
  date: string;
  description: string;
  /** Already formatted, e.g. "R1,670". */
  amount: string;
  direction: "debit" | "credit";
  /** What the row is to this finding: "regular", "doubled", "out", "back", ... */
  role: string;
};

export type ReviewFindingView = {
  key: string;
  group: ReviewGroup;
  /** A full card, a row with "shows" and "can't show", or a one-line item. */
  display: ReviewDisplay;
  leakType: string;
  /** e.g. "(price rise)", shown beside the type. */
  typeNote: string;
  title: string;
  confidence: string;
  /** What the rows show outright. May carry **bold** markers. */
  confirmed: string[];
  /** What the pattern only suggests. */
  possible: string[];
  /** What a statement cannot show. */
  cannotSee: string[];
  check: string | null;
  shows: string;
  cannotShow: string;
  /** A one-line item's whole sentence. */
  line: string;
  /** What the user told us, apart from what the rows show. */
  reported: string[];
  /** The statement rows behind the figures, oldest first. */
  rows: EvidenceRowView[];
  /** How many rows there are in all, which is more than `rows` when a long list was cut. */
  rowsTotal: number;
};

export type GoodNewsItem = {
  key: string;
  title: string;
  /** One sentence, with **bold** markers around the figures that matter. */
  line: string;
  rows: EvidenceRowView[];
  rowsTotal: number;
};

export type ReviewHeader = {
  accountLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  transactionCount: number;
  accountCount: number;
  monthCount: number;
  facility: string | null;
  /** Whether fees and interest add up to the statements' own totals. */
  reconciliation: string | null;
};

export type Commitment = { name: string; amount: string };

/** A finding from the original detector that the review does not cover, so it is not lost. */
export type OtherFinding = {
  key: string;
  title: string;
  description: string;
  leakType: string;
};

export type StatementReview = {
  /** The whole report as plain text, for sharing. */
  report: string;
  header: ReviewHeader;
  findings: ReviewFindingView[];
  /** Prices that fell. Not a leak, and never counted as money found. */
  goodNews: GoodNewsItem[];
  commitments: Commitment[];
  /** What the original detector found that the review does not cover. */
  otherFindings: OtherFinding[];
  /** Context to show, not a finding (a salary change, an employer credit). */
  contextNotes: string[];
  /** Look-alikes set aside, each with its plain reason. */
  nearMisses: string[];
  coverageLimits: string[];
  /** The few questions to put to the user now, in the same shape as the engine's own. */
  questions: FindingQuestion[];
  /** Open questions that wait until these are answered. */
  questionsNotShown: number;
};

const GROUPS: readonly ReviewGroup[] = ["recoverable", "review", "commitment", "good_news"];
const DISPLAYS: readonly ReviewDisplay[] = ["card", "table", "item"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function parseRows(value: unknown): EvidenceRowView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): EvidenceRowView[] => {
    if (
      !isRecord(row) ||
      typeof row.date !== "string" ||
      typeof row.description !== "string" ||
      typeof row.amount !== "string" ||
      (row.direction !== "debit" && row.direction !== "credit")
    ) {
      return [];
    }
    return [
      {
        date: row.date,
        description: row.description,
        amount: row.amount,
        direction: row.direction,
        role: text(row.role) || "charge",
      },
    ];
  });
}

function parseFinding(entry: unknown): ReviewFindingView | null {
  if (!isRecord(entry) || typeof entry.key !== "string" || typeof entry.title !== "string") {
    return null;
  }
  if (!GROUPS.includes(entry.group as ReviewGroup)) return null;
  const display = DISPLAYS.includes(entry.display as ReviewDisplay)
    ? (entry.display as ReviewDisplay)
    : "card";
  const finding: ReviewFindingView = {
    key: entry.key,
    group: entry.group as ReviewGroup,
    display,
    leakType: text(entry.leak_type),
    typeNote: text(entry.type_note),
    title: entry.title,
    confidence: text(entry.confidence),
    confirmed: strings(entry.confirmed),
    possible: strings(entry.possible),
    cannotSee: strings(entry.cannot_see),
    check: typeof entry.check === "string" && entry.check.trim() ? entry.check : null,
    shows: text(entry.shows),
    cannotShow: text(entry.cannot_show),
    line: text(entry.line).trim(),
    reported: strings(entry.reported),
    rows: parseRows(entry.rows),
    rowsTotal: 0,
  };
  // Never fewer than the rows actually listed, so "N rows" can only be too high by the cut.
  finding.rowsTotal = Math.max(count(entry.rows_total), finding.rows.length);
  // A finding with nothing to say is dropped, never shown as an empty card.
  const hasBody =
    finding.confirmed.length > 0 || finding.shows.trim() !== "" || finding.line !== "";
  return hasBody ? finding : null;
}

function parseCommitments(value: unknown): Commitment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row): Commitment[] =>
    isRecord(row) && typeof row.name === "string" && typeof row.amount === "string"
      ? [{ name: row.name, amount: row.amount }]
      : [],
  );
}

function parseOtherFindings(value: unknown): OtherFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): OtherFinding[] =>
    isRecord(item) &&
    typeof item.key === "string" &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    item.description.trim()
      ? [
          {
            key: item.key,
            title: item.title,
            description: item.description,
            leakType: text(item.leak_type),
          },
        ]
      : [],
  );
}

/** Returns null when the payload is not a statement report at all. */
export function parseStatementReview(payload: unknown): StatementReview | null {
  if (!isRecord(payload) || typeof payload.report !== "string" || !payload.report.trim()) {
    return null;
  }
  const findings = Array.isArray(payload.findings)
    ? (payload.findings as unknown[]).flatMap((entry): ReviewFindingView[] => {
        const parsed = parseFinding(entry);
        return parsed ? [parsed] : [];
      })
    : [];
  const goodNews = findings
    .filter((item) => item.group === "good_news" && item.line !== "")
    .map((item) => ({
      key: item.key,
      title: item.title,
      line: item.line,
      rows: item.rows,
      rowsTotal: item.rowsTotal,
    }));
  return {
    report: payload.report,
    header: {
      accountLabel: text(payload.account_label) || "Your account",
      periodStart: typeof payload.period_start === "string" ? payload.period_start : null,
      periodEnd: typeof payload.period_end === "string" ? payload.period_end : null,
      transactionCount: count(payload.transaction_count),
      accountCount: count(payload.account_count) || 1,
      monthCount: count(payload.month_count),
      facility: typeof payload.facility === "string" ? payload.facility : null,
      reconciliation:
        typeof payload.reconciliation === "string" && payload.reconciliation.trim()
          ? payload.reconciliation
          : null,
    },
    findings,
    goodNews,
    commitments: parseCommitments(payload.commitments),
    otherFindings: parseOtherFindings(payload.other_findings),
    contextNotes: strings(payload.context_notes),
    nearMisses: strings(payload.near_misses),
    coverageLimits: strings(payload.coverage_limits),
    questions: parseFindingQuestions(payload.questions),
    questionsNotShown: count(payload.questions_not_shown),
  };
}

/** The findings in one group, in the order the server sent them. */
export function findingsIn(review: StatementReview, group: ReviewGroup): ReviewFindingView[] {
  return review.findings.filter((item) => item.group === group);
}

export type TextPart = { text: string; bold: boolean };

/** Splits a sentence on its **bold** markers so a screen can set those parts in bold. */
export function splitBold(line: string): TextPart[] {
  const parts: TextPart[] = [];
  line.split("**").forEach((piece, index) => {
    if (piece) parts.push({ text: piece, bold: index % 2 === 1 });
  });
  return parts;
}
