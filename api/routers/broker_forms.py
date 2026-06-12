"""
Broker Forms router — prefix /api/broker/forms
Each endpoint accepts JSON body, returns StreamingResponse PDF.
LOA upload accepts multipart + returns JSON.
Payment Plan is admin-only (role==1).
"""

from io import BytesIO
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middleware.auth import require_auth
from controllers.broker_forms import (
    generate_loa_pdf,
    send_loa_email,
    generate_ach_pdf,
    generate_contract_commercial_pdf,
    generate_contract_residential_pdf,
    generate_personal_guarantee_pdf,
    generate_corporate_guarantee_pdf,
    generate_credit_check_pdf,
    generate_account_transfer_pdf,
    generate_cancellation_pdf,
    generate_meter_add_pdf,
    generate_payment_plan_pdf,
)

router = APIRouter(prefix="/broker/forms", tags=["broker-forms"])


def _pdf_stream(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# LOA
# ---------------------------------------------------------------------------

class LoaRequest(BaseModel):
    date_str: str = ""
    expiration_date: str = ""
    tdu: str = ""
    sent_mail: str = "operations@Orbic.com"
    esi_nums: List[str] = []
    service_addresses: List[str] = []
    company_name: str = ""
    contact_name: str = ""
    address: str = ""
    city_state_zip: str = ""
    phone: str = ""
    fax: str = ""
    email: str = ""
    printed_name: str = ""
    title_: str = ""
    auth_date: str = ""


@router.post("/loa")
async def loa_pdf(req: LoaRequest, payload: dict = Depends(require_auth)):
    pdf = generate_loa_pdf(**req.dict())
    return _pdf_stream(pdf, "LOA.pdf")


# ---------------------------------------------------------------------------
# LOA Upload — sends file to TDSP via email
# ---------------------------------------------------------------------------

@router.post("/loa-upload")
async def loa_upload(
    file: UploadFile = File(...),
    tdsp: str = Form(...),
    from_email: str = Form(""),
    subj: str = Form("Letter of Authorization"),
    comments: str = Form(""),
    payload: dict = Depends(require_auth),
):
    file_bytes = await file.read()
    result = send_loa_email(
        tdsp=tdsp,
        from_email=from_email,
        subject=subj,
        comments=comments,
        filename=file.filename or "loa.pdf",
        file_bytes=file_bytes,
    )
    if not result["success"]:
        raise HTTPException(status_code=500, detail=result["message"])
    return result


# ---------------------------------------------------------------------------
# ACH / Credit Card (shared endpoint, shared form)
# ---------------------------------------------------------------------------

class AchRequest(BaseModel):
    authorization: bool = False
    eff_date: str = ""
    card_name: str = ""
    card_type: str = ""
    ccnumber: str = ""
    exp_date: str = ""
    sec_code: str = ""
    bill_address: str = ""
    billingcsz: str = ""
    apc_name: str = ""
    apa_num: str = ""
    auth_sig: str = ""
    title_: str = ""
    prt_name: str = ""
    date_: str = ""
    auth_sig2: str = ""
    title2: str = ""
    prt_name2: str = ""
    date2: str = ""
    email_add: str = ""
    ph_no: str = ""


@router.post("/ach")
async def ach_pdf(req: AchRequest, payload: dict = Depends(require_auth)):
    pdf = generate_ach_pdf(**req.dict())
    return _pdf_stream(pdf, "ACH_Form.pdf")


# credit-card reuses same generator / endpoint body
@router.post("/credit-card")
async def credit_card_pdf(req: AchRequest, payload: dict = Depends(require_auth)):
    pdf = generate_ach_pdf(**req.dict())
    return _pdf_stream(pdf, "Credit_Card_Form.pdf")


# ---------------------------------------------------------------------------
# Commercial Contract
# ---------------------------------------------------------------------------

class ContractCommercialRequest(BaseModel):
    date_day: str = ""
    date_month: str = ""
    buyer: str = ""
    attn1: str = ""
    street1: str = ""
    city1: str = ""
    zip1: str = ""
    taxid: str = ""
    phone1: str = ""
    fax1: str = ""
    email1: str = ""
    attn2: str = ""
    street2: str = ""
    city2: str = ""
    zip2: str = ""
    phone2: str = ""
    fax2: str = ""
    email2: str = ""
    bill: str = ""
    spanish: str = ""
    start_date: str = ""
    asapdate: str = ""
    term_months: str = ""
    fixedprice: str = ""
    lmpplus: str = ""
    meterfee: str = ""
    esid1: str = ""
    service_add1: str = ""
    citystreet1: str = ""
    esid2: str = ""
    service_add2: str = ""
    citystreet2: str = ""
    esid3: str = ""
    service_add3: str = ""
    citystreet3: str = ""
    pname: str = ""
    socecurity: str = ""
    driverl: str = ""
    pphone: str = ""
    paddress: str = ""


@router.post("/contract-commercial")
async def contract_commercial_pdf(
    req: ContractCommercialRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_contract_commercial_pdf(**req.dict())
    return _pdf_stream(pdf, "Commercial_Contract.pdf")


# ---------------------------------------------------------------------------
# Residential Contract
# ---------------------------------------------------------------------------

class ContractResidentialRequest(BaseModel):
    date_day: str = ""
    date_month: str = ""
    cname: str = ""
    ssecurit: str = ""
    driverl: str = ""
    str_add: str = ""
    city_add: str = ""
    state: str = ""
    zip_: str = ""
    attn: str = ""
    phone: str = ""
    bfax: str = ""
    email_name: str = ""
    server_name: str = ""
    site_name: str = ""
    bill_type: str = ""
    start_date: str = ""
    asap: str = ""
    term_options: List[str] = []
    esid1: str = ""
    service_add1: str = ""
    citystreet1: str = ""
    esid2: str = ""
    service_add2: str = ""
    citystreet2: str = ""
    esid3: str = ""
    service_add3: str = ""
    citystreet3: str = ""
    con_price: str = ""
    con_term: str = ""
    signature: str = ""
    pname: str = ""
    lifesupport: str = ""


@router.post("/contract-residential")
async def contract_residential_pdf(
    req: ContractResidentialRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_contract_residential_pdf(**req.dict())
    return _pdf_stream(pdf, "Residential_Contract.pdf")


# ---------------------------------------------------------------------------
# Personal Guarantee
# ---------------------------------------------------------------------------

class PersonalGuaranteeRequest(BaseModel):
    text: str = ""
    text1: str = ""
    text2: str = ""
    text3: str = ""
    sig: str = ""
    p_name: str = ""
    street_add: str = ""
    city_state_zip: str = ""
    home_ph_no: str = ""
    social_security_no: str = ""
    driverlno: str = ""


@router.post("/personal-guarantee")
async def personal_guarantee_pdf(
    req: PersonalGuaranteeRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_personal_guarantee_pdf(**req.dict())
    return _pdf_stream(pdf, "Personal_Guaranty.pdf")


# ---------------------------------------------------------------------------
# Corporate Guarantee
# ---------------------------------------------------------------------------

class CorporateGuaranteeRequest(BaseModel):
    text: str = ""
    date_: str = ""
    month: str = ""
    year: str = ""
    cname: str = ""
    textid: str = ""
    phone: str = ""
    street: str = ""
    city: str = ""
    state: str = ""
    zip_: str = ""


@router.post("/corporate-guarantee")
async def corporate_guarantee_pdf(
    req: CorporateGuaranteeRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_corporate_guarantee_pdf(**req.dict())
    return _pdf_stream(pdf, "Corporate_Guaranty.pdf")


# ---------------------------------------------------------------------------
# Credit Check
# ---------------------------------------------------------------------------

class CreditCheckRequest(BaseModel):
    pname: str = ""
    sno: str = ""
    phone: str = ""
    address: str = ""
    signature: str = ""
    date_: str = ""


@router.post("/credit-check")
async def credit_check_pdf(req: CreditCheckRequest, payload: dict = Depends(require_auth)):
    pdf = generate_credit_check_pdf(**req.dict())
    return _pdf_stream(pdf, "Credit_Check.pdf")


# ---------------------------------------------------------------------------
# Account Transfer
# ---------------------------------------------------------------------------

class AccountTransferRequest(BaseModel):
    cust_name: str = ""
    acc_name: str = ""
    ph_no: str = ""
    serv_name: str = ""
    city_sz: str = ""
    req_date: str = ""
    curr_edate: str = ""
    curr_crate: str = ""
    notes: str = ""
    nser_add: str = ""
    ncity_sz: str = ""
    n_esiid: str = ""
    n_phone: str = ""
    n_req_date: str = ""


@router.post("/account-transfer")
async def account_transfer_pdf(
    req: AccountTransferRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_account_transfer_pdf(**req.dict())
    return _pdf_stream(pdf, "Account_Transfer.pdf")


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------

class CancellationRequest(BaseModel):
    cust_name: str = ""
    acc_numb: str = ""
    phone_num: str = ""
    service_add: str = ""
    city_st_zip: str = ""
    cancell_datea: str = ""
    con_endate: str = ""
    cont_rate: str = ""
    coment: str = ""
    move: bool = False
    switch: bool = False
    other: bool = False
    other_text: str = ""
    f_address: str = ""
    f_cityst_zip: str = ""
    f_phone: str = ""
    f_email: str = ""
    final_institution: str = ""
    inv_addr: str = ""
    rout_no: str = ""
    inv_acc: str = ""
    cr_name: str = ""
    cr_no: str = ""
    ex_date: str = ""
    sec_code: str = ""
    inv_add: str = ""


@router.post("/cancellation")
async def cancellation_pdf(
    req: CancellationRequest,
    payload: dict = Depends(require_auth),
):
    pdf = generate_cancellation_pdf(**req.dict())
    return _pdf_stream(pdf, "Cancellation.pdf")


# ---------------------------------------------------------------------------
# Meter Add
# ---------------------------------------------------------------------------

class MeterAddRequest(BaseModel):
    account_name: str = ""
    esiid: str = ""
    contract_name: str = ""
    phone: str = ""
    current_contract_end_date: str = ""
    rate: str = ""
    request_types: List[str] = []
    self_move_date: str = ""
    self_select_date: str = ""
    contract_end_date: str = ""
    add_meter_rate: str = ""
    billing_addr: str = ""
    note: str = ""
    esiid1: str = ""
    service_addr1: str = ""
    city1: str = ""
    esiid2: str = ""
    service_addr2: str = ""
    city2: str = ""
    esiid3: str = ""
    service_addr3: str = ""
    city3: str = ""
    printed_name1: str = ""
    printed_name2: str = ""
    title1: str = ""
    dat1: str = ""


@router.post("/meter-add")
async def meter_add_pdf(req: MeterAddRequest, payload: dict = Depends(require_auth)):
    pdf = generate_meter_add_pdf(**req.dict())
    return _pdf_stream(pdf, "Meter_Add.pdf")


# ---------------------------------------------------------------------------
# Payment Plan (admin only)
# ---------------------------------------------------------------------------

class PaymentPlanRequest(BaseModel):
    tdate: str = ""
    cus_name: str = ""
    out_bal: str = ""
    fins_date: str = ""
    finst_amount: str = ""
    sins_date: str = ""
    sinst_amount: str = ""
    tins_date: str = ""
    tinst_amount: str = ""
    foins_date: str = ""
    foinst_amount: str = ""
    bank_name: str = ""
    acc_name: str = ""
    routing_name: str = ""
    acc_no: str = ""


@router.post("/payment-plan")
async def payment_plan_pdf(
    req: PaymentPlanRequest,
    payload: dict = Depends(require_auth),
):
    if str(payload.get("role", "")) != "1":
        raise HTTPException(status_code=403, detail="Admin only")
    pdf = generate_payment_plan_pdf(**req.dict())
    return _pdf_stream(pdf, "Payment_Plan.pdf")
