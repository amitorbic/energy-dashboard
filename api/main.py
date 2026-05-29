from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import auth
from routers import (
    auth,
    gas_strip,
    heat_rate,
    consumption,
    margin,
    charges,
    daily_pricing,
    contracts_confirm,
)

app = FastAPI(title="AmeriPower API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")

# Add module routers as you build them:
# from routers import pricing, broker
# app.include_router(pricing.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok", "app": "AmeriPower API", "version": "1.0.0"}


app.include_router(daily_pricing.router, prefix="/api")
app.include_router(gas_strip.router, prefix="/api")
app.include_router(heat_rate.router, prefix="/api")
app.include_router(consumption.router, prefix="/api")
app.include_router(margin.router, prefix="/api")
app.include_router(charges.router, prefix="/api")
from routers.custom_pricing import router as customers_router

app.include_router(customers_router, prefix="/api")
print(app.routes)
from routers.brokers import router as brokers_router

app.include_router(brokers_router, prefix="/api")
from routers.email_pricing import router as email_router

app.include_router(email_router, prefix="/api")
from routers.commission import router as commission_router

app.include_router(commission_router, prefix="/api")

from routers.contracts_confirm import router as contracts_router

app.include_router(contracts_router, prefix="/api")

from routers import billing

app.include_router(billing.router, prefix="/api")

from routers import contract_renewal

app.include_router(contract_renewal.router, prefix="/api")

from routers import bne

app.include_router(bne.router, prefix="/api")

from routers import msp

app.include_router(msp.router, prefix="/api")

from routers import sample_bill

app.include_router(sample_bill.router, prefix="/api")
from routers.payment import router as payment_router

app.include_router(payment_router)
from routers.collections import router as collections_router

app.include_router(collections_router)

from routers.imports import router as imports_router

app.include_router(imports_router)

from routers.portfolio import router as portfolio_router

app.include_router(portfolio_router, prefix="/api")
from routers.hedging import router as hedging_router

app.include_router(hedging_router, prefix="/api")

from routers.dam import router as dam_router

app.include_router(dam_router, prefix="/api")
