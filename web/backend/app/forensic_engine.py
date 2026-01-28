from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import pandas as pd


@dataclass
class Leak:
    id: str
    detector: str
    title: str
    plain_language_reason: str
    severity: str  # "low" | "medium" | "high"
    transaction_id: Optional[str] = None
    estimated_monthly_cost: Optional[float] = None
    evidence: Optional[Dict[str, Any]] = None


class ForensicEngine:
    """
    Money Autopsy "Forensic Engine"

    Ingests transaction JSON and runs simple detectors using Pandas.
    Designed to be explainable + plain-language for the Eastern Cape context.
    """

    def ingest(self, transactions: List[Dict[str, Any]]) -> pd.DataFrame:
        df = pd.DataFrame(transactions).copy()
        if df.empty:
            return df

        # Normalize expected fields
        for col in ["id", "timestamp", "amount", "description", "merchant", "category", "counterparty", "direction", "channel"]:
            if col not in df.columns:
                df[col] = None

        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
        df["description"] = df["description"].fillna("").astype(str)
        df["merchant"] = df["merchant"].fillna("").astype(str)
        df["category"] = df["category"].fillna("").astype(str)
        df["counterparty"] = df["counterparty"].fillna("").astype(str)
        df["direction"] = df["direction"].fillna("").astype(str).str.lower()
        df["channel"] = df["channel"].fillna("").astype(str).str.lower()

        # Heuristic: if direction missing, infer from sign
        missing_dir = df["direction"].isin(["", "none", "nan"])
        df.loc[missing_dir & (df["amount"] < 0), "direction"] = "debit"
        df.loc[missing_dir & (df["amount"] > 0), "direction"] = "credit"
        df["abs_amount"] = df["amount"].abs()

        return df

    # -----------------------------
    # Detectors
    # -----------------------------
    def detect_airtime_drains(self, df: pd.DataFrame) -> List[Leak]:
        """
        Airtime Drains:
        Identify repeated small telco-related purchases (e.g., airtime/data),
        especially if frequent (many small debits).
        """
        if df.empty:
            return []

        telco_keywords = [
            "airtime",
            "data",
            "bundle",
            "vodacom",
            "mtn",
            "cell c",
            "telkom",
            "prepaid",
        ]

        text = (df["description"] + " " + df["merchant"] + " " + df["category"]).str.lower()
        is_telco = text.apply(lambda s: any(k in s for k in telco_keywords))

        candidates = df[is_telco & (df["direction"] == "debit") & (df["abs_amount"] > 0) & (df["abs_amount"] <= 50)]
        if candidates.empty:
            return []

        last_30 = candidates[candidates["timestamp"] >= (pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(days=30))]
        freq = int(len(last_30))
        monthly_cost = float(last_30["abs_amount"].sum()) if not last_30.empty else float(candidates["abs_amount"].sum())

        if freq < 5 and monthly_cost < 150:
            return []

        severity = "high" if monthly_cost >= 300 or freq >= 12 else "medium"
        return [
            Leak(
                id="airtime-drain",
                detector="AirtimeDrains",
                title="Airtime is quietly draining your money",
                plain_language_reason=(
                    f"You made {freq} small airtime/data buys recently. "
                    f"Small top-ups add up — estimated about R{monthly_cost:.0f} per month."
                ),
                severity=severity,
                transaction_id=str(last_30.sort_values("timestamp").iloc[-1]["id"]) if not last_30.empty else None,
                estimated_monthly_cost=monthly_cost,
                evidence={
                    "count_last_30_days": freq,
                    "sum_last_30_days": monthly_cost,
                    "sample": candidates.sort_values("timestamp").tail(5)[["id", "timestamp", "abs_amount", "description"]].to_dict(orient="records"),
                },
            )
        ]

    def detect_fee_leakage(self, df: pd.DataFrame) -> List[Leak]:
        """
        Fee Leakage:
        Identify service fees / cash-out fees keywords and sum them.
        """
        if df.empty:
            return []

        fee_keywords = [
            "service fee",
            "charge",
            "fee",
            "cash-out",
            "cash out",
            "withdrawal fee",
            "transfer fee",
        ]

        text = (df["description"] + " " + df["merchant"] + " " + df["category"]).str.lower()
        is_fee = text.apply(lambda s: any(k in s for k in fee_keywords))
        fees = df[is_fee & (df["direction"] == "debit") & (df["abs_amount"] > 0)]
        if fees.empty:
            return []

        last_30 = fees[fees["timestamp"] >= (pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(days=30))]
        monthly_cost = float(last_30["abs_amount"].sum()) if not last_30.empty else float(fees["abs_amount"].sum())
        count = int(len(last_30)) if not last_30.empty else int(len(fees))

        if monthly_cost < 40 and count < 3:
            return []

        severity = "high" if monthly_cost >= 150 else "medium"
        return [
            Leak(
                id="fee-leakage",
                detector="FeeLeakage",
                title="Fees are eating your balance",
                plain_language_reason=(
                    f"You paid about R{monthly_cost:.0f} in fees recently (service fees / cash-out fees). "
                    "That’s money leaving without helping your household."
                ),
                severity=severity,
                transaction_id=str(last_30.sort_values("timestamp").iloc[-1]["id"]) if not last_30.empty else None,
                estimated_monthly_cost=monthly_cost,
                evidence={
                    "count_last_30_days": count,
                    "sum_last_30_days": monthly_cost,
                    "sample": fees.sort_values("timestamp").tail(8)[["id", "timestamp", "abs_amount", "description"]].to_dict(orient="records"),
                },
            )
        ]

    def detect_informal_loan_ratios(self, df: pd.DataFrame) -> List[Leak]:
        """
        Informal Loan Ratios:
        Flag frequent P2P transfers (non-bank) where many debits look like borrowing/repayment.
        """
        if df.empty:
            return []

        p2p_keywords = [
            "p2p",
            "send money",
            "momo",
            "wallet",
            "pay to",
            "payto",
            "e-wallet",
            "ewallet",
        ]
        loan_keywords = ["loan", "borrow", "repay", "repayment", "stokvel", "sassa", "mashonisa"]

        text = (df["description"] + " " + df["counterparty"] + " " + df["channel"]).str.lower()
        is_p2p = text.apply(lambda s: any(k in s for k in p2p_keywords))
        looks_like_loan = text.apply(lambda s: any(k in s for k in loan_keywords))

        debits = df[(df["direction"] == "debit") & (df["abs_amount"] > 0)]
        if debits.empty:
            return []

        last_30 = debits[debits["timestamp"] >= (pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(days=30))]
        if last_30.empty:
            return []

        p2p_last_30 = last_30[is_p2p.reindex(last_30.index, fill_value=False)]
        if p2p_last_30.empty:
            return []

        ratio = float(p2p_last_30["abs_amount"].sum()) / float(max(last_30["abs_amount"].sum(), 1.0))
        tagged = p2p_last_30[looks_like_loan.reindex(p2p_last_30.index, fill_value=False)]

        if ratio < 0.25 and len(tagged) < 2:
            return []

        severity = "high" if ratio >= 0.45 else "medium"
        return [
            Leak(
                id="informal-loan-ratio",
                detector="InformalLoanRatios",
                title="Too much money is going to informal loans",
                plain_language_reason=(
                    f"About {ratio*100:.0f}% of your spending in the last 30 days looks like person-to-person transfers. "
                    "This can be a sign of informal borrowing pressure."
                ),
                severity=severity,
                transaction_id=str(p2p_last_30.sort_values("timestamp").iloc[-1]["id"]),
                estimated_monthly_cost=float(p2p_last_30["abs_amount"].sum()),
                evidence={
                    "p2p_spend_last_30_days": float(p2p_last_30["abs_amount"].sum()),
                    "total_spend_last_30_days": float(last_30["abs_amount"].sum()),
                    "ratio": ratio,
                    "tagged_loan_like_count": int(len(tagged)),
                    "sample": p2p_last_30.sort_values("timestamp").tail(6)[["id", "timestamp", "abs_amount", "description", "counterparty"]].to_dict(
                        orient="records"
                    ),
                },
            )
        ]

    # -----------------------------
    # Scoring + orchestration
    # -----------------------------
    def analyze(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        df = self.ingest(transactions)

        leaks: List[Leak] = []
        leaks.extend(self.detect_airtime_drains(df))
        leaks.extend(self.detect_fee_leakage(df))
        leaks.extend(self.detect_informal_loan_ratios(df))

        score = self._score(df, leaks)
        band = "green" if score >= 75 else "yellow" if score >= 50 else "red"
        summary = self._summary_plain_language(score, band, leaks)

        return {
            "financial_health_score": score,
            "health_band": band,
            "money_leaks": [self._leak_to_dict(l) for l in leaks],
            "summary_plain_language": summary,
        }

    def _score(self, df: pd.DataFrame, leaks: List[Leak]) -> int:
        # Start at 100 and subtract penalties based on severity + estimated leakage.
        score = 100.0

        sev_penalty = {"low": 8, "medium": 18, "high": 30}
        for leak in leaks:
            score -= sev_penalty.get(leak.severity, 12)
            if leak.estimated_monthly_cost:
                score -= min(25.0, leak.estimated_monthly_cost / 20.0)  # e.g. R500 => -25 max

        # If we have few/no transactions, reduce confidence slightly.
        if df.empty or len(df) < 8:
            score -= 10.0

        return int(max(0, min(100, round(score))))

    def _summary_plain_language(self, score: int, band: str, leaks: List[Leak]) -> str:
        if not leaks:
            return "No big money leaks found. Keep tracking your spending and check again after a few days."

        top = sorted(leaks, key=lambda l: {"high": 0, "medium": 1, "low": 2}.get(l.severity, 9))[0]
        if band == "red":
            return f"Warning: your money is leaking. Biggest issue: {top.title}. Tap Freeze to simulate stopping it."
        if band == "yellow":
            return f"Your finances are under pressure. Biggest issue: {top.title}. Small changes can help fast."
        return f"Looking good overall. Still, watch out for: {top.title}."

    def _leak_to_dict(self, leak: Leak) -> Dict[str, Any]:
        return {
            "id": leak.id,
            "detector": leak.detector,
            "title": leak.title,
            "plain_language_reason": leak.plain_language_reason,
            "severity": leak.severity,
            "transaction_id": leak.transaction_id,
            "estimated_monthly_cost": leak.estimated_monthly_cost,
            "evidence": leak.evidence or {},
        }


