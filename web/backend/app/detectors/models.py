from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

@dataclass
class Leak:
    id: str
    detector: str
    title: str
    plain_language_reason: str
    severity: str
    transaction_id: str | None = None
    estimated_monthly_cost: float | None = None
    evidence: Dict[str, Any] | None = None
