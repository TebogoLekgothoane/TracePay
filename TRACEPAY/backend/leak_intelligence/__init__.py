"""Feature engineering for the future leak pipeline.

Authoritative path when wired:
transactions → categorisation → leak intelligence → leak_detections → FastAPI → mobile.
"""

from .models import FeatureTransaction, SpendingProfile
from .service import build_spending_profile

__all__ = ["FeatureTransaction", "SpendingProfile", "build_spending_profile"]
