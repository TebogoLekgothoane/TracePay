"""Feature engineering for the future leak pipeline.

Authoritative path when wired:
transactions → categorisation → leak intelligence → leak_detections → FastAPI → mobile.
"""

from .behaviour_engine import analyze_behaviour
from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .engine import build_financial_features
from .models import FeatureTransaction, FinancialFeatureSnapshot, SpendingProfile
from .service import build_spending_profile

__all__ = [
    "FeatureTransaction",
    "FinancialFeatureSnapshot",
    "SpendingProfile",
    "BehaviourAnalysisResult",
    "BehaviourObservation",
    "analyze_behaviour",
    "build_financial_features",
    "build_spending_profile",
]
