"""
Broker Bill Sample router — prefix /api/broker/bill
POST /broker/bill/generate  → StreamingResponse PDF
POST /broker/bill/calculate → JSON preview of calculated values
"""

from io import BytesIO

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middleware.auth import require_auth
from controllers.broker_bill import generate_bill_pdf, calculate_bill

router = APIRouter(prefix="/broker/bill", tags=["broker-bill"])


class BillRequest(BaseModel):
    name: str = ""
    zone: str = "CNP"
    txtdate: str = ""       # YYYY-MM-DD (start)
    txtdate1: str = ""      # YYYY-MM-DD (end)
    tdsp: float = 0.0
    rate: float = 0.0       # cents per kWh
    usage: float = 0.0
    fee: float = 0.0
    address: str = ""
    tax_exempt: bool = False
    residential_tax_exemp: bool = False


@router.post("/generate")
async def generate(req: BillRequest, payload: dict = Depends(require_auth)):
    pdf = generate_bill_pdf(
        name=req.name, zone=req.zone,
        txtdate=req.txtdate, txtdate1=req.txtdate1,
        tdsp=req.tdsp, rate=req.rate, usage=req.usage, fee=req.fee,
        address=req.address,
        tax_exempt=req.tax_exempt,
        residential_tax_exemp=req.residential_tax_exemp,
    )
    return StreamingResponse(
        BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="Sample_Bill.pdf"'},
    )


@router.post("/calculate")
async def calculate(req: BillRequest, payload: dict = Depends(require_auth)):
    return calculate_bill(
        rate=req.rate, usage=req.usage, tdsp=req.tdsp, fee=req.fee,
        tax_exempt=req.tax_exempt,
        residential_tax_exemp=req.residential_tax_exemp,
        zone=req.zone, txtdate=req.txtdate, txtdate1=req.txtdate1,
    )
