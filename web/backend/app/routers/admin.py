from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..audit import add_audit_event
from ..auth import ROLE_ADMIN, ROLE_INVESTOR, ROLE_PARTNER, ROLE_USER, AuthenticatedUser, get_current_admin_user
from ..database import get_db, SessionLocal
from ..models_db import AnalysisResult, AuditLog, FrozenItem, LinkedAccount, Partner, Profile, Redemption, Transaction
from ..open_banking_client import OpenBankingSandboxClient, SandboxConfig
from ..settings import settings
from ..stats import OverviewStats, RegionalInsight, compute_overview_stats, compute_regional_stats
from ..supabase_admin import SupabaseAdminError, invite_user_by_email
from ..forensic_engine import ForensicEngine


def audit_admin_request(
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> AuthenticatedUser:
    add_audit_event(
        db,
        "admin_action",
        actor=current_user,
        target_user=current_user,
        metadata={"action": request.scope.get("route").path if request.scope.get("route") else request.url.path},
        request=request,
    )
    db.commit()
    return current_user


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(audit_admin_request)],
)

# Initialize OB Client for global sync
sandbox_config = SandboxConfig(
    client_id=settings.open_banking_client_id,
    client_secret=settings.open_banking_client_secret,
)
ob_client = OpenBankingSandboxClient(sandbox_config)
forensic_engine = ForensicEngine()


class FollowUpRequest(BaseModel):
    note: str = ""


@router.get("/stats/overview", response_model=OverviewStats)
def get_overview_stats(
    db: Session = Depends(get_db),
) -> OverviewStats:
    """Get overall platform statistics from persisted platform data."""
    return compute_overview_stats(db)


@router.get("/stats/regional", response_model=List[RegionalInsight])
def get_regional_stats(
    db: Session = Depends(get_db),
) -> List[RegionalInsight]:
    """Get regional leakage trends from persisted regional metrics."""
    return compute_regional_stats(db)


@router.get("/stats/temporal")
def get_temporal_stats(
    db: Session = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
) -> Dict[str, Any]:
    """Get time-based trends from persisted analyses."""
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)

    # Get analyses in time range
    analyses = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.created_at >= start_date, AnalysisResult.created_at <= end_date)
        .all()
    )

    # Group by date
    daily_scores = {}
    for analysis in analyses:
        date_key = analysis.created_at.date().isoformat()
        if date_key not in daily_scores:
            daily_scores[date_key] = []
        daily_scores[date_key].append(analysis.financial_health_score)

    # Calculate averages
    temporal_data = [
        {"date": date, "average_score": sum(scores) / len(scores), "count": len(scores)}
        for date, scores in sorted(daily_scores.items())
    ]

    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "total_analyses": len(analyses),
        "temporal_data": temporal_data,
    }


@router.get("/stats/user-segments")
def get_user_segments(
    current_user: AuthenticatedUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get user segment analysis"""
    # Group users by health score bands
    analyses = db.query(AnalysisResult).all()

    green_count = sum(1 for a in analyses if a.health_band == "green")
    yellow_count = sum(1 for a in analyses if a.health_band == "yellow")
    red_count = sum(1 for a in analyses if a.health_band == "red")

    return {
        "green_band": green_count,
        "yellow_band": yellow_count,
        "red_band": red_count,
        "total_users": len(analyses),
    }


@router.get("/stats/ml-findings")
def get_ml_findings(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Summary of analysis findings across the platform."""
    leak_counts: dict[str, int] = {}
    anomaly_distribution = {"high_risk": 0, "medium_risk": 0, "low_risk": 0}
    predicted_savings_next_month = 0.0

    analyses = db.query(AnalysisResult).all()
    for analysis in analyses:
        for leak in analysis.money_leaks or []:
            detector = leak.get("detector")
            if detector in {"InclusionScorer", "StakeholderMetrics", "DataSource"}:
                continue

            category = leak.get("title") or leak.get("detector") or "Uncategorized"
            leak_counts[category] = leak_counts.get(category, 0) + 1
            predicted_savings_next_month += float(leak.get("estimated_monthly_cost", 0.0) or 0.0)

            severity = str(leak.get("severity", "")).lower()
            if severity in {"critical", "high", "red"}:
                anomaly_distribution["high_risk"] += 1
            elif severity in {"medium", "warning", "yellow"}:
                anomaly_distribution["medium_risk"] += 1
            else:
                anomaly_distribution["low_risk"] += 1

    top_leak_categories = [
        {"category": category, "count": count, "growth": "0%"}
        for category, count in sorted(
            leak_counts.items(), key=lambda item: item[1], reverse=True
        )[:5]
    ]

    return {
        "top_leak_categories": top_leak_categories,
        "anomaly_distribution": anomaly_distribution,
        "predicted_savings_next_month": round(predicted_savings_next_month, 2),
    }


@router.get("/stats/data-ingestion")
def get_data_ingestion_stats(
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Metrics related to data sources and Open Banking ingestion"""
    total_accounts = db.query(LinkedAccount).count()
    ob_accounts = db.query(LinkedAccount).filter(LinkedAccount.open_banking_consent_id.isnot(None)).count()
    momo_accounts = db.query(LinkedAccount).filter(LinkedAccount.bank_name == "MTN MoMo").count()
    last_sync = db.query(func.max(LinkedAccount.last_synced_at)).scalar()

    return {
        "total_linked_accounts": total_accounts,
        "sources": {
            "open_banking": ob_accounts,
            "mtn_momo": momo_accounts,
            "manual": total_accounts - ob_accounts - momo_accounts
        },
        "ingestion_health": "active" if last_sync else "not_started",
        "last_sync_all": last_sync.isoformat() if last_sync else None
    }


async def perform_global_sync():
    """Sync existing linked accounts and store fresh analyses when data is available."""
    db = SessionLocal()
    try:
        accounts = db.query(LinkedAccount).all()
        if not accounts:
            return {"accounts_processed": 0, "new_transactions": 0}

        total_new_txs = 0
        accounts_processed = 0
        
        for account in accounts:
            try:
                tx_dicts_for_analysis = []
                
                if account.open_banking_consent_id:
                    # Open Banking Flow
                    try:
                        # 1. Get data access token
                        token_response = await ob_client.token_client_credentials(consent_id=account.open_banking_consent_id)
                        access_token = token_response.get("access_token")

                        # 2. Fetch raw transactions
                        bank_account_id = account.account_id.replace("ob_", "")
                        tx_response = await ob_client.list_transactions(access_token=access_token, account_id=bank_account_id)
                        raw_txs = tx_response.get("Data", {}).get("Transaction", [])
                        
                        for rt in raw_txs:
                            ext_id = rt.get("TransactionId")
                            if not ext_id: continue
                            
                            # Save & Deduplicate
                            existing = db.query(Transaction).filter(Transaction.transaction_id == ext_id).first()
                            if not existing:
                                amount_data = rt.get("Amount", {})
                                tx = Transaction(
                                    user_id=account.user_id,
                                    account_id=account.id,
                                    transaction_id=ext_id,
                                    timestamp=datetime.fromisoformat(rt.get("BookingDateTime").replace("Z", "+00:00")),
                                    amount=float(amount_data.get("Amount", 0)),
                                    currency=amount_data.get("Currency", "ZAR"),
                                    description=rt.get("ProprietaryBankTransactionCode", {}).get("Description", "Bank Transaction"),
                                    merchant=rt.get("MerchantDetails", {}).get("MerchantName"),
                                    direction="debit" if float(amount_data.get("Amount", 0)) < 0 else "credit"
                                )
                                db.add(tx)
                                total_new_txs += 1
                            
                            tx_dicts_for_analysis.append({
                                "id": ext_id,
                                "timestamp": rt.get("BookingDateTime"),
                                "amount": float(rt.get("Amount", {}).get("Amount", 0)),
                                "description": rt.get("ProprietaryBankTransactionCode", {}).get("Description", ""),
                                "merchant": rt.get("MerchantDetails", {}).get("MerchantName", ""),
                                "direction": "debit" if float(rt.get("Amount", {}).get("Amount", 0)) < 0 else "credit"
                            })
                    except Exception as e:
                        print(f"Open Banking sync failed for account {account.id}: {str(e)}")
                
                if not tx_dicts_for_analysis:
                    existing_txs = db.query(Transaction).filter(Transaction.account_id == account.id).limit(100).all()
                    for t in existing_txs:
                        tx_dicts_for_analysis.append({
                            "id": t.transaction_id,
                            "timestamp": t.timestamp.isoformat(),
                            "amount": t.amount,
                            "description": t.description or "",
                            "merchant": t.merchant or "",
                            "direction": t.direction or ("debit" if t.amount < 0 else "credit")
                        })

                # 3. Run Forensic Engine
                if tx_dicts_for_analysis:
                    analysis = forensic_engine.analyze(tx_dicts_for_analysis)
                    analysis_leaks = analysis["money_leaks"]
                    if "inclusion_metrics" in analysis:
                        analysis_leaks.append({
                            "id": "inclusion-metadata",
                            "detector": "InclusionScorer",
                            "title": "Inclusion Metrics",
                            "score": analysis["inclusion_metrics"]["score"],
                            "level": analysis["inclusion_metrics"]["level"],
                            "mno_consistency": analysis["inclusion_metrics"]["mno_consistency"]
                        })
                    
                    if "stakeholder_metrics" in analysis:
                        analysis_leaks.append({
                            "id": "stakeholder-metadata",
                            "detector": "StakeholderMetrics",
                            "title": "Stakeholder Analytics",
                            "inclusion_delta": analysis["stakeholder_metrics"]["inclusion_delta"],
                            "retail_velocity": analysis["stakeholder_metrics"]["retail_velocity"]
                        })

                    result = AnalysisResult(
                        user_id=account.user_id,
                        financial_health_score=analysis["financial_health_score"],
                        health_band=analysis["health_band"],
                        money_leaks=analysis_leaks,
                        summary_plain_language=analysis["summary_plain_language"],
                        transaction_count=len(tx_dicts_for_analysis)
                    )
                    db.add(result)
                
                account.last_synced_at = datetime.utcnow()
                accounts_processed += 1
                
            except Exception as e:
                print(f"Failed to sync account {account.id}: {str(e)}")
                continue

        db.commit()
    finally:
        db.close()

@router.post("/sync-all")
async def sync_all_data(
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """Global Ingestion Trigger: Sync all active Open Banking pipelines across the platform in background"""
    background_tasks.add_task(perform_global_sync)
    return {
        "status": "success",
        "message": "Global data ingestion started in background. Refresh the dashboard in a few seconds to see updated analytics.",
    }


@router.get("/users")
def list_users(
    current_user: AuthenticatedUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    """List all users (paginated)"""
    users = db.query(Profile).offset(skip).limit(limit).all()
    total = db.query(Profile).count()

    return {
        "users": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "role": u.role,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


class ProvisionUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    role: Literal[ROLE_USER, ROLE_ADMIN, ROLE_INVESTOR, ROLE_PARTNER]


class ProvisionUserResponse(BaseModel):
    id: str
    email: str
    role: str


@router.post(
    "/provision-user", response_model=ProvisionUserResponse, status_code=status.HTTP_201_CREATED
)
async def provision_user(
    req: ProvisionUserRequest,
    request: Request,
    current_user: AuthenticatedUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> ProvisionUserResponse:
    """Create a new Supabase Auth account and set its role.

    None of admin/investor/partner have self-service signup -- this is the
    only way to get one of those accounts. A plain "user" account can also
    be provisioned this way (e.g. setting someone up ahead of their first
    login), though most user accounts come from mobile self-signup instead.
    """
    email = req.email.strip().lower()
    try:
        invited = await invite_user_by_email(email, req.role)
    except SupabaseAdminError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    user_id = invited.get("id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return a user id for the invite.",
        )

    # A trigger on auth.users may already have inserted a default profiles
    # row by the time we get here -- upsert rather than a plain insert.
    db.execute(
        text(
            "INSERT INTO profiles (id, role, created_at) VALUES (:id, :role, now()) "
            "ON CONFLICT (id) DO UPDATE SET role = :role"
        ),
        {"id": user_id, "role": req.role},
    )
    add_audit_event(
        db,
        "user_provisioned",
        actor=current_user,
        target_user=uuid.UUID(user_id),
        metadata={"email": email, "role": req.role},
        request=request,
    )
    db.commit()

    return ProvisionUserResponse(id=str(user_id), email=email, role=req.role)


@router.get("/users/{user_id}/analysis")
def get_user_analysis(
    user_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get a user's analysis history."""
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        return {"error": "User not found"}

    analyses = db.query(AnalysisResult).filter(AnalysisResult.user_id == user_id).order_by(AnalysisResult.created_at.desc()).all()

    return {
        "user_id": user_id,
        "full_name": profile.full_name,
        "analyses": [
            {
                "id": a.id,
                "score": a.financial_health_score,
                "band": a.health_band,
                "created_at": a.created_at.isoformat(),
                "transaction_count": a.transaction_count,
                "money_leaks": a.money_leaks,
                "summary": a.summary_plain_language
            }
            for a in analyses
        ],
    }


def _analysis_open_banking_verified(result: AnalysisResult) -> bool:
    return any(
        leak.get("detector") == "DataSource"
        and leak.get("source") == "open_banking"
        and leak.get("verified") is True
        for leak in (result.money_leaks or [])
    )


def _analysis_feed_item(
    db: Session, result: AnalysisResult, profile: Profile
) -> Dict[str, Any]:
    leaks = []
    inclusion_delta = 0
    retail_velocity = 0

    if result.money_leaks:
        for leak in result.money_leaks:
            if leak.get("detector") not in ["InclusionScorer", "StakeholderMetrics", "DataSource"]:
                leaks.append({
                    "type": leak.get("title", "Unknown Leak"),
                    "severity": leak.get("severity", "info"),
                    "impact": leak.get("estimated_monthly_cost", 0),
                    "name_xhosa": leak.get("name_xhosa", "")
                })
            if leak.get("detector") == "StakeholderMetrics":
                inclusion_delta = leak.get("inclusion_delta", 0)
                retail_velocity = leak.get("retail_velocity", 0)

    return {
        "id": str(result.id),
        "user_id": str(profile.id),
        "username": profile.full_name or str(profile.id),
        "score": result.financial_health_score,
        "band": result.health_band,
        "created_at": result.created_at.isoformat(),
        "transaction_count": result.transaction_count,
        "leaks": leaks,
        "inclusion_delta": inclusion_delta,
        "retail_velocity": retail_velocity,
        "summary": result.summary_plain_language,
        "open_banking_verified": _analysis_open_banking_verified(result),
    }


def _pdf_escape(value: Any) -> str:
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_analysis_pdf(row: Dict[str, Any]) -> bytes:
    leak_total = sum(float(leak.get("impact", 0)) for leak in row["leaks"])
    lines = [
        "TracePay Analysis Report",
        f"Case: {row['id'][:8].upper()}",
        f"User: {row['username']}",
        f"Created: {row['created_at']}",
        f"Financial health score: {row['score']}/100 ({row['band']})",
        f"Transactions analyzed: {row['transaction_count']}",
        f"Total leak impact: R{leak_total:,.2f}",
        f"Retail potential: R{float(row['retail_velocity']):,.2f}",
        f"Open Banking verified: {'Yes' if row['open_banking_verified'] else 'No'}",
        "",
        "Recommendation:",
        row["summary"],
        "",
        "Detected leaks:",
    ]
    if row["leaks"]:
        lines.extend(
            f"- {leak['type']}: R{float(leak.get('impact', 0)):,.2f}"
            for leak in row["leaks"]
        )
    else:
        lines.append("- No leaks recorded")

    text_ops = ["BT", "/F1 12 Tf", "50 790 Td", "14 TL"]
    for index, line in enumerate(lines[:48]):
        if index:
            text_ops.append("T*")
        text_ops.append(f"({_pdf_escape(line[:95])}) Tj")
    text_ops.append("ET")
    stream = "\n".join(text_ops).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode("ascii"))
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")

    xref_at = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode("ascii")
    )
    return bytes(pdf)


@router.get("/forensic-feed")
def get_forensic_feed(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
) -> List[Dict[str, Any]]:
    """Get a global feed of recent forensic analyses for the dashboard"""
    results = (
        db.query(AnalysisResult, Profile)
        .join(Profile, AnalysisResult.user_id == Profile.id)
        .order_by(AnalysisResult.created_at.desc())
        .limit(limit)
        .all()
    )

    feed = []
    for res, profile in results:
        feed.append(_analysis_feed_item(db, res, profile))

    return feed


class AuditLogEntry(BaseModel):
    id: int
    event_type: str
    actor_user_id: Optional[str]
    actor_name: Optional[str]
    target_user_id: Optional[str]
    target_name: Optional[str]
    ip_address: Optional[str]
    metadata: Dict[str, Any]
    created_at: str


@router.get("/audit-log", response_model=List[AuditLogEntry])
def list_audit_log(
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    event_type: Optional[str] = Query(None),
) -> List[AuditLogEntry]:
    """Recent platform audit events, newest first -- every admin action and
    business-sensitive event (freeze, redemption, provisioning) writes here
    via add_audit_event."""
    query = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    if event_type:
        query = query.filter(AuditLog.event_type == event_type)
    logs = query.offset(skip).limit(limit).all()

    referenced_ids = {log.actor_user_id for log in logs if log.actor_user_id is not None} | {
        log.target_user_id for log in logs if log.target_user_id is not None
    }
    names: Dict[Any, str] = {}
    if referenced_ids:
        for profile in db.query(Profile).filter(Profile.id.in_(referenced_ids)).all():
            names[profile.id] = profile.full_name or str(profile.id)

    return [
        AuditLogEntry(
            id=log.id,
            event_type=log.event_type,
            actor_user_id=str(log.actor_user_id) if log.actor_user_id else None,
            actor_name=names.get(log.actor_user_id) if log.actor_user_id else None,
            target_user_id=str(log.target_user_id) if log.target_user_id else None,
            target_name=names.get(log.target_user_id) if log.target_user_id else None,
            ip_address=log.ip_address,
            metadata=log.event_metadata,
            created_at=log.created_at.isoformat(),
        )
        for log in logs
    ]


@router.get("/analysis/{analysis_id}/export.pdf")
def export_analysis_pdf(
    analysis_id: int,
    db: Session = Depends(get_db),
) -> Response:
    result, profile = (
        db.query(AnalysisResult, Profile)
        .join(Profile, AnalysisResult.user_id == Profile.id)
        .filter(AnalysisResult.id == analysis_id)
        .first()
        or (None, None)
    )
    if result is None or profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    row = _analysis_feed_item(db, result, profile)
    filename = f"tracepay-analysis-{analysis_id}.pdf"
    return Response(
        content=_build_analysis_pdf(row),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


class PartnerAdminView(BaseModel):
    id: str
    name: str
    offer_description: str
    points_cost: int
    estimated_value_rand: float
    commission_rate: float
    is_active: bool
    owner_user_id: Optional[str]
    total_redemptions: int
    total_commission_owed: float


class CreatePartnerRequest(BaseModel):
    id: str
    name: str
    offer_description: str
    points_cost: int
    estimated_value_rand: float
    commission_rate: float = 0.025
    owner_user_id: Optional[str] = None


class UpdatePartnerRequest(BaseModel):
    name: Optional[str] = None
    offer_description: Optional[str] = None
    points_cost: Optional[int] = None
    estimated_value_rand: Optional[float] = None
    commission_rate: Optional[float] = None
    is_active: Optional[bool] = None
    owner_user_id: Optional[str] = None


def _partner_admin_view(db: Session, partner: Partner) -> PartnerAdminView:
    total_redemptions = (
        db.query(func.count(Redemption.id)).filter(Redemption.partner_id == partner.id).scalar() or 0
    )
    total_commission = (
        db.query(func.coalesce(func.sum(Redemption.commission_amount), 0.0))
        .filter(Redemption.partner_id == partner.id)
        .scalar()
        or 0.0
    )
    return PartnerAdminView(
        id=partner.id,
        name=partner.name,
        offer_description=partner.offer_description,
        points_cost=partner.points_cost,
        estimated_value_rand=partner.estimated_value_rand,
        commission_rate=partner.commission_rate,
        is_active=partner.is_active,
        owner_user_id=str(partner.owner_user_id) if partner.owner_user_id else None,
        total_redemptions=int(total_redemptions),
        total_commission_owed=round(float(total_commission), 2),
    )


@router.get("/partners", response_model=List[PartnerAdminView])
def list_partners_admin(
    db: Session = Depends(get_db),
) -> List[PartnerAdminView]:
    """All commission partners, active or not, with lifetime totals -- unlike
    the partner-facing `/partner/summary`, this is not scoped to one owner."""
    partners = db.query(Partner).order_by(Partner.name).all()
    return [_partner_admin_view(db, p) for p in partners]


@router.post("/partners", response_model=PartnerAdminView, status_code=status.HTTP_201_CREATED)
def create_partner(
    req: CreatePartnerRequest,
    db: Session = Depends(get_db),
) -> PartnerAdminView:
    """Onboard a new commission partner.

    There is no self-service partner signup -- per the admin-provisioned-only
    access model, TracePay staff create the Partner row (and hand the owner
    their login) rather than a partner registering themselves.
    """
    if db.query(Partner).filter(Partner.id == req.id).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A partner with this id already exists")

    owner_uuid: Optional[uuid.UUID] = None
    if req.owner_user_id:
        try:
            owner_uuid = uuid.UUID(req.owner_user_id)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_user_id must be a UUID")

    partner = Partner(
        id=req.id,
        name=req.name,
        offer_description=req.offer_description,
        points_cost=req.points_cost,
        estimated_value_rand=req.estimated_value_rand,
        commission_rate=req.commission_rate,
        owner_user_id=owner_uuid,
    )
    db.add(partner)
    db.commit()
    db.refresh(partner)
    return _partner_admin_view(db, partner)


@router.put("/partners/{partner_id}", response_model=PartnerAdminView)
def update_partner(
    partner_id: str,
    req: UpdatePartnerRequest,
    db: Session = Depends(get_db),
) -> PartnerAdminView:
    partner = db.query(Partner).filter(Partner.id == partner_id).first()
    if partner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner not found")

    updates = req.model_dump(exclude_unset=True, exclude={"owner_user_id"})
    for field, value in updates.items():
        setattr(partner, field, value)

    if "owner_user_id" in req.model_fields_set:
        if req.owner_user_id is None:
            partner.owner_user_id = None
        else:
            try:
                partner.owner_user_id = uuid.UUID(req.owner_user_id)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="owner_user_id must be a UUID")

    db.commit()
    db.refresh(partner)
    return _partner_admin_view(db, partner)


@router.post("/analysis/{analysis_id}/follow-up")
def request_analysis_follow_up(
    request_body: FollowUpRequest,
    request: Request,
    analysis_id: int,
    current_user: AuthenticatedUser = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    result = db.query(AnalysisResult).filter(AnalysisResult.id == analysis_id).first()
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    add_audit_event(
        db,
        "analysis_follow_up_requested",
        actor=current_user,
        target_user=result.user_id,
        metadata={
            "analysis_id": analysis_id,
            "note": request_body.note,
            "status": "requested",
        },
        request=request,
    )
    db.commit()
    return {
        "status": "requested",
        "analysis_id": analysis_id,
        "message": "Follow-up request recorded.",
    }

