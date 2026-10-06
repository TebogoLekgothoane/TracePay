"""Feature engineering for the future leak pipeline.

Authoritative path when wired:
transactions → categorisation → leak intelligence → leak_detections → FastAPI → mobile.
"""

from .behaviour_engine import analyze_behaviour
from .behaviour_models import BehaviourAnalysisResult, BehaviourObservation
from .engine import build_financial_features
from .leak_engine import detect_leaks
from .leak_models import LeakDetection, LeakDetectionResult
from .models import FeatureTransaction, FinancialFeatureSnapshot, SpendingProfile
from .reasoning_engine import analyze_financial_reasoning
from .reasoning_models import FinancialReasoning, FinancialReasoningResult
from .service import build_spending_profile

__all__ = [
    "FeatureTransaction",
    "FinancialFeatureSnapshot",
    "SpendingProfile",
    "BehaviourAnalysisResult",
    "BehaviourObservation",
    "LeakDetection",
    "LeakDetectionResult",
    "FinancialReasoning",
    "FinancialReasoningResult",
    "analyze_behaviour",
    "analyze_financial_reasoning",
    "build_financial_features",
    "build_spending_profile",
    "detect_leaks",
]
