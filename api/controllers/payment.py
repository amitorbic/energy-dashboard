# =============================================================================
# payments/service.py
# Core business logic — called by both the router and the import processor.
# This is the single source of truth for how payments affect account state.
# =============================================================================

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
import logging

from models.payment import Payment, PaymentImport, PaymentPlanInstallment
from models.payment import PaymentStatus, PaymentSource, AppliedTo, InstallmentStatus

from models.collections import CollectionsAccount, CollectionsTimeline
from models.collections import CollectionStage, EventType

logger = logging.getLogger(__name__)


# =============================================================================
# POST A SINGLE PAYMENT
# The core function. Called by manual entry AND by the import processor.
# Handles: balance update, ETF flag check, timeline write, stage transition.
# =============================================================================


async def post_payment(
    db: AsyncSession,
    esiid: str,
    amount: float,
    payment_date: date,
    received_date: date,
    method: str,
    source: PaymentSource,
    entered_by: str,
    applied_to: AppliedTo = AppliedTo.USAGE,
    applied_to_etf: float = 0.0,
    reference_number: Optional[str] = None,
    account_number: Optional[str] = None,
    import_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> Payment:
    """
    Post a payment against an account identified by ESIID.

    Logic:
    1. Look up collections account by ESIID
    2. Snapshot balances before
    3. Apply payment to usage first, then ETF if BOTH
    4. Check ETF flag condition
    5. Recalculate delinquency score
    6. Check if account should be resolved
    7. Write timeline entry
    8. Write payment record
    9. Check payment plan installment if active
    """

    # ── 1. Find account ────────────────────────────────────────────────────
    result = await db.execute(
        select(CollectionsAccount).where(
            (CollectionsAccount.esiid == esiid)
            | (CollectionsAccount.account_number == esiid)
        )
    )
    account = result.scalar_one_or_none()

    # Snapshot balances (use 0 if account not in collections)
    usage_before = float(account.usage_balance) if account else 0.0
    etf_before = float(account.etf_amount) if account else 0.0
    total_before = usage_before + etf_before

    # ── 2. Calculate application split ────────────────────────────────────
    if applied_to == AppliedTo.USAGE:
        applied_usage = min(amount, usage_before)
        applied_etf = 0.0
    elif applied_to == AppliedTo.ETF:
        applied_usage = 0.0
        applied_etf = min(amount, etf_before)
    else:  # BOTH
        applied_etf = min(applied_to_etf, etf_before)
        applied_usage = min(amount - applied_etf, usage_before)

    usage_after = max(0.0, usage_before - applied_usage)
    etf_after = max(0.0, etf_before - applied_etf)
    total_after = usage_after + etf_after

    # ── 3. ETF flag check ─────────────────────────────────────────────────
    # Flag triggers when usage hits zero but ETF remains
    etf_flag_triggered = (
        usage_after == 0.0
        and etf_after > 0.0
        and account is not None
        and account.etf_amount > 0
        and account.etf_status not in ("WAIVED", "COLLECTED")
    )

    # ── 4. Write payment record ───────────────────────────────────────────
    payment = Payment(
        esiid=esiid,
        account_number=account_number or (account.account_number if account else None),
        customer_name=account.customer_name if account else "Unknown",
        collections_account_id=account.id if account else None,
        payment_date=payment_date,
        received_date=received_date,
        amount=amount,
        method=method,
        reference_number=reference_number,
        applied_to=applied_to,
        applied_to_usage=applied_usage,
        applied_to_etf=applied_etf,
        balance_before=total_before,
        balance_after=total_after,
        usage_balance_before=usage_before,
        usage_balance_after=usage_after,
        etf_balance_before=etf_before,
        etf_balance_after=etf_after,
        triggered_etf_flag=etf_flag_triggered,
        source=source,
        import_id=import_id,
        entered_by=entered_by,
        status=PaymentStatus.POSTED,
        notes=notes,
    )
    db.add(payment)
    await db.flush()  # get payment.id

    # ── 5. Update collections account if linked ────────────────────────────
    if account:
        account.usage_balance = usage_after
        account.amount_paid = (account.amount_paid or 0) + amount
        account.last_payment_date = received_date
        account.last_payment_amount = amount
        account.updated_at = datetime.utcnow()

        # ETF flag
        if etf_flag_triggered:
            account.etf_flag = True

        # Check if fully resolved
        is_resolved = usage_after == 0.0 and etf_after == 0.0
        if is_resolved:
            account.is_paid = True
            account.stage = CollectionStage.RESOLVED
            account.resolved_at = datetime.utcnow()

        # Recalculate delinquency score
        account.delinquency_score = _calc_delinquency_score(
            days_overdue=account.days_overdue,
            amount=total_after,
            track=account.track,
        )
        account.delinquency_tier = _score_to_tier(account.delinquency_score)

        # ── 6. Write timeline entry ────────────────────────────────────────
        event_type = (
            EventType.PAYMENT_RECEIVED
            if total_after == 0
            else EventType.PAYMENT_PARTIAL
        )
        if etf_flag_triggered:
            event_type = EventType.ETF_FLAGGED

        timeline_body = _build_payment_timeline_body(
            amount=amount,
            method=method,
            applied_usage=applied_usage,
            applied_etf=applied_etf,
            usage_before=usage_before,
            usage_after=usage_after,
            etf_before=etf_before,
            etf_after=etf_after,
            etf_flagged=etf_flag_triggered,
            resolved=is_resolved,
            source=source,
        )

        timeline = CollectionsTimeline(
            account_id=account.id,
            actor_type="SYSTEM" if source != PaymentSource.MANUAL else "HUMAN",
            actor_name=entered_by,
            event_type=event_type,
            subject=f"Payment posted — ${amount:,.2f} via {method}",
            body=timeline_body,
            event_metadata={
                "payment_id": payment.id,
                "amount": amount,
                "method": method,
                "source": source,
                "balance_before": total_before,
                "balance_after": total_after,
                "etf_flag": etf_flag_triggered,
                "resolved": is_resolved,
            },
        )
        db.add(timeline)

        # ETF flag gets its own timeline entry for visibility
        if etf_flag_triggered:
            etf_timeline = CollectionsTimeline(
                account_id=account.id,
                actor_type="SYSTEM",
                actor_name="payment_processor",
                event_type=EventType.ETF_FLAGGED,
                subject="ETF balance open after usage cleared",
                body=(
                    f"Usage balance cleared (${usage_before:,.2f} → $0.00) but "
                    f"ETF of ${etf_after:,.2f} remains. "
                    f"Account flagged — ETF requires human negotiation."
                ),
                event_metadata={
                    "payment_id": payment.id,
                    "etf_amount": etf_after,
                },
            )
            db.add(etf_timeline)

        # ── 7. Check payment plan installments ────────────────────────────
        await _check_installment(db, account.id, payment.id, received_date, amount)

    await db.commit()
    await db.refresh(payment)
    return payment


# =============================================================================
# MARK PAYMENT AS BOUNCED
# =============================================================================


async def mark_bounced(
    db: AsyncSession,
    payment_id: int,
    bounce_reason: str,
    noted_by: str,
    notes: Optional[str] = None,
) -> Payment:
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise ValueError(f"Payment {payment_id} not found")
    if payment.status != PaymentStatus.POSTED:
        raise ValueError(f"Cannot bounce a payment with status {payment.status}")

    payment.is_bounced = True
    payment.bounced_at = datetime.utcnow()
    payment.bounce_reason = bounce_reason
    payment.status = PaymentStatus.BOUNCED
    payment.notes = notes

    # Reverse the balance update on the account
    if payment.collections_account_id:
        result2 = await db.execute(
            select(CollectionsAccount).where(
                CollectionsAccount.id == payment.collections_account_id
            )
        )
        account = result2.scalar_one_or_none()
        if account:
            account.usage_balance = payment.usage_balance_before
            account.amount_paid = max(0.0, (account.amount_paid or 0) - payment.amount)
            account.is_paid = False
            # If ETF flag was triggered by this payment, clear it
            if payment.triggered_etf_flag:
                account.etf_flag = False

            timeline = CollectionsTimeline(
                account_id=account.id,
                actor_type="HUMAN",
                actor_name=noted_by,
                event_type=EventType.PAYMENT_BOUNCED,
                subject=f"Payment bounced — ${payment.amount:,.2f} via {payment.method}",
                body=f"Reason: {bounce_reason}. Balance restored to ${payment.balance_before:,.2f}.",
                event_metadata={
                    "payment_id": payment.id,
                    "amount": payment.amount,
                    "bounce_reason": bounce_reason,
                    "balance_restored_to": payment.balance_before,
                },
            )
            db.add(timeline)

    await db.commit()
    await db.refresh(payment)
    return payment


# =============================================================================
# IMPORT PROCESSOR
# Called after user confirms the preview. Processes rows in bulk.
# =============================================================================


async def process_import(
    db: AsyncSession,
    import_id: int,
    rows: list,
    uploaded_by: str,
    source: PaymentSource,
) -> dict:
    """
    Process a committed import.
    Each row: {esiid, account_number, customer_name, payment_date, amount, method}
    Returns summary stats.
    """
    stats = {
        "rows_processed": 0,
        "rows_skipped": 0,
        "rows_errored": 0,
        "total_payment_amount": 0.0,
        "accounts_updated": 0,
        "accounts_resolved": 0,
        "etf_flags_triggered": 0,
        "bounced_found": 0,
        "errors": [],
    }

    for i, row in enumerate(rows):
        try:
            payment = await post_payment(
                db=db,
                esiid=row["esiid"],
                amount=float(row["amount"]),
                payment_date=row["payment_date"],
                received_date=date.today(),
                method=row.get("method", "ACH"),
                source=source,
                entered_by=uploaded_by,
                account_number=row.get("account_number"),
                import_id=import_id,
            )
            stats["rows_processed"] += 1
            stats["total_payment_amount"] += payment.amount
            stats["accounts_updated"] += 1

            if payment.balance_after == 0:
                stats["accounts_resolved"] += 1
            if payment.triggered_etf_flag:
                stats["etf_flags_triggered"] += 1

        except Exception as e:
            stats["rows_errored"] += 1
            stats["errors"].append(
                {
                    "row": i + 2,  # 1-indexed, row 1 is header
                    "esiid": row.get("esiid", "unknown"),
                    "error": str(e),
                }
            )
            logger.warning(f"Import row {i+2} error: {e}")
            continue

    # Update import record
    await db.execute(
        update(PaymentImport)
        .where(PaymentImport.id == import_id)
        .values(
            status=(
                "COMPLETED" if stats["rows_errored"] == 0 else "COMPLETED_WITH_ERRORS"
            ),
            processed_at=datetime.utcnow(),
            rows_processed=stats["rows_processed"],
            rows_errored=stats["rows_errored"],
            total_payment_amount=stats["total_payment_amount"],
            accounts_updated=stats["accounts_updated"],
            accounts_resolved=stats["accounts_resolved"],
            etf_flags_triggered=stats["etf_flags_triggered"],
            error_log=stats["errors"] if stats["errors"] else None,
        )
    )
    await db.commit()
    return stats


# =============================================================================
# PARSE SHEET ROWS
# Converts raw Excel/CSV rows into normalized dicts for process_import.
# Handles the column formats from both payment sheet and billing sheet.
# =============================================================================


def parse_payment_sheet_rows(raw_rows: list, file_type: str) -> tuple[list, list]:
    """
    Returns (valid_rows, error_rows)
    Strips $, commas, whitespace. Normalises dates. Flags bad rows.
    """
    valid, errors = [], []
    strip_chars = str.maketrans("", "", "$,")

    for i, row in enumerate(raw_rows):
        try:
            if file_type == "PAYMENT_SHEET":
                # Col positions from old PHP: 1=date, 6=cust_id/esiid, 8=premise, 21=dnp
                esiid = str(row.get("esiid") or row.get(7, "")).strip()
                account_number = str(
                    row.get("account_number") or row.get(5, "")
                ).strip()
                customer_name = str(row.get("customer_name") or row.get(4, "")).strip()
                amount_raw = str(row.get("amount") or row.get(10, "0")).translate(
                    strip_chars
                )
                payment_date = row.get("payment_date") or row.get(0)
                method = str(row.get("method", "ACH")).upper()

            else:  # BILLING_SHEET — cols from upload_sheet.php
                esiid = str(row.get(1, "")).strip()  # premise_id
                account_number = str(row.get(0, "")).strip()  # cust_id
                customer_name = str(row.get(4, "")).strip()  # comp_name
                amount_raw = str(row.get(11, "0")).translate(
                    strip_chars
                )  # total_due_amt
                payment_date = row.get(8)  # last_payment_date
                method = "ACH"

            if not esiid:
                raise ValueError("Missing ESIID")
            amount = float(amount_raw or 0)
            if amount <= 0:
                raise ValueError(f"Invalid amount: {amount_raw}")

            valid.append(
                {
                    "esiid": esiid,
                    "account_number": account_number,
                    "customer_name": customer_name,
                    "amount": amount,
                    "payment_date": payment_date,
                    "method": (
                        method if method in ("ACH", "CC", "CHECK", "WIRE") else "OTHER"
                    ),
                }
            )

        except Exception as e:
            errors.append({"row": i + 2, "error": str(e), "raw": str(row)})

    return valid, errors


# =============================================================================
# HELPERS
# =============================================================================


def _calc_delinquency_score(days_overdue: int, amount: float, track: str) -> int:
    """
    Score = days weight (0-50) + amount weight (0-30) + track weight (0-20)
    Max = 100
    """
    # Days overdue: 0–50 points
    if days_overdue <= 10:
        days_score = 5
    elif days_overdue <= 30:
        days_score = 15
    elif days_overdue <= 60:
        days_score = 30
    elif days_overdue <= 90:
        days_score = 40
    else:
        days_score = 50

    # Amount: 0–30 points
    if amount <= 500:
        amt_score = 5
    elif amount <= 2000:
        amt_score = 10
    elif amount <= 5000:
        amt_score = 20
    elif amount <= 10000:
        amt_score = 25
    else:
        amt_score = 30

    # Track: inactive is harder to collect
    track_score = 20 if track == "INACTIVE" else 10

    return days_score + amt_score + track_score


def _score_to_tier(score: int) -> str:
    if score >= 80:
        return "CRITICAL"
    elif score >= 60:
        return "HIGH"
    elif score >= 35:
        return "MEDIUM"
    else:
        return "LOW"


def _build_payment_timeline_body(
    amount,
    method,
    applied_usage,
    applied_etf,
    usage_before,
    usage_after,
    etf_before,
    etf_after,
    etf_flagged,
    resolved,
    source,
) -> str:
    lines = [f"Payment of ${amount:,.2f} posted via {method} from {source}."]

    if applied_usage > 0:
        lines.append(
            f"Applied to usage balance: ${applied_usage:,.2f} "
            f"(${usage_before:,.2f} → ${usage_after:,.2f})"
        )
    if applied_etf > 0:
        lines.append(
            f"Applied to ETF: ${applied_etf:,.2f} "
            f"(${etf_before:,.2f} → ${etf_after:,.2f})"
        )
    if etf_flagged:
        lines.append(
            f"⚠ ETF FLAGGED: Usage balance cleared but ${etf_after:,.2f} ETF remains."
        )
    if resolved:
        lines.append("✓ Account fully resolved — balance is $0.00.")

    return "\n".join(lines)


async def _check_installment(
    db: AsyncSession,
    account_id: int,
    payment_id: int,
    paid_date: date,
    amount: float,
) -> None:
    """
    If account has an active payment plan, mark the next scheduled
    installment as paid or partial.
    """
    result = await db.execute(
        select(PaymentPlanInstallment)
        .where(
            PaymentPlanInstallment.collections_account_id == account_id,
            PaymentPlanInstallment.status == InstallmentStatus.SCHEDULED,
        )
        .order_by(PaymentPlanInstallment.due_date.asc())
        .limit(1)
    )
    installment = result.scalar_one_or_none()
    if not installment:
        return

    installment.payment_id = payment_id
    installment.paid_date = paid_date
    installment.paid_amount = amount
    installment.status = (
        InstallmentStatus.PAID
        if amount >= installment.amount_due
        else InstallmentStatus.PARTIAL
    )
