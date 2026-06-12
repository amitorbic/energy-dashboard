from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from middleware.auth import require_auth
from utils.database import get_db
from controllers.broker_pricing import (
    approve_customer,
    delete_customer,
    generate_offer_pdf,
    get_active_quotes,
)

router = APIRouter(prefix="/broker/pricing", tags=["broker-pricing"])


@router.get("/active-quotes")
async def active_quotes(
    search_text: str = Query(""),
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    broker_id = payload.get("broker_id", "")
    role = str(payload.get("role", "2"))
    return await get_active_quotes(db, broker_id, role, search_text)


@router.post("/customer/delete")
async def customer_delete(
    body: dict,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    cid   = str(body.get("cid", ""))
    table = str(body.get("table", "customer"))
    return await delete_customer(db, cid, table)


@router.post("/customer/approve")
async def customer_approve(
    body: dict,
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    cid   = str(body.get("cid", ""))
    table = str(body.get("table", "customer"))
    return await approve_customer(db, cid, table)


@router.get("/offer-pdf")
async def offer_pdf(
    cid:        str = Query(...),
    type:       str = Query("regular"),
    acc_name:   str = Query(""),
    acc_per:    str = Query(""),
    acc_address:str = Query(""),
    acc_phone:  str = Query(""),
    acc_email:  str = Query(""),
    dasdate:    str = Query(""),
    doccterm1:  str = Query(""),
    doccterm2:  str = Query(""),
    doccterm3:  str = Query(""),
    doccterm4:  str = Query(""),
    doccterm5:  str = Query(""),
    quote6:     str = Query("N/A"),
    quote12:    str = Query("N/A"),
    quote18:    str = Query("N/A"),
    quote24:    str = Query("N/A"),
    quote36:    str = Query("N/A"),
    acc_damount:str = Query(""),
    com_name:   str = Query(""),
    payload: dict = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    pdf_bytes = await generate_offer_pdf(
        db=db, cid=cid, type_=type,
        acc_name=acc_name, acc_per=acc_per,
        acc_address=acc_address, acc_phone=acc_phone, acc_email=acc_email,
        dasdate=dasdate,
        doccterm1=doccterm1, doccterm2=doccterm2, doccterm3=doccterm3,
        doccterm4=doccterm4, doccterm5=doccterm5,
        quote6=quote6, quote12=quote12, quote18=quote18,
        quote24=quote24, quote36=quote36,
        acc_damount=acc_damount, com_name=com_name,
    )
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Pricing Offer.pdf"'},
    )
