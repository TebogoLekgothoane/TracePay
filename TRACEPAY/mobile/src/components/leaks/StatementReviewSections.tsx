import { ChevronDown } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
  findingsIn,
  splitBold,
  type EvidenceRowView,
  type GoodNewsItem,
  type ReviewFindingView,
  type StatementReview,
} from "../../features/leak-intelligence/statement-review.parse";
import { COLORS } from "../../theme/colors";

/** A sentence with its **bold** figures set in bold. */
export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <Text className={className}>
      {splitBold(text).map((part, index) => (
        <Text key={index} className={part.bold ? "font-bold" : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.7px] text-muted-foreground">
      {children}
    </Text>
  );
}

function SectionTitle({ title, blurb, count }: { title: string; blurb: string; count?: number }) {
  return (
    <View className="mt-6">
      <Text className="text-[17px] font-bold text-foreground">
        {title}
        {count === undefined ? "" : ` (${count})`}
      </Text>
      <Text className="mt-0.5 text-[13px] text-muted-foreground">{blurb}</Text>
    </View>
  );
}

function TypeLine({ finding }: { finding: ReviewFindingView }) {
  const parts = [finding.leakType, finding.typeNote, finding.confidence && `${finding.confidence} confidence`];
  return (
    <Text className="mt-0.5 text-[12px] text-muted-foreground">{parts.filter(Boolean).join(" · ")}</Text>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return month >= 1 && month <= 12 ? `${day} ${MONTHS[month - 1]} ${year}` : iso;
}

/**
 * The statement rows a finding is built from. Collapsed by default; opening it lets a person
 * check any figure above against the rows. A list that was cut says how many are left out.
 */
function RowsDisclosure({ rows, total }: { rows: EvidenceRowView[]; total: number }) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <View className="mt-3">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between rounded-xl bg-muted/40 px-3 py-2 active:opacity-75"
        onPress={() => setOpen((current) => !current)}
      >
        <Text className="text-[13px] font-semibold text-foreground">
          {open ? "Hide the rows" : `Show the ${total} ${total === 1 ? "row" : "rows"}`}
        </Text>
        <ChevronDown color={palette.placeholder} size={16} strokeWidth={2} />
      </Pressable>
      {open ? (
        <View className="mt-2">
          {rows.map((row, index) => (
            <View
              key={`${row.date}-${index}`}
              className={`flex-row items-start justify-between gap-3 py-1.5 ${index > 0 ? "border-t border-border" : ""}`}
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] leading-4 text-foreground">{row.description}</Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  {shortDate(row.date)} · {row.role}
                </Text>
              </View>
              <Text className="text-[13px] font-semibold text-foreground">
                {row.direction === "credit" ? "+" : ""}
                {row.amount}
              </Text>
            </View>
          ))}
          {total > rows.length ? (
            <Text className="mt-2 text-[12px] text-muted-foreground">
              Showing the first {rows.length} of {total}. The rest are counted in the figures above.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** What the user told us about a finding, apart from what the statements show. */
function Told({ finding }: { finding: ReviewFindingView }) {
  if (finding.reported.length === 0) return null;
  const sentence = finding.reported.map((item) => item[0].toUpperCase() + item.slice(1)).join(" ");
  return (
    <View className="mt-3 rounded-xl bg-muted/40 px-3 py-2">
      <Label>You told us</Label>
      <Text className="text-[13px] leading-5 text-foreground">{sentence}</Text>
    </View>
  );
}

/** A finding with its own evidence: what the statements show, what is possible, what to check. */
function EvidenceCard({ finding }: { finding: ReviewFindingView }) {
  return (
    <View className="rounded-3xl bg-card px-5 py-4">
      <Text className="text-[16px] font-bold leading-[22px] text-foreground">{finding.title}</Text>
      <TypeLine finding={finding} />
      {finding.confirmed.map((line) => (
        <View key={line} className="mt-3">
          <Label>Confirmed</Label>
          <RichText text={line} className="text-[14px] leading-5 text-foreground" />
        </View>
      ))}
      {finding.possible.map((line) => (
        <View key={line} className="mt-3">
          <Label>Possible</Label>
          <RichText text={line} className="text-[14px] leading-5 text-foreground" />
        </View>
      ))}
      {finding.cannotSee.map((line) => (
        <View key={line} className="mt-3">
          <Label>Cannot see</Label>
          <RichText text={line} className="text-[14px] leading-5 text-muted-foreground" />
        </View>
      ))}
      <Told finding={finding} />
      {finding.check ? (
        <View className="mt-3">
          <Label>Check</Label>
          <RichText text={finding.check} className="text-[14px] leading-5 text-foreground" />
        </View>
      ) : null}
      <RowsDisclosure rows={finding.rows} total={finding.rowsTotal} />
    </View>
  );
}

/** A finding as the report's table shows it: what the statements show, and what they can't. */
function ShowsCard({ finding }: { finding: ReviewFindingView }) {
  return (
    <View className="rounded-3xl bg-card px-5 py-4">
      <Text className="text-[16px] font-bold leading-[22px] text-foreground">{finding.title}</Text>
      <TypeLine finding={finding} />
      <View className="mt-3">
        <Label>What the statements show</Label>
        <RichText text={finding.shows} className="text-[14px] leading-5 text-foreground" />
      </View>
      {finding.cannotShow ? (
        <View className="mt-3">
          <Label>What they can't show</Label>
          <RichText text={finding.cannotShow} className="text-[14px] leading-5 text-muted-foreground" />
        </View>
      ) : null}
      <Told finding={finding} />
      <RowsDisclosure rows={finding.rows} total={finding.rowsTotal} />
    </View>
  );
}

/**
 * Prices that fell. Not a leak and never counted in any total, so it sits apart from the
 * finding groups, after them.
 */
export function GoodNews({ items }: { items: GoodNewsItem[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <SectionTitle
        title="Good news"
        count={items.length}
        blurb="Prices that fell. Not a leak, and not counted as money found."
      />
      <View className="mt-3 gap-3">
        {items.map((item) => (
          <View key={item.key} className="rounded-2xl bg-card px-4 py-3">
            <RichText text={item.line} className="text-[14px] leading-5 text-foreground" />
            <RowsDisclosure rows={item.rows} total={item.rowsTotal} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Disclosure({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: ReactNode;
}) {
  const { colorScheme } = useColorScheme();
  const palette = COLORS[colorScheme === "dark" ? "dark" : "light"];
  const [open, setOpen] = useState(false);
  return (
    <View className="mt-6">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 active:opacity-75"
        onPress={() => setOpen((current) => !current)}
      >
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-semibold text-foreground">{title}</Text>
          <Text className="mt-0.5 text-[12px] text-muted-foreground">{blurb}</Text>
        </View>
        <ChevronDown color={palette.placeholder} size={18} strokeWidth={2} />
      </Pressable>
      {open ? <View className="mt-3 gap-2">{children}</View> : null}
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View className="rounded-2xl bg-card px-4 py-3">
      <RichText text={text} className="text-[13px] leading-5 text-foreground" />
    </View>
  );
}

/**
 * The statement review laid out as the report is: potentially recoverable, worth reviewing,
 * good news, commitments, then what was set aside and what the statements cannot cover.
 * Nothing here adds the groups into one "money lost" figure.
 */
export function StatementReviewSections({ review }: { review: StatementReview }) {
  const recoverable = findingsIn(review, "recoverable");
  const reviewing = findingsIn(review, "review");
  const rows = reviewing.filter((item) => item.display !== "item");
  const items = reviewing.filter((item) => item.display === "item");
  const good = review.goodNews;

  return (
    <View>
      <Text className="text-[14px] leading-5 text-muted-foreground">
        {recoverable.length} potentially recoverable · {reviewing.length} worth reviewing ·{" "}
        {good.length} good-news {good.length === 1 ? "item" : "items"}.{" "}
        {review.header.reconciliation ?? ""}
      </Text>
      <Text className="mt-1 text-[12px] text-muted-foreground">
        Nothing here is added into one "money lost" figure.
      </Text>

      <SectionTitle
        title="Potentially recoverable"
        count={recoverable.length}
        blurb="Money you may be able to get back. Check each one first."
      />
      <View className="mt-3 gap-3">
        {recoverable.length === 0 ? (
          <Note text="Nothing in these statements looks recoverable." />
        ) : (
          recoverable.map((finding) => <EvidenceCard key={finding.key} finding={finding} />)
        )}
      </View>

      <SectionTitle
        title="Worth reviewing"
        count={reviewing.length}
        blurb="Payments that may be unnecessary. You decide."
      />
      <View className="mt-3 gap-3">
        {rows.map((finding) =>
          finding.display === "card" ? (
            <EvidenceCard key={finding.key} finding={finding} />
          ) : (
            <ShowsCard key={finding.key} finding={finding} />
          ),
        )}
        {items.length > 0 ? (
          <View className="gap-2 rounded-3xl bg-card px-5 py-4">
            <Label>Smaller items</Label>
            {items.map((finding) => (
              <View key={finding.key}>
                <RichText text={finding.line} className="text-[14px] leading-5 text-foreground" />
                <RowsDisclosure rows={finding.rows} total={finding.rowsTotal} />
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {review.otherFindings.length > 0 ? (
        <View className="mt-3 gap-2 rounded-3xl bg-card px-5 py-4">
          <Label>Also found by TracePay's other checks</Label>
          {review.otherFindings.map((item) => (
            <View key={item.key}>
              <Text className="text-[14px] font-semibold leading-5 text-foreground">{item.title}</Text>
              <Text className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{item.description}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <GoodNews items={good} />

      {review.commitments.length > 0 ? (
        <View>
          <SectionTitle
            title="Where your money goes each month"
            blurb="Commitments. Not money lost."
          />
          <View className="mt-3 rounded-3xl bg-card px-5 py-2">
            {review.commitments.map((row, index) => (
              <View
                key={`${row.name}-${index}`}
                className={`py-2.5 ${index > 0 ? "border-t border-border" : ""}`}
              >
                <Text className="text-[14px] font-semibold text-foreground">{row.name}</Text>
                <RichText text={row.amount} className="mt-0.5 text-[14px] leading-5 text-muted-foreground" />
              </View>
            ))}
          </View>
          {review.contextNotes.length > 0 ? (
            <Text className="mt-3 text-[13px] leading-5 text-muted-foreground">
              Context to show, not a finding:{" "}
              {review.contextNotes
                .map((note, index) => (index === 0 ? note : note[0].toUpperCase() + note.slice(1)))
                .join(" ")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {review.nearMisses.length > 0 ? (
        <Disclosure
          title={`Looked at, not raised (${review.nearMisses.length})`}
          blurb="Things that looked like a finding, and why each was left out."
        >
          {review.nearMisses.map((note) => (
            <Note key={note} text={note} />
          ))}
        </Disclosure>
      ) : null}

      {review.coverageLimits.length > 0 ? (
        <Disclosure
          title="What your statements can't cover"
          blurb="Limits on what any of this can tell you."
        >
          {review.coverageLimits.map((note) => (
            <Note key={note} text={note} />
          ))}
        </Disclosure>
      ) : null}
    </View>
  );
}
