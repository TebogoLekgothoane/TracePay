"""Runs the code behind GET /statement-review end to end, with only the database mocked.

The unit tests build the review directly, so a field renamed on the review but still read by
the endpoint would pass them and fail for a real user. These tests close that gap.
"""

import asyncio
import json
from datetime import datetime, timezone
from unittest.mock import patch

import app.leak_detection as leak_detection
from leak_intelligence.finding_questions import StoredAnswer
from tests.statement_review_helpers import investec_figure_rows, investec_inputs


def _run(*, answers=None, answers_error=None, figure_rows=None):
    inputs = investec_inputs()

    async def fake_inputs(*_args):
        return inputs

    def fake_answers(*_args):
        if answers_error is not None:
            raise answers_error
        return answers or {}

    with (
        patch.object(leak_detection, "build_user_consolidated_inputs", fake_inputs),
        patch.object(leak_detection, "fetch_printed_figure_rows", lambda *_a: figure_rows or []),
        patch.object(leak_detection, "load_finding_answers", fake_answers),
    ):
        return asyncio.run(leak_detection.build_user_statement_review("user-a", "token"))


def test_the_endpoint_payload_builds_and_is_json_serialisable() -> None:
    payload = _run(figure_rows=investec_figure_rows())
    json.dumps(payload)  # a Decimal or a dataclass left in the payload would fail here
    assert payload["transaction_count"] == 296
    assert payload["report"].startswith("# TracePay leak report: Investec ••8379")
    groups = {item["group"] for item in payload["findings"]}
    assert {"recoverable", "review", "good_news"} <= groups
    good = [item for item in payload["findings"] if item["group"] == "good_news"]
    assert good and "Pineapple dropped from R1,054.66 to R676.23" in good[0]["line"]


def test_the_endpoint_returns_everything_a_screen_needs_to_lay_out_the_report() -> None:
    payload = _run(figure_rows=investec_figure_rows())
    assert payload["account_label"] == "Investec ••8379"  # the account's own label
    assert payload["period_start"] == "2026-06-01" and payload["period_end"] == "2026-10-31"
    assert payload["month_count"] == 5 and payload["account_count"] == 1
    assert payload["facility"] == "50000.00"
    assert "to the cent, in all 5 months" in payload["reconciliation"]
    assert payload["commitments"][0] == {
        "name": "Rent (LANDLORD)",
        "amount": "R25,300, about **53%** of the R48,048 salary",
    }
    assert len(payload["commitments"]) == 12
    assert payload["context_notes"][0].startswith("salary fell from R51,022 to R48,048")
    assert any("labelled or explained" in note for note in payload["near_misses"])
    assert payload["coverage_limits"][0].startswith("Only this account is visible.")
    displays = {item["key"]: item["display"] for item in payload["findings"]}
    assert displays["double_debit:Virgin Active"] == "card"
    assert displays["overdraft_interest"] == "table"
    assert displays["airtime"] == "item"
    rise = next(i for i in payload["findings"] if i["key"] == "price_rise:Dotsure")
    assert rise["type_note"] == "(price rise)"


def test_the_endpoint_returns_the_rows_behind_each_finding() -> None:
    payload = _run(figure_rows=investec_figure_rows())
    json.dumps(payload)
    by_key = {item["key"]: item for item in payload["findings"]}
    virgin = by_key["double_debit:Virgin Active"]
    assert virgin["rows_total"] == 5
    assert virgin["rows"][-1] == {
        "date": "2026-10-01",
        "description": "VIRGIN ACT NETCASH",
        "amount": "R1,670",
        "direction": "debit",
        "role": "doubled",
    }
    # Money that came back is a credit, and says so.
    transfers = by_key["round_trip_transfers"]
    assert {row["direction"] for row in transfers["rows"]} == {"debit", "credit"}
    # Every row's amount is the formatted figure, never a raw Decimal.
    assert all(row["amount"].startswith("R") for item in payload["findings"] for row in item["rows"])


def test_the_endpoint_returns_a_few_questions_in_the_engines_shape() -> None:
    payload = _run(figure_rows=investec_figure_rows())
    assert [q["kind"] for q in payload["questions"]] == [
        "duplicate_expected",
        "cancelled_in",
        "payment_purpose",
    ]
    # 13 are open in all: the review's 9 plus the engine's own for payments it cannot name and
    # for the gym. Three are asked now.
    assert payload["questions_not_shown"] == 10
    for question in payload["questions"]:
        assert question["question_key"] and question["prompt"] and question["signature"] is not None
        assert question["options"][-1]["value"] == "not_sure"


def test_a_saved_answer_changes_what_the_endpoint_returns() -> None:
    first = _run(figure_rows=investec_figure_rows())
    duplicate = next(q for q in first["questions"] if q["kind"] == "duplicate_expected")
    answers = {
        duplicate["question_key"]: StoredAnswer(
            question_key=duplicate["question_key"],
            kind="duplicate_expected",
            answer="both_expected",
            signature=duplicate["signature"],
            answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }
    second = _run(answers=answers, figure_rows=investec_figure_rows())
    assert "paired:Apple" in {item["key"] for item in first["findings"]}
    assert "paired:Apple" not in {item["key"] for item in second["findings"]}
    assert all(q["kind"] != "duplicate_expected" for q in second["questions"])
    assert "You told us both Apple charges were expected" in second["report"]


def test_a_reported_answer_is_returned_beside_its_finding() -> None:
    first = _run(figure_rows=investec_figure_rows())
    duplicate = next(q for q in first["questions"] if q["kind"] == "duplicate_expected")
    answers = {
        duplicate["question_key"]: StoredAnswer(
            question_key=duplicate["question_key"],
            kind="duplicate_expected",
            answer="one_unexpected",
            signature=duplicate["signature"],
            answered_at=datetime(2026, 11, 8, tzinfo=timezone.utc),
        )
    }
    item = next(
        i for i in _run(answers=answers, figure_rows=investec_figure_rows())["findings"] if i["key"] == "paired:Apple"
    )
    assert item["reported"] == ["one of the payments was unexpected."]


def test_unreadable_answers_still_return_the_report_and_ask_nothing() -> None:
    payload = _run(answers_error=RuntimeError("boom"), figure_rows=investec_figure_rows())
    assert payload["questions"] == [] and payload["questions_not_shown"] == 0
    assert "Questions are not shown because your earlier answers could not be read." in payload["report"]
    assert any(item["key"] == "double_debit:Virgin Active" for item in payload["findings"])


def test_no_stored_figures_still_builds_the_report() -> None:
    payload = _run(figure_rows=[])
    assert "The rate went" not in payload["report"]
    assert "Virgin Active charged double" in payload["report"]
