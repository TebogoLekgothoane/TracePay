"""Typed contracts for deterministic potential financial leak detections."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from .coverage import CoverageLimit
from .finding_groups import ValueGroup, value_group_for
from .models import NearMiss

LeakType = Literal[
    "bank_fee_leak",
    "subscription_leak",
    "recurring_payment_leak",
    "spending_escalation_leak",
    "duplicate_payment_leak",
    "duplicate_debit_order_leak",
    "duplicate_streaming_leak",
    "irregular_transaction_leak",
    "inactive_recurring_payment_leak",
    "cash_usage_leak",
    "airtime_data_leak",
    "food_spending_leak",
    "transport_spending_leak",
    "coffee_spending_leak",
    "convenience_store_leak",
    "weekend_spending_leak",
    "payday_spending_leak",
    "unknown_recurring_payment",
    "overlapping_cover_leak",
    "gambling_spending_leak",
    "high_cost_credit_leak",
    "penalty_fee_leak",
    "recurring_transfer_leak",
    "money_pass_through_leak",
]
LeakSeverity = Literal["low", "medium", "high"]
LeakStatus = Literal["active", "monitoring", "resolved", "dismissed"]
ImpactKind = Literal["recurring", "one_time", "estimated"]


class SupportingTransaction(BaseModel):
    """A redacted statement row that supports a leak finding."""

    transaction_id: str
    date: date
    description: str
    amount: Decimal = Field(ge=0)
    direction: str
    role: Literal["payment", "fee", "other_fee", "failed_attempt_fee", "reversal"]


AmountStatus = Literal["confirmed", "estimated", "potentially_duplicated"]
AccountPattern = Literal[
    "single_account",
    "consolidated_across_accounts",
    "sequential_move",
    "concurrent_charges",
    "unrelated_accounts",
]


class SourceAccount(BaseModel):
    """An account that contributed evidence. Last four digits only, never a full number."""

    account_id: str | None = None
    label: str
    transaction_count: int
    amount: Decimal = Field(ge=0)


class LeakAnalysisContext(BaseModel):
    """How a finding was reached and what limits it. Additive to LeakDetection."""

    source_accounts: list[SourceAccount] = Field(default_factory=list)
    cross_account: bool = False
    account_pattern: AccountPattern = "single_account"
    date_range_start: date | None = None
    date_range_end: date | None = None
    window_rule: str = ""
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    currency: str = "ZAR"
    amount_status: AmountStatus = "confirmed"
    confidence_level: Literal["high", "medium", "low"] = "medium"
    confidence_notes: list[str] = Field(default_factory=list)
    coverage_limits: list[CoverageLimit] = Field(default_factory=list)
    calculation: str = ""
    overlaps_with: list[str] = Field(default_factory=list)
    counted_in_total: bool = True


class LeakResultSummary(BaseModel):
    non_overlapping_amount_by_currency: dict[str, Decimal] = Field(default_factory=dict)
    coverage_summary: list[str] = Field(default_factory=list)
    disclaimer: str = ""


class ConfirmedFact(BaseModel):
    """Something the statement rows show outright: a count, an amount, a date.

    Built only from the transactions behind the finding, never from a guess.
    """

    text: str
    figures: dict[str, Any] = Field(default_factory=dict)


class PossibleLeak(BaseModel):
    """What the pattern suggests, kept apart from what was observed.

    ``cannot_see`` names what a bank statement does not contain, so the claim is
    never read as proof. ``check`` is the one thing that would settle it.
    """

    text: str
    cannot_see: list[str] = Field(default_factory=list)
    check: str | None = None


class ReportedFact(BaseModel):
    """Something the user told us. Neither proven by a statement nor a guess."""

    text: str
    question_kind: str
    answer: str


UserEffect = Literal["none", "strengthens", "weakens", "resolves"]


class LeakClaims(BaseModel):
    """Three different kinds of claim about one finding.

    ``confirmed`` is true of the user's statements ("You paid this fee 17
    times"). ``reported`` is what the user told us ("You said you rarely use
    this"). ``possible`` is a hypothesis ("You may be able to avoid this fee")
    that neither of the others settles. ``user_effect`` is what the user's
    answer did to the finding: it never changes the statement facts.
    """

    confirmed: list[ConfirmedFact] = Field(default_factory=list)
    reported: list[ReportedFact] = Field(default_factory=list)
    possible: list[PossibleLeak] = Field(default_factory=list)
    user_effect: UserEffect = "none"


QuestionKind = Literal[
    "subscription_usage",
    "cancelled_in",
    "duplicate_expected",
    "data_usage",
    "insurance_cover",
    "bank_account",
    "payment_purpose",
]


class QuestionOption(BaseModel):
    value: str
    label: str


class FindingQuestion(BaseModel):
    """One targeted question, asked because the answer could change a finding."""

    question_key: str = Field(min_length=3, max_length=120)
    kind: QuestionKind
    leak_id: str
    leak_type: str
    subject: str
    prompt: str
    why_asked: str
    context: list[str] = Field(default_factory=list)
    options: list[QuestionOption]
    can_skip: bool = True
    priority: float = 0
    # Echoed back with the answer so a later change to the finding can reopen it.
    signature: str = ""


class LeakDetection(BaseModel):
    """A deterministic, evidence-backed potential financial leak."""

    leak_id: str = Field(min_length=16, max_length=64)
    fingerprint: str = Field(min_length=16, max_length=64)
    leak_type: LeakType
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=500)
    severity: LeakSeverity
    confidence: float = Field(ge=0, le=1)
    status: LeakStatus = "active"
    estimated_monthly_impact: Decimal = Field(ge=0)
    estimated_annual_impact: Decimal | None = Field(default=None, ge=0)
    impact_kind: ImpactKind
    evidence: dict[str, Any] = Field(default_factory=dict)
    supporting_behavior_ids: list[str] = Field(default_factory=list)
    supporting_feature_references: list[str] = Field(default_factory=list)
    supporting_transactions: list[SupportingTransaction] = Field(default_factory=list)
    supporting_transaction_count: int = 0
    detector_version: str = Field(min_length=1, max_length=32)
    detected_at: datetime
    period_start: date | None = None
    period_end: date | None = None
    analysis: LeakAnalysisContext | None = None
    claims: LeakClaims | None = None
    # Recoverable, worth reviewing or a commitment; set from the type when not given.
    value_group: ValueGroup | None = None

    @model_validator(mode="after")
    def _set_value_group(self) -> "LeakDetection":
        if self.value_group is None:
            self.value_group = value_group_for(self.leak_type, self.evidence)
        return self


Bucket =Literal["recurring_monthly", "one_time"]
EvidenceStatusName = Literal["confirmed", "likely", "possible"]


class FindingOverlap(BaseModel):
    leak_ids: list[str]
    # A count, not the ids: the rows themselves are listed on each finding.
    shared_transaction_count: int = 0
    shared_merchants: list[str] = Field(default_factory=list)
    relation: str


class FindingImpact(BaseModel):
    leak_id: str
    bucket: Bucket
    basis: str
    evidence_status: EvidenceStatusName
    amount: Decimal
    observed_amount: Decimal | None = None
    group_id: int
    counted_in_total: bool
    overlaps_with: list[str] = Field(default_factory=list)
    # Findings whose own rows already account for this one, and whether it is
    # worth showing the customer as well.
    explained_by: list[str] = Field(default_factory=list)
    display: bool = True
    value_group: ValueGroup | None = None


class GroupTotals(BaseModel):
    """What one group adds up to, with monthly and once-off amounts kept apart."""

    recurring_monthly: Decimal = Decimal("0")
    one_time: Decimal = Decimal("0")
    count: int = 0


class ImpactSummary(BaseModel):
    """Totals that do not count one financial event twice.

    The recurring and one-time potentials are estimates that need verification.
    ``observed_total_paid`` is money actually paid, taken only from findings that
    report a historical figure.
    """

    recurring_monthly_potential: Decimal = Decimal("0")
    recurring_monthly_before_dedupe: Decimal = Decimal("0")
    one_time_potential: Decimal = Decimal("0")
    one_time_before_dedupe: Decimal = Decimal("0")
    double_counting_prevented: Decimal = Decimal("0")
    observed_total_paid: Decimal = Decimal("0")
    recurring_monthly_by_status: dict[str, Decimal] = Field(default_factory=dict)
    # Counted findings only, by group. The groups are never summed into one figure.
    by_group: dict[str, GroupTotals] = Field(default_factory=dict)
    findings_without_observed_amount: list[str] = Field(default_factory=list)
    overlaps: list[FindingOverlap] = Field(default_factory=list)
    findings: list[FindingImpact] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class LeakDetectionResult(BaseModel):
    """Leak detections for a single user and a single snapshot period."""

    user_id: str
    transaction_count: int
    period_start: date | None = None
    period_end: date | None = None
    detector_version: str
    leaks: list[LeakDetection] = Field(default_factory=list)
    analysis_summary: LeakResultSummary | None = None
    # Totals that never count one event twice; see finding_overlap.summarise_impact.
    impact_summary: ImpactSummary | None = None
    # Findings kept for the investigation history but not shown as separate
    # findings because another finding's transactions already explain them.
    explained_leaks: list[LeakDetection] = Field(default_factory=list)
    questions: list[FindingQuestion] = Field(default_factory=list)
    questions_not_shown: int = 0
    # Why look-alikes were not raised. Debug and tuning only; never a finding.
    near_misses: list[NearMiss] = Field(default_factory=list)
