from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler


class MLEngine:
    """
    Machine Learning Engine for anomaly detection and user clustering
    """

    def __init__(self):
        self.scaler = StandardScaler()
        self.isolation_forest = IsolationForest(contamination=0.1, random_state=42)
        self.kmeans = KMeans(n_clusters=5, random_state=42, n_init=10)

    def detect_anomalies(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Detect anomalous transactions using Isolation Forest
        
        Returns:
            - anomalies: List of anomalous transaction IDs
            - anomaly_scores: Scores for each transaction (lower = more anomalous)
        """
        if len(transactions) < 10:
            return {"anomalies": [], "anomaly_scores": {}, "message": "Not enough transactions for anomaly detection"}

        df = pd.DataFrame(transactions)

        # Prepare features
        features = []
        feature_names = []

        # Amount features
        if "amount" in df.columns:
            df["abs_amount"] = df["amount"].abs()
            features.append(df["abs_amount"].values)
            feature_names.append("amount")

        # Time features
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
            if not df["timestamp"].isna().all():
                df["hour"] = df["timestamp"].dt.hour
                df["day_of_week"] = df["timestamp"].dt.dayofweek
                features.append(df["hour"].fillna(12).values)
                features.append(df["day_of_week"].fillna(3).values)
                feature_names.extend(["hour", "day_of_week"])

        if not features:
            return {"anomalies": [], "anomaly_scores": {}, "message": "Insufficient features for anomaly detection"}

        # Combine features
        X = np.column_stack(features)

        # Scale features
        X_scaled = self.scaler.fit_transform(X)

        # Fit Isolation Forest
        self.isolation_forest.fit(X_scaled)
        anomaly_scores = self.isolation_forest.score_samples(X_scaled)
        predictions = self.isolation_forest.predict(X_scaled)

        # Anomalies are those predicted as -1
        anomaly_indices = np.where(predictions == -1)[0]
        anomaly_ids = [str(df.iloc[i].get("id", i)) for i in anomaly_indices]

        # Create score dictionary
        scores_dict = {str(df.iloc[i].get("id", i)): float(anomaly_scores[i]) for i in range(len(df))}

        return {
            "anomalies": anomaly_ids,
            "anomaly_scores": scores_dict,
            "anomaly_count": len(anomaly_ids),
            "total_transactions": len(transactions),
        }

    def cluster_users(self, user_transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Cluster users by spending profile using K-means
        
        Returns:
            - cluster_id: The cluster this user belongs to
            - cluster_profile: Description of the cluster
        """
        if len(user_transactions) < 5:
            return {"cluster_id": -1, "cluster_profile": "insufficient_data"}

        df = pd.DataFrame(user_transactions)

        # Calculate spending features
        features = []

        # Average transaction amount
        if "amount" in df.columns:
            df["abs_amount"] = df["amount"].abs()
            avg_amount = df["abs_amount"].mean()
            features.append(avg_amount)

        # Transaction frequency (transactions per day)
        if "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
            if not df["timestamp"].isna().all():
                date_range = (df["timestamp"].max() - df["timestamp"].min()).days
                freq = len(df) / max(date_range, 1)
                features.append(freq)

        # Weekend vs weekday ratio
        if "timestamp" in df.columns and not df["timestamp"].isna().all():
            df["day_of_week"] = df["timestamp"].dt.dayofweek
            weekend_count = (df["day_of_week"].isin([5, 6])).sum()
            weekday_count = (~df["day_of_week"].isin([5, 6])).sum()
            weekend_ratio = weekend_count / max(weekday_count + weekend_count, 1)
            features.append(weekend_ratio)

        if len(features) < 2:
            return {"cluster_id": -1, "cluster_profile": "insufficient_features"}

        # For single user, we can't cluster. This would be used with multiple users.
        # For now, return a simple profile based on features
        X = np.array([features])

        # Simple heuristic clustering based on spending patterns
        avg_amount = features[0] if len(features) > 0 else 0
        freq = features[1] if len(features) > 1 else 0

        if avg_amount < 50 and freq > 5:
            cluster_id = 0
            profile = "frequent_small_spender"
        elif avg_amount > 500:
            cluster_id = 1
            profile = "high_value_spender"
        elif freq < 1:
            cluster_id = 2
            profile = "infrequent_spender"
        else:
            cluster_id = 3
            profile = "moderate_spender"

        return {
            "cluster_id": cluster_id,
            "cluster_profile": profile,
            "features": {
                "avg_transaction_amount": float(avg_amount),
                "transactions_per_day": float(freq),
            },
        }

    def predict_future_leaks(self, transactions: List[Dict[str, Any]], historical_leaks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Predict potential future money leaks based on patterns
        
        This is a simplified prediction - in production, you'd use more sophisticated models.
        """
        if len(transactions) < 10:
            return {"predicted_leaks": [], "confidence": 0.0}

        df = pd.DataFrame(transactions)

        predicted = []

        # Pattern: Increasing subscription-like payments
        if "amount" in df.columns and "timestamp" in df.columns:
            df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
            df["abs_amount"] = df["amount"].abs()
            monthly_totals = df.groupby(df["timestamp"].dt.to_period("M"))["abs_amount"].sum()

            if len(monthly_totals) >= 3:
                trend = (monthly_totals.iloc[-1] - monthly_totals.iloc[0]) / len(monthly_totals)
                if trend > 50:  # Increasing trend
                    predicted.append({
                        "type": "increasing_spending",
                        "description": "Your spending is trending upward",
                        "confidence": 0.7,
                    })

        return {
            "predicted_leaks": predicted,
            "confidence": 0.6 if predicted else 0.0,
        }

