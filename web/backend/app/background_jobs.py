from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel
from sqlalchemy.orm import Session

from .database import SessionLocal
from .forensic_engine import ForensicEngine
from .ml_engine import MLEngine
from .models_db import AnalysisResult, BackgroundJob, LinkedAccount, Transaction
from .open_banking_client import OpenBankingSandboxClient, SandboxConfig
from .settings import settings

logger = logging.getLogger(__name__)

JOB_OPEN_BANKING_FETCH = "open_banking.fetch_transactions"
JOB_ML_DETECT_ANOMALIES = "ml.detect_anomalies"
JOB_ML_PREDICT_LEAKS = "ml.predict_leaks"

_worker_task: asyncio.Task | None = None


class JobAcceptedResponse(BaseModel):
    job_id: str
    status: str
    message: str


def enqueue_background_job(
    db: Session, job_type: str, user_id: Any, payload: dict[str, Any]
) -> BackgroundJob:
    job = BackgroundJob(
        job_id=uuid.uuid4().hex,
        job_type=job_type,
        status="pending",
        user_id=user_id,
        payload=payload,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def start_background_worker() -> None:
    global _worker_task
    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker_loop())


async def stop_background_worker() -> None:
    global _worker_task
    if _worker_task is None:
        return
    _worker_task.cancel()
    try:
        await _worker_task
    except asyncio.CancelledError:
        pass
    _worker_task = None


async def _worker_loop() -> None:
    while True:
        try:
            did_work = await _run_next_job()
            await asyncio.sleep(0 if did_work else 2)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("background worker loop failed")
            await asyncio.sleep(5)


async def _run_next_job() -> bool:
    db = SessionLocal()
    try:
        job = (
            db.query(BackgroundJob)
            .filter(BackgroundJob.status == "pending")
            .order_by(BackgroundJob.created_at.asc())
            .first()
        )
        if not job:
            return False

        job.status = "running"
        job.started_at = datetime.utcnow()
        job_pk = job.id
        db.commit()

        try:
            result = await _perform_job(db, job)
            job.status = "succeeded"
            job.result = result
            job.error = None
        except Exception as exc:
            db.rollback()
            job = db.query(BackgroundJob).filter(BackgroundJob.id == job_pk).first()
            if job is None:
                raise
            job.status = "failed"
            job.error = str(exc)
            logger.exception(
                "background job failed",
                extra={"job_id": job.job_id, "job_type": job.job_type},
            )
        finally:
            if job is not None:
                job.finished_at = datetime.utcnow()
                db.commit()
        return True
    finally:
        db.close()


async def _perform_job(db: Session, job: BackgroundJob) -> dict[str, Any]:
    if job.job_type == JOB_OPEN_BANKING_FETCH:
        return await _run_open_banking_fetch(db, job)
    if job.job_type == JOB_ML_DETECT_ANOMALIES:
        return _run_ml_detect_anomalies(db, job)
    if job.job_type == JOB_ML_PREDICT_LEAKS:
        return _run_ml_predict_leaks(db, job)
    raise ValueError(f"Unsupported job type: {job.job_type}")


async def _run_open_banking_fetch(db: Session, job: BackgroundJob) -> dict[str, Any]:
    account_id = int((job.payload or {}).get("account_id"))
    account = (
        db.query(LinkedAccount)
        .filter(LinkedAccount.id == account_id, LinkedAccount.user_id == job.user_id)
        .first()
    )
    if not account:
        raise ValueError("Account not found")
    if not account.open_banking_consent_id:
        raise ValueError("Account not linked via Open Banking")

    ob_client = OpenBankingSandboxClient(
        SandboxConfig(
            base_url=settings.open_banking_base_url,
            client_id=settings.open_banking_client_id,
            client_secret=settings.open_banking_client_secret,
        )
    )
    forensic_engine = ForensicEngine()

    token_response = await ob_client.token_client_credentials(
        consent_id=account.open_banking_consent_id,
        scope="accounts.read transactions.read",
    )
    access_token = token_response.get("access_token")
    if not access_token:
        raise ValueError(
            f"Open Banking {settings.open_banking_mode} provider did not return a data access token"
        )

    accounts_response = await ob_client.list_accounts(access_token=access_token)
    bank_account_ids = _extract_account_ids(accounts_response)

    raw_txs: list[dict[str, Any]] = []
    for bank_account_id in bank_account_ids:
        tx_response = await ob_client.list_transactions(
            access_token=access_token, account_id=bank_account_id
        )
        raw_txs.extend(tx_response.get("Data", {}).get("Transaction", []))

    new_tx_count = 0
    tx_dicts_for_analysis: list[dict[str, Any]] = []
    for rt in raw_txs:
        ext_id = rt.get("TransactionId")
        if not ext_id:
            continue

        amount_data = rt.get("Amount", {})
        amount = float(amount_data.get("Amount", 0))
        booking_time = rt.get("BookingDateTime")
        existing = (
            db.query(Transaction).filter(Transaction.transaction_id == ext_id).first()
        )
        if not existing:
            db.add(
                Transaction(
                    user_id=job.user_id,
                    account_id=account.id,
                    transaction_id=ext_id,
                    timestamp=datetime.fromisoformat(
                        booking_time.replace("Z", "+00:00")
                    ),
                    amount=amount,
                    currency=amount_data.get("Currency", "ZAR"),
                    description=rt.get("ProprietaryBankTransactionCode", {}).get(
                        "Description", "Bank Transaction"
                    ),
                    merchant=rt.get("MerchantDetails", {}).get("MerchantName"),
                    transaction_data=rt,
                    direction="debit" if amount < 0 else "credit",
                )
            )
            new_tx_count += 1

        tx_dicts_for_analysis.append(
            {
                "id": ext_id,
                "timestamp": booking_time,
                "amount": amount,
                "description": rt.get("ProprietaryBankTransactionCode", {}).get(
                    "Description", ""
                ),
                "merchant": rt.get("MerchantDetails", {}).get("MerchantName", ""),
                "direction": "debit" if amount < 0 else "credit",
            }
        )

    db.commit()

    health_score = None
    if tx_dicts_for_analysis:
        analysis = forensic_engine.analyze(tx_dicts_for_analysis)
        health_score = analysis["financial_health_score"]
        analysis_leaks = list(analysis["money_leaks"])
        analysis_leaks.append(
            {
                "id": "source-open-banking",
                "detector": "DataSource",
                "title": "Open Banking source",
                "source": "open_banking",
                "verified": True,
                "consent_id": account.open_banking_consent_id,
            }
        )
        db.add(
            AnalysisResult(
                user_id=job.user_id,
                financial_health_score=analysis["financial_health_score"],
                health_band=analysis["health_band"],
                money_leaks=analysis_leaks,
                summary_plain_language=analysis["summary_plain_language"],
                transaction_count=len(tx_dicts_for_analysis),
            )
        )

    account.last_synced_at = datetime.utcnow()
    account.status = "active"
    db.commit()

    return {
        "account_id": account_id,
        "new_transactions": new_tx_count,
        "total_monitored": len(tx_dicts_for_analysis),
        "health_score": health_score,
    }


def _run_ml_detect_anomalies(db: Session, job: BackgroundJob) -> dict[str, Any]:
    limit = int((job.payload or {}).get("limit", 1000))
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == job.user_id)
        .order_by(Transaction.timestamp.desc())
        .limit(limit)
        .all()
    )
    if not transactions:
        return {
            "anomalies": [],
            "anomaly_scores": {},
            "anomaly_count": 0,
            "total_transactions": 0,
        }

    txn_dicts = [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "amount": t.amount,
            "description": t.description,
            "merchant": t.merchant,
            "category": t.category,
            "direction": t.direction,
        }
        for t in transactions
    ]
    return MLEngine().detect_anomalies(txn_dicts)


def _run_ml_predict_leaks(db: Session, job: BackgroundJob) -> dict[str, Any]:
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == job.user_id)
        .order_by(Transaction.timestamp.desc())
        .limit(500)
        .all()
    )
    if not transactions:
        return {"predicted_leaks": [], "confidence": 0.0}

    txn_dicts = [
        {
            "id": t.id,
            "timestamp": t.timestamp.isoformat(),
            "amount": t.amount,
            "description": t.description,
        }
        for t in transactions
    ]
    analyses = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.user_id == job.user_id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(10)
        .all()
    )

    historical_leaks: list[dict[str, Any]] = []
    for analysis in analyses:
        if analysis.money_leaks:
            historical_leaks.extend(analysis.money_leaks)

    return MLEngine().predict_future_leaks(txn_dicts, historical_leaks)


def _extract_account_ids(accounts_response: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    data = accounts_response.get("Data") or accounts_response
    accounts = data.get("Account") if isinstance(data, dict) else None
    if not accounts and isinstance(data, dict) and "Account" not in data:
        accounts = data.get("accounts") or (data if isinstance(data, list) else None)
    if not accounts:
        return ids
    for acc in accounts if isinstance(accounts, list) else [accounts]:
        if not isinstance(acc, dict):
            continue
        aid = acc.get("AccountId") or acc.get("account_id") or acc.get("identification")
        if aid and isinstance(aid, str):
            ids.append(aid)
    return ids
