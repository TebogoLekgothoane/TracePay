"""Render a statement review as the customer-facing report, in its fixed layout."""

from __future__ import annotations

from datetime import date

from .statement_review import _MONTH_ABBR, ReviewFinding, StatementReview, money


def _range(start: date | None, end: date | None) -> str:
    if start is None or end is None:
        return "Period not known"
    if start.year == end.year:
        return f"{start.day} {_MONTH_ABBR[start.month]} – {end.day} {_MONTH_ABBR[end.month]} {end.year}"
    return (
        f"{start.day} {_MONTH_ABBR[start.month]} {start.year} – "
        f"{end.day} {_MONTH_ABBR[end.month]} {end.year}"
    )


def _card(number: int, finding: ReviewFinding) -> list[str]:
    lines = [f"**{finding.title}** (`{finding.leak_type}`, {finding.confidence} confidence)"]
    for text in finding.confirmed:
        lines.append(f"- **Confirmed:** {text}")
    for text in finding.possible:
        lines.append(f"- **Possible:** {text}")
    for text in finding.cannot_see:
        lines.append(f"- **Cannot see:** {text}")
    if finding.reported:
        lines.append(f"- **You told us:** {_told(finding)}")
    if finding.check:
        lines.append(f"- **Check:** {finding.check}")
    lines.append("")
    return lines


def _told(finding: ReviewFinding) -> str:
    """What the user told us about a finding, in one run of sentences."""
    return " ".join(item[0].upper() + item[1:] for item in finding.reported)


def render_statement_review(
    review: StatementReview, other_findings: list[dict[str, str]] | None = None
) -> str:
    """The report. ``other_findings`` are what the original detector found that the review
    does not cover, each with a title, a description and a leak type."""
    recoverable = review.by_group("recoverable")
    table = [item for item in review.by_group("review") if item.display == "table"]
    items = [item for item in review.by_group("review") if item.display == "item"]
    good = review.by_group("good_news")
    review_count = len(table) + len(items)

    out: list[str] = [f"# TracePay leak report: {review.account_label}", ""]
    facility = f" · {money(review.facility)} overdraft facility" if review.facility else ""
    accounts = "one account" if review.account_count == 1 else f"{review.account_count} accounts"
    out.append(
        f"**Period:** {_range(review.period_start, review.period_end)} · "
        f"**{review.transaction_count} transactions** · {accounts}{facility}."
    )
    out.append("")
    if review.reconciliation:
        out.append(f"Every row was read from your statements. {review.reconciliation} "
                   'Nothing below is added into one "money lost" figure.')
    else:
        out.append('Nothing below is added into one "money lost" figure.')
    out.append("")
    out.append(
        f"Counts: **{len(recoverable)} potentially recoverable · {review_count} worth reviewing · "
        f"{len(good)} good-news {'item' if len(good) == 1 else 'items'} · commitments listed at the end.**"
    )
    out += ["", "---", "", "## 1. Potentially recoverable", ""]
    if recoverable:
        for number, finding in enumerate(recoverable, start=1):
            out += _card(number, finding)
    else:
        out += ["Nothing in these statements looks recoverable.", ""]

    out += ["---", "", "## 2. Worth reviewing", ""]
    if table:
        out.append("| # | Finding | Type | What the statements show | What they can't show |")
        out.append("|---|---|---|---|---|")
        for offset, finding in enumerate(table, start=len(recoverable) + 1):
            kind = f"`{finding.leak_type}`" + (f" {finding.type_note}" if finding.type_note else "")
            shows = finding.shows + (f" **You told us:** {_told(finding)}" if finding.reported else "")
            out.append(f"| {offset} | **{finding.title}** | {kind} | {shows} | {finding.cannot_show} |")
        out.append("")
    if items:
        out += ["Smaller items to include:"]
        out += [f"- {finding.line}" for finding in items]
        out.append("")
    if other_findings:
        out += ["Also found by TracePay's other checks:"]
        out += [
            f"- **{item['title']}** (`{item['leak_type']}`): {item['description']}"
            for item in other_findings
        ]
        out.append("")

    out += ["---", "", "## 3. Good news (not a leak)", ""]
    if good:
        out += [finding.line for finding in good]
    else:
        out.append("No price drops were found.")
    out.append("")

    out += ["---", "", "## 4. Commitments (where the money goes each month)", ""]
    if review.commitments:
        out += ["| Commitment | Latest amount |", "|---|---|"]
        out += [f"| {row.name} | {row.amount} |" for row in review.commitments]
        out.append("")
    if review.context_notes:
        notes = [note[0].upper() + note[1:] if index else note for index, note in enumerate(review.context_notes)]
        out += ["Context to show, not a finding: " + " ".join(notes), ""]

    out += ["---", "", "## 5. Questions for you", ""]
    if not review.questions_asked:
        out.append("Questions are not shown because your earlier answers could not be read.")
    elif review.questions:
        out += [
            f"{number}. {question.prompt} (`{question.kind}`)"
            for number, question in enumerate(review.questions, start=1)
        ]
    else:
        out.append("No questions: nothing here depends on an answer from you.")
    out.append("")

    out += ["## 6. Looked at, not raised (near misses)", ""]
    out += [f"- {note}" for note in review.near_misses] or ["- Nothing was set aside."]
    out.append("")

    out += ["## 7. Coverage limits", ""]
    out += [f"- {note}" for note in review.coverage_limits]
    return "\n".join(out).rstrip() + "\n"
