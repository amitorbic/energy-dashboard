"""
Tests for (1) status 'future' kept out of the Portfolio summary/zone customer numbers,
(2) the Portfolio upload's month/day/year-only start date, and (3) per-day start/end
handling in get_forecast_data. Real calls against a LOCAL portfolio-only tenant DB
(tenant_sync_verify_co by default; override with TEST_PORTFOLIO_DB). Every ESI used here
starts with 'ZZFD' and cleanup deletes only rows with that prefix. Never point this at a
production or shared DB.
"""
import inspect
import io
import os
from datetime import date, timedelta

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from controllers import portfolio as P
from middleware.auth import require_admin
from routers import admin_portfolio_contracts as router_mod
from routers import contract_renewal as renewal_mod
from routers import portfolio as portfolio_router
from utils import database
from utils.contract_upload_validation import (
    DATE_FORMATS_MDY, DATE_FORMATS_MDY_OR_ISO, validate_contract_row_detailed,
)

PREFIX = "ZZFD"
TEST_DB = os.getenv("TEST_PORTFOLIO_DB", "tenant_sync_verify_co")
LP = "BUSLOLF_COAST_IDR_WS_NOTOU"
PROFILES = frozenset({LP})
HEADER = "esi_id,load_profile,contract_rate,annual_volume,contract_type,contract_start_date,contract_end_date\n"


def _fmt(d: date) -> str:
    return d.strftime("%m/%d/%Y")


def _row(n: int, typ: str, start: str, end: str, vol: str = "120000") -> list[str]:
    return [f"{PREFIX}{n:010d}", LP, "0.0650", vol, typ, start, end]


def _csv(rows) -> bytes:
    return (HEADER + "\n".join(",".join(r) for r in rows) + "\n").encode()


# -- 2. start date format (no DB) ---------------------------------------------

def _validate(start, typ="Future", **kw):
    data = {"esi_id": "ZZ1", "load_profile": LP, "contract_rate": "0.065", "annual_volume": "1000",
            "contract_type": typ, "contract_end_date": "12/31/2030", "contract_start_date": start}
    return validate_contract_row_detailed(data, valid_profiles=PROFILES, strict_esi=True, **kw)


def _codes(problems):
    return [(p["column"], p["code"]) for p in problems]


@pytest.mark.parametrize("start", ["2027-01-01", "2027-13-45", "13/45/2027", "1/2/27", "tomorrow"])
def test_portfolio_start_date_rejects_iso_and_other_formats(start):
    problems, parsed = _validate(start, start_date_formats=DATE_FORMATS_MDY)
    assert parsed is None
    assert ("contract_start_date", "start_date_invalid") in _codes(problems)
    msg = next(p["message"] for p in problems if p["column"] == "contract_start_date")
    assert msg == "Contract start date must be a real date written as month/day/year, for example 12/31/2027."


@pytest.mark.parametrize("start,iso", [("12/31/2027", "2027-12-31"), ("3/4/2027", "2027-03-04"), ("03/04/2027", "2027-03-04")])
def test_portfolio_start_date_accepts_month_day_year(start, iso):
    problems, parsed = _validate(start, start_date_formats=DATE_FORMATS_MDY)
    assert problems == [] and parsed["contract_start_date"] == iso


def test_portfolio_future_with_blank_start_still_rejected():
    problems, parsed = _validate("", start_date_formats=DATE_FORMATS_MDY)
    assert parsed is None and ("contract_start_date", "future_needs_start") in _codes(problems)


def test_upload_router_passes_the_strict_start_rule():
    assert "start_date_formats=DATE_FORMATS_MDY" in inspect.getsource(router_mod._validate_row)


def test_contract_renewal_upload_behaviour_is_unchanged():
    """contract_renewal never passes start_date_formats, so its start date follows date_formats exactly as before."""
    src = inspect.getsource(renewal_mod)
    assert "start_date_formats" not in src
    assert "date_formats=DATE_FORMATS_MDY" in src
    for start in ("2027-01-01", "12/31/2027", "3/4/2027", "13/45/2027", "", "tomorrow"):
        for typ in ("Future", "Fix"):
            kw = dict(date_formats=DATE_FORMATS_MDY, default_start_today=False)
            assert _validate(start, typ, **kw) == _validate(start, typ, start_date_formats=DATE_FORMATS_MDY, **kw)
    # the library default (no start_date_formats, default date_formats) still accepts ISO as before
    problems, parsed = _validate("2027-01-01")
    assert problems == [] and parsed["contract_start_date"] == "2027-01-01"
    assert DATE_FORMATS_MDY_OR_ISO == ("%m/%d/%Y", "%Y-%m-%d")


# -- 3a. per-day helper (no DB) -------------------------------------------------

D0 = date(2027, 1, 1)
D1 = date(2027, 1, 10)


def _by_day(contracts, zones=("HOUSTON",)):
    return {d: z.get("HOUSTON", 0.0) for d, z in P._zone_annual_mwh_by_day(contracts, list(zones), D0, D1).items()}


def test_helper_end_date_is_inclusive_and_dropped_the_day_after():
    out = _by_day([("HOUSTON", 1000.0, None, date(2027, 1, 5))])
    assert out[date(2027, 1, 4)] == 1.0 and out[date(2027, 1, 5)] == 1.0   # day before end, end day
    assert out[date(2027, 1, 6)] == 0.0                                    # day after end
    assert out[D0] == 1.0                                                  # no start date: from the first day


def test_helper_start_date_is_inclusive_and_not_counted_before():
    out = _by_day([("HOUSTON", 1000.0, date(2027, 1, 5), date(2028, 1, 5))])
    assert out[date(2027, 1, 4)] == 0.0                                    # day before start
    assert out[date(2027, 1, 5)] == 1.0 and out[date(2027, 1, 6)] == 1.0   # start day, day after
    assert out[D1] == 1.0


def test_helper_one_day_meter_and_edges_of_the_window():
    out = _by_day([("HOUSTON", 2000.0, date(2027, 1, 3), date(2027, 1, 3)),
                   ("HOUSTON", 1000.0, date(2026, 6, 1), D0),                    # ends on the first window day
                   ("HOUSTON", 4000.0, D1, date(2030, 1, 1)),                    # starts on the last window day
                   ("HOUSTON", 8000.0, date(2025, 1, 1), date(2026, 12, 31))])   # ended before the window
    assert out[D0] == 1.0 and out[date(2027, 1, 2)] == 0.0
    assert out[date(2027, 1, 3)] == 2.0 and out[date(2027, 1, 4)] == 0.0
    assert out[date(2027, 1, 9)] == 0.0 and out[D1] == 4.0


def test_helper_ignores_zones_not_requested():
    out = P._zone_annual_mwh_by_day([("SOUTH", 1000.0, None, D1)], ["HOUSTON"], D0, D1)
    assert all(v == {} for v in out.values())


# -- DB-backed real-call tests --------------------------------------------------

@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def engine():
    assert TEST_DB.startswith("tenant_"), "refusing to run against a non-test DB"
    eng = create_async_engine(database._build_url(TEST_DB), poolclass=NullPool, connect_args={"charset": "utf8mb4"})
    async with eng.connect() as c:
        assert (await c.execute(text("SELECT is_full_tenant FROM portfolio_contracts_sync_state WHERE id=1"))).scalar() == 0
    yield eng
    await eng.dispose()


async def _cleanup(engine):
    async with engine.begin() as c:
        for t, col in (("portfolio_contracts", "esi_id"), ("customer_forecast_dates", "esid"),
                       ("future_forecast_dates", "esid")):
            await c.execute(text(f"DELETE FROM {t} WHERE {col} LIKE :p"), {"p": PREFIX + "%"})


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client(engine):
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with factory() as s:
            yield s

    app = FastAPI()
    app.include_router(router_mod.router, prefix="/api")
    app.include_router(portfolio_router.router, prefix="/api")
    app.dependency_overrides[database.get_db] = _get_db
    app.dependency_overrides[require_admin] = lambda: {"email": "zztest"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


@pytest_asyncio.fixture(loop_scope="module")
async def fresh(engine):
    await _cleanup(engine)
    yield
    await _cleanup(engine)


async def _upload(client, rows):
    r = await client.post("/api/admin/portfolio-contracts/upload",
                          files={"file": ("u.csv", io.BytesIO(_csv(rows)), "text/csv")}, timeout=120)
    return r.status_code, r.json()


async def _summary(client):
    s = (await client.get("/api/portfolio/summary", timeout=120)).json()
    zones = {z["zone"]: z for z in (await client.get("/api/portfolio/by-zone", timeout=120)).json()}
    return s, zones


@pytest.mark.asyncio(loop_scope="module")
async def test_iso_start_is_rejected_by_the_portfolio_upload(client, fresh):
    t = date.today()
    sc, j = await _upload(client, [_row(1, "Future", "2027-01-01", _fmt(t + timedelta(900)))])
    assert sc == 200 and j["accepted"] is False
    assert j["invalid_rows"][0]["problems"][0]["code"] == "start_date_invalid"
    sc, j = await _upload(client, [_row(1, "Future", "3/4/2027", "12/31/2030")])
    assert j["accepted"] is True
    sc, j = await _upload(client, [_row(2, "Future", "", "12/31/2030")])
    assert j["accepted"] is False and j["invalid_rows"][0]["problems"][0]["code"] == "future_needs_start"


@pytest.mark.asyncio(loop_scope="module")
async def test_future_status_is_excluded_from_customer_numbers_and_counted_separately(client, fresh):
    t = date.today()
    base_s, base_z = await _summary(client)
    far = "12/31/2099"
    rows = [_row(1, "Future", _fmt(t + timedelta(1)), far),            # not started
            _row(2, "Future", "01/01/2028", far),                      # not started
            _row(3, "Future", _fmt(t - timedelta(1)), "09/15/2030"),   # started yesterday -> active
            _row(4, "Fix", "", "09/15/2030")]                          # unaffected
    sc, j = await _upload(client, rows)
    assert sc == 200 and j["accepted"] is True
    s, z = await _summary(client)
    assert s["total_customers"] == base_s["total_customers"] + 2      # only the started Future and the Fix
    assert s["active"] == base_s["active"] + 2
    assert s["expired"] == base_s["expired"]
    assert s["future_customers"] == base_s["future_customers"] + 2
    assert s["latest_end"] == base_s["latest_end"]                     # the 2099 end dates are not counted
    assert s["fixed"] == base_s["fixed"] + 1
    assert s["future_contracts"] == base_s["future_contracts"] + 3     # Contract Mix still counts by type
    zone = "COAST"
    b = base_z.get(zone, {"customers": 0, "future_customers": 0, "total_usage_kwh": 0, "latest_end": None})
    assert z[zone]["customers"] == b["customers"] + 2
    assert z[zone]["future_customers"] == b["future_customers"] + 2
    assert abs(float(z[zone]["total_usage_kwh"]) - (float(b["total_usage_kwh"]) + 240000)) < 0.01
    assert z[zone]["latest_end"] == b["latest_end"] or b["latest_end"] is None


async def _window(client, a: date, b: date):
    r = await client.post("/api/portfolio/position", json={"load_type": "ERCOT Shape Forecast", "from_date": str(a),
                          "through_date": str(b), "granularity": "daily"}, timeout=300)
    return next(x for x in r.json()["rows"] if x["name"] == "Load (Forecast)")["hours"]


@pytest.mark.asyncio(loop_scope="module")
async def test_forecast_start_and_end_dates_are_applied_per_day(client, fresh):
    t = date.today()
    D = t + timedelta(90)
    d0, d1 = D - timedelta(2), D + timedelta(2)       # day before .. day after, boundary in the middle
    base = await _window(client, d0, d1)
    a = _row(1, "Fix", "", _fmt(D), "1000000")                                   # A: ends D
    b = _row(2, "Future", _fmt(D), _fmt(D + timedelta(365)), "1000000")          # B: starts D
    assert (await _upload(client, [a]))[1]["accepted"]
    with_a = await _window(client, d0, d1)
    assert (await _upload(client, [a, b]))[1]["accepted"]
    with_ab = await _window(client, d0, d1)
    a_load = [x - y for x, y in zip(with_a, base)]
    b_load = [x - y for x, y in zip(with_ab, with_a)]
    # index: 0 = two days before D, 1 = day before D, 2 = D, 3 = day after D, 4 = two days after
    assert a_load[0] > 0 and a_load[1] > 0 and a_load[2] > 0      # A included up to and on its end date
    assert abs(a_load[3]) < 1e-6 and abs(a_load[4]) < 1e-6        # A gone from the day after its end date
    assert abs(b_load[0]) < 1e-6 and abs(b_load[1]) < 1e-6        # B not before its start date
    assert b_load[2] > 0 and b_load[3] > 0 and b_load[4] > 0      # B included on its start date and after


# -- 3. end date format (Portfolio upload only) --------------------------------

@pytest.mark.parametrize("end", ["2027-12-31", "2027-13-45", "13/45/2027", "1/2/27", "next year"])
def test_portfolio_end_date_rejects_iso_and_other_formats(end):
    ok, parsed = router_mod._validate_row(1,
        {"esi_id": "ZZ1", "load_profile": LP, "contract_rate": "0.065", "annual_volume": "1000",
         "contract_type": "Fix", "contract_end_date": end}, PROFILES)
    assert parsed is None and ("contract_end_date", "end_date_invalid") in _codes(ok)
    msg = next(p["message"] for p in ok if p["column"] == "contract_end_date")
    assert "month/day/year" in msg and "12/31/2027" in msg


@pytest.mark.parametrize("end,iso", [("12/31/2027", "2027-12-31"), ("3/4/2027", "2027-03-04")])
def test_portfolio_end_date_accepts_month_day_year(end, iso):
    ok, parsed = router_mod._validate_row(1,
        {"esi_id": "ZZ1", "load_profile": LP, "contract_rate": "0.065", "annual_volume": "1000",
         "contract_type": "Fix", "contract_end_date": end}, PROFILES)
    assert ok == [] and parsed["contract_end_date"] == iso


def test_validator_default_still_accepts_iso_end_date_so_other_callers_are_unchanged():
    # The shared validator's default is untouched; only the Portfolio router passes date_formats.
    problems, parsed = _validate("", typ="Fix", date_formats=DATE_FORMATS_MDY_OR_ISO)
    assert problems == []
    data = {"esi_id": "ZZ1", "load_profile": LP, "contract_rate": "0.065", "annual_volume": "1000",
            "contract_type": "Fix", "contract_end_date": "2030-12-31"}
    p, parsed = validate_contract_row_detailed(data, valid_profiles=PROFILES, strict_esi=True)
    assert p == [] and parsed["contract_end_date"] == "2030-12-31"
