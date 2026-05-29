# =============================================================================
# routers/payment.py
# All payment endpoints. Mount at /api/payments in main.py
# =============================================================================

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from typing import Optional, List
from datetime import date, datetime
import pandas as pd
import io

from utils.database import get_db
from models.payment import Payment, PaymentImport, PaymentPlanInstallment
from models.payment import PaymentStatus, PaymentSource, ImportFileType, ImportStatus
from schemas.payment import (
    PaymentCreate,
    PaymentResponse,
    PaymentBounceUpdate,
    PaymentListResponse,
    PaymentLedgerRow,
    ImportPreviewResponse,
    ImportPreviewRow,
    ImportCommitResponse,
    ImportSummaryResponse,
    AccountBalanceSummary,
    PaymentPlanCalculateResponse,
    DailyPaymentSummary,
)
from controllers.payment import (
    post_payment,
    mark_bounced,
    process_import,
    parse_payment_sheet_rows,
)
from models.collections import CollectionsAccount, CollectionsPaymentPlan

router = APIRouter(prefix="/api/payments", tags=["payments"])


# =============================================================================
# MANUAL PAYMENT ENTRY
# =============================================================================


@router.post("/", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    db: AsyncSession = Depends(get_db),
):
    payment = await post_payment(
        db=db,
        esiid=payload.esiid,
        amount=float(payload.amount),
        payment_date=payload.payment_date,
        received_date=payload.received_date,
        method=payload.method.value,
        source=PaymentSource.MANUAL,
        entered_by="system",
        applied_to=payload.applied_to,
        applied_to_etf=float(payload.applied_to_etf or 0),
        reference_number=payload.reference_number,
        account_number=payload.account_number,
        notes=payload.notes,
    )
    return payment


# =============================================================================
# PAYMENT LEDGER
# =============================================================================


@router.get("/", response_model=PaymentListResponse)
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    esiid: Optional[str] = Query(None),
    account_number: Optional[str] = Query(None),
    customer_name: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    source: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    bounced_only: bool = Query(False),
    etf_flag_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if esiid:
        filters.append(Payment.esiid == esiid)
    if account_number:
        filters.append(Payment.account_number == account_number)
    if customer_name:
        filters.append(Payment.customer_name.ilike(f"%{customer_name}%"))
    if status_filter:
        filters.append(Payment.status == status_filter)
    if source:
        filters.append(Payment.source == source)
    if method:
        filters.append(Payment.method == method)
    if date_from:
        filters.append(Payment.received_date >= date_from)
    if date_to:
        filters.append(Payment.received_date <= date_to)
    if bounced_only:
        filters.append(Payment.is_bounced == True)
    if etf_flag_only:
        filters.append(Payment.triggered_etf_flag == True)

    where = and_(*filters) if filters else True

    count_q = select(func.count(Payment.id)).where(where)
    total = (await db.execute(count_q)).scalar() or 0

    rows_q = (
        select(Payment)
        .where(where)
        .order_by(desc(Payment.received_date), desc(Payment.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(rows_q)).scalars().all()

    return PaymentListResponse(
        total=total,
        page=page,
        page_size=page_size,
        results=[PaymentLedgerRow.model_validate(r) for r in rows],
    )


# =============================================================================
# SINGLE PAYMENT
# =============================================================================


@router.get("/{payment_id}", response_model=PaymentResponse)
async def get_payment(
    payment_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Payment).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment


# =============================================================================
# MARK BOUNCED
# =============================================================================


@router.patch("/{payment_id}/bounce", response_model=PaymentResponse)
async def bounce_payment(
    payment_id: int,
    payload: PaymentBounceUpdate,
    db: AsyncSession = Depends(get_db),
):
    payment = await mark_bounced(
        db=db,
        payment_id=payment_id,
        bounce_reason=payload.bounce_reason,
        noted_by="system",
        notes=payload.notes,
    )
    return payment


# =============================================================================
# ACCOUNT BALANCE SUMMARY
# =============================================================================


@router.get("/balance/{esiid}", response_model=AccountBalanceSummary)
async def get_account_balance(
    esiid: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CollectionsAccount).where(CollectionsAccount.esiid == esiid)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    last_pay_q = (
        select(Payment)
        .where(Payment.esiid == esiid, Payment.status == PaymentStatus.POSTED)
        .order_by(desc(Payment.received_date))
        .limit(1)
    )
    last_pay = (await db.execute(last_pay_q)).scalar_one_or_none()

    plan_q = (
        select(CollectionsPaymentPlan)
        .where(
            CollectionsPaymentPlan.account_id == account.id,
            CollectionsPaymentPlan.status == "ACTIVE",
        )
        .limit(1)
    )
    plan = (await db.execute(plan_q)).scalar_one_or_none()

    next_installment = None
    if plan:
        inst_q = (
            select(PaymentPlanInstallment)
            .where(
                PaymentPlanInstallment.payment_plan_id == plan.id,
                PaymentPlanInstallment.status == "SCHEDULED",
            )
            .order_by(PaymentPlanInstallment.due_date.asc())
            .limit(1)
        )
        next_installment = (await db.execute(inst_q)).scalar_one_or_none()

    return AccountBalanceSummary(
        esiid=account.esiid,
        account_number=account.account_number,
        customer_name=account.customer_name,
        track=account.track,
        stage=account.stage,
        usage_balance=account.usage_balance,
        etf_amount=account.etf_amount,
        etf_status=account.etf_status,
        etf_flag=account.etf_flag,
        total_due=account.total_due,
        amount_paid=account.amount_paid,
        last_payment_date=account.last_payment_date,
        last_payment_amount=account.last_payment_amount,
        last_payment_method=last_pay.method if last_pay else None,
        last_payment_status=last_pay.status if last_pay else None,
        days_overdue=account.days_overdue,
        delinquency_tier=account.delinquency_tier,
        is_payment_plan=account.is_payment_plan,
        active_plan_id=plan.id if plan else None,
        next_installment_due=next_installment.due_date if next_installment else None,
        next_installment_amount=(
            next_installment.amount_due if next_installment else None
        ),
    )


# =============================================================================
# FILE UPLOAD — STEP 1: PREVIEW
# =============================================================================


@router.post("/import/upload", response_model=ImportPreviewResponse)
async def upload_payment_sheet(
    file: UploadFile = File(...),
    file_type: ImportFileType = Query(ImportFileType.PAYMENT_SHEET),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="File must be .xlsx, .xls, or .csv")

    content = await file.read()

    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
        raw_rows = df.to_dict(orient="records")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    valid_rows, error_rows = parse_payment_sheet_rows(raw_rows, file_type.value)

    import_record = PaymentImport(
        filename=file.filename,
        file_type=file_type,
        file_size_bytes=len(content),
        uploaded_by="system",
        status=ImportStatus.PENDING,
        total_rows=len(raw_rows),
        rows_errored=len(error_rows),
        error_log=error_rows if error_rows else None,
    )
    db.add(import_record)
    await db.flush()

    preview_rows = []
    total_amount = 0.0
    etf_flags = 0
    resolves = 0
    warnings = 0

    for row in valid_rows:
        acct_result = await db.execute(
            select(CollectionsAccount).where(CollectionsAccount.esiid == row["esiid"])
        )
        account = acct_result.scalar_one_or_none()

        current_balance = float(account.total_due) if account else None
        balance_after = (
            max(0.0, (current_balance or 0) - row["amount"])
            if current_balance is not None
            else None
        )

        will_etf_flag = (
            account is not None
            and account.etf_amount > 0
            and account.usage_balance > 0
            and row["amount"] >= account.usage_balance
            and account.etf_status not in ("WAIVED", "COLLECTED")
        )
        will_resolve = account is not None and balance_after == 0.0

        warning = None
        if account and account.is_legal:
            warning = "Account is In Legal — review before posting"
        elif account and account.is_dnp_active:
            warning = "Account has active DNP — verify before posting"
        elif account is None:
            warning = (
                "Account not found in collections — payment recorded but not linked"
            )

        if will_etf_flag:
            etf_flags += 1
        if will_resolve:
            resolves += 1
        if warning:
            warnings += 1
        total_amount += row["amount"]

        action = "NEW_PAYMENT"
        if will_resolve:
            action = "RESOLVE"
        elif will_etf_flag:
            action = "ETF_FLAG"
        elif account:
            action = "UPDATE_BALANCE"

        preview_rows.append(
            ImportPreviewRow(
                row_number=len(preview_rows) + 2,
                esiid=row["esiid"],
                account_number=row.get("account_number"),
                customer_name=row.get("customer_name", ""),
                payment_date=str(row.get("payment_date", "")),
                amount=row["amount"],
                method=row["method"],
                action=action,
                current_balance=current_balance,
                balance_after=balance_after,
                etf_flag_will_trigger=will_etf_flag,
                warning=warning,
                error=None,
            )
        )

    for err in error_rows:
        preview_rows.append(
            ImportPreviewRow(
                row_number=err["row"],
                esiid="",
                account_number=None,
                customer_name="",
                payment_date="",
                amount=0,
                method="",
                action="SKIP",
                current_balance=None,
                balance_after=None,
                etf_flag_will_trigger=False,
                warning=None,
                error=err["error"],
            )
        )

    import_record.preview_data = [r.model_dump() for r in preview_rows]
    await db.commit()

    return ImportPreviewResponse(
        import_id=import_record.id,
        filename=file.filename,
        file_type=file_type,
        total_rows=len(raw_rows),
        valid_rows=len(valid_rows),
        error_rows=len(error_rows),
        warning_rows=warnings,
        total_amount=total_amount,
        etf_flags_to_trigger=etf_flags,
        accounts_to_resolve=resolves,
        rows=preview_rows,
    )


# =============================================================================
# FILE UPLOAD — STEP 2: COMMIT
# =============================================================================


@router.post("/import/{import_id}/commit", response_model=ImportCommitResponse)
async def commit_import(
    import_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentImport).where(PaymentImport.id == import_id)
    )
    import_record = result.scalar_one_or_none()
    if not import_record:
        raise HTTPException(status_code=404, detail="Import not found")
    if import_record.status not in (ImportStatus.PENDING,):
        raise HTTPException(
            status_code=400,
            detail=f"Import already {import_record.status} — cannot recommit",
        )

    valid_rows = [
        r
        for r in (import_record.preview_data or [])
        if r.get("action") != "SKIP" and not r.get("error")
    ]

    import_record.status = ImportStatus.PROCESSING
    await db.commit()

    source = (
        PaymentSource.BILLING_SHEET
        if import_record.file_type == ImportFileType.BILLING_SHEET
        else PaymentSource.PAYMENT_SHEET
    )

    service_rows = [
        {
            "esiid": r["esiid"],
            "account_number": r.get("account_number"),
            "customer_name": r.get("customer_name", ""),
            "amount": r["amount"],
            "payment_date": r.get("payment_date"),
            "method": r.get("method", "ACH"),
        }
        for r in valid_rows
    ]

    stats = await process_import(
        db=db,
        import_id=import_id,
        rows=service_rows,
        uploaded_by="system",
        source=source,
    )

    return ImportCommitResponse(
        import_id=import_id,
        status="COMPLETED" if not stats["rows_errored"] else "COMPLETED_WITH_ERRORS",
        rows_processed=stats["rows_processed"],
        rows_skipped=stats["rows_skipped"],
        rows_errored=stats["rows_errored"],
        total_payment_amount=stats["total_payment_amount"],
        accounts_updated=stats["accounts_updated"],
        accounts_resolved=stats["accounts_resolved"],
        etf_flags_triggered=stats["etf_flags_triggered"],
        bounced_found=stats["bounced_found"],
        errors=stats["errors"],
    )


# =============================================================================
# IMPORT HISTORY
# =============================================================================


@router.get("/imports/", response_model=List[ImportSummaryResponse])
async def list_imports(
    limit: int = Query(20, ge=1, le=100),
    file_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    filters = []
    if file_type:
        filters.append(PaymentImport.file_type == file_type)

    q = (
        select(PaymentImport)
        .where(and_(*filters) if filters else True)
        .order_by(desc(PaymentImport.uploaded_at))
        .limit(limit)
    )
    records = (await db.execute(q)).scalars().all()
    return [ImportSummaryResponse.model_validate(r) for r in records]


@router.get("/imports/{import_id}", response_model=ImportSummaryResponse)
async def get_import(
    import_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PaymentImport).where(PaymentImport.id == import_id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Import not found")
    return record


# =============================================================================
# PAYMENT PLAN — CALCULATE OPTIONS
# =============================================================================


@router.post(
    "/plan/calculate/{account_id}", response_model=PaymentPlanCalculateResponse
)
async def calculate_payment_plan(
    account_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CollectionsAccount).where(CollectionsAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    usage = float(account.usage_balance)
    etf = float(account.etf_amount) if account.etf_flag else 0.0
    days = account.days_overdue

    options = []
    for n in [2, 3, 4]:
        installment = round(usage / n, 2)
        first_due = date.today()

        note = f"{n} equal monthly payments of ${installment:,.2f}."
        if n == 2:
            note += " Fastest resolution."
        elif n == 3:
            note += " Balanced option."
        else:
            note += " Extended option for high balances."

        options.append(
            {
                "num_installments": n,
                "installment_amount": installment,
                "frequency": "MONTHLY",
                "first_payment_due": first_due,
                "total_amount": usage,
                "notes": note,
            }
        )

    reasoning = (
        f"Account {account.customer_name} owes ${usage:,.2f} usage balance "
        f"({days} days overdue). "
        f"{'ETF of $' + str(etf) + ' flagged separately. ' if etf > 0 else ''}"
        f"Offering 3 monthly installment options."
    )

    return PaymentPlanCalculateResponse(
        account_id=account_id,
        usage_balance=usage,
        etf_amount=etf,
        etf_flag=account.etf_flag,
        options=options,
        llm_reasoning=reasoning,
    )


# =============================================================================
# DAILY SUMMARY
# =============================================================================


@router.get("/summary/today", response_model=DailyPaymentSummary)
async def get_daily_summary(
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    result = await db.execute(select(Payment).where(Payment.received_date == today))
    payments = result.scalars().all()

    by_method: dict = {}
    by_source: dict = {}
    bounced_amount = 0.0

    for p in payments:
        by_method[p.method] = by_method.get(p.method, 0) + p.amount
        by_source[p.source] = by_source.get(p.source, 0) + p.amount
        if p.is_bounced:
            bounced_amount += p.amount

    return DailyPaymentSummary(
        date=today,
        total_received=sum(p.amount for p in payments if not p.is_bounced),
        payment_count=len(payments),
        by_method=by_method,
        by_source=by_source,
        etf_flags_triggered=sum(1 for p in payments if p.triggered_etf_flag),
        bounced_count=sum(1 for p in payments if p.is_bounced),
        bounced_amount=bounced_amount,
        accounts_resolved=sum(1 for p in payments if p.balance_after == 0),
    )
