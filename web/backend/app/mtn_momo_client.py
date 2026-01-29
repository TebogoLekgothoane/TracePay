from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List

import httpx


class MTNMoMoClient:
    """
    MTN MoMo API Client
    
    Note: This is a simulation client. In production, you would integrate
    with the actual MTN MoMo API which may require partnership/approval.
    """

    def __init__(self, api_key: str = "", base_url: str = ""):
        self.api_key = api_key
        self.base_url = base_url or "https://api.mtn.com/momo"  # Placeholder

    async def link_account(self, phone_number: str, pin: str) -> Dict[str, Any]:
        """
        Link an MTN MoMo account
        
        In production, this would authenticate with MTN's API.
        For now, we simulate the response.
        """
        # Simulated response
        return {
            "account_id": f"momo_{phone_number}",
            "phone_number": phone_number,
            "status": "linked",
            "linked_at": datetime.utcnow().isoformat(),
        }

    async def fetch_transactions(
        self, account_id: str, start_date: datetime | None = None, end_date: datetime | None = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch MTN MoMo transactions
        
        In production, this would call MTN's API.
        For now, we return mock data based on patterns.
        """
        if not start_date:
            start_date = datetime.utcnow() - timedelta(days=30)
        if not end_date:
            end_date = datetime.utcnow()

        # Simulated transactions - in production, fetch from MTN API
        # This would include:
        # - Cash-in transactions
        # - Cash-out transactions (with fees)
        # - Airtime purchases
        # - P2P transfers
        # - Bill payments
        
        return []

    def calculate_inclusion_tax(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculate "Inclusion Tax" = (Cash-Out Fees / Total MoMo Volume) × 100
        
        This measures how much of a user's MoMo activity is lost to fees.
        """
        total_volume = 0.0
        cash_out_fees = 0.0
        cash_out_count = 0

        for txn in transactions:
            amount = abs(float(txn.get("amount", 0)))
            description = str(txn.get("description", "")).lower()
            direction = str(txn.get("direction", "")).lower()

            # Count all MoMo volume
            if "momo" in description or txn.get("channel") == "momo":
                total_volume += amount

            # Count cash-out fees
            if "cash-out" in description or "cash out" in description or "withdrawal" in description:
                if "fee" in description or direction == "debit":
                    cash_out_fees += amount
                    cash_out_count += 1

        inclusion_tax_percentage = (cash_out_fees / total_volume * 100) if total_volume > 0 else 0.0

        return {
            "inclusion_tax_percentage": round(inclusion_tax_percentage, 2),
            "total_momo_volume": round(total_volume, 2),
            "cash_out_fees": round(cash_out_fees, 2),
            "cash_out_count": cash_out_count,
        }

    def detect_momo_patterns(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Detect MoMo-specific patterns:
        - Airtime-to-cash conversions
        - Frequent small cash-outs
        - High fee-to-volume ratios
        """
        patterns = []

        # Pattern: Frequent small cash-outs
        cash_outs = [t for t in transactions if "cash-out" in str(t.get("description", "")).lower()]
        if len(cash_outs) >= 5:
            avg_amount = sum(abs(float(t.get("amount", 0))) for t in cash_outs) / len(cash_outs)
            if avg_amount < 100:  # Small cash-outs
                patterns.append({
                    "type": "frequent_small_cashouts",
                    "count": len(cash_outs),
                    "average_amount": round(avg_amount, 2),
                    "severity": "medium",
                })

        # Pattern: High inclusion tax
        inclusion_tax = self.calculate_inclusion_tax(transactions)
        if inclusion_tax["inclusion_tax_percentage"] > 5.0:  # More than 5% lost to fees
            patterns.append({
                "type": "high_inclusion_tax",
                "percentage": inclusion_tax["inclusion_tax_percentage"],
                "severity": "high",
            })

        return patterns

