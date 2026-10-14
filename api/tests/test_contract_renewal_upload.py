"""
Real-call tests for POST /api/contract-renewal/upload against a LOCAL tenant DB
(tenant_portfolio_sync_test_co by default; override with TEST_TENANT_DB).

Not mocked: a minimal FastAPI app mounts the real router and get_db is pointed
at the local tenant. The tenant's contract_renewal must be EMPTY when the tests
start (the guard under test makes that the only state an upload can succeed in).
Every row the tests create is tagged company_name 'ZZTEST_*' (or
changed_by 'zztest' / contract_serial 999999991) and cleanup deletes only those.
Never point this at a production or shared DB.

Run from api/:
    pytest tests/test_contract_renewal_upload.py -v
"""
import io
import os

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from routers import contract_renewal
from utils import database
from utils.contract_upload_validation import load_valid_profiles

pytestmark = pytest.mark.asyncio(loop_scope="module")

TEST_DB = os.getenv("TEST_TENANT_DB", "tenant_portfolio_sync_test_co")
ORPHAN_SERIAL = 999999991
GOOD_ESI = "10443720008719104"
GOOD_LP = "BUSLOLF_COAST_IDR_WS_NOTOU"  # a real load_profiles_master value

BASE = {
    "company_name": "ZZTEST_A",
    "premise_id": GOOD_ESI,
    "load_profile": GOOD_LP,
    "contract_rate": "0.0650",
    "usage": "120000",
    "contract_type": "Fix",
    "contract_end_date": "6/23/2028",
    "contract_start_date": "",
}


def _csv(*rows: dict) -> bytes:
    cols = list(BASE.keys())
    lines = [",".join(cols)]
    for r in rows:
        merged = {**BASE, **r}
        lines.append(",".join('"' + str(merged[c]).replace('"', '""') + '"' for c in cols))
    return ("\n".join(lines) + "\n").encode("utf-8")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def engine():
    assert TEST_DB.startswith("tenant_") or TEST_DB.startswith("zz"), "refusing to run against a non-test DB"
    eng = create_async_engine(
        database._build_url(TEST_DB), poolclass=NullPool, connect_args={"charset": "utf8mb4"}
    )
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client(engine):
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with factory() as s:
            yield s

    app = FastAPI()
    app.include_router(contract_renewal.router, prefix="/api")
    app.dependency_overrides[database.get_db] = _get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


async def _scalar(engine, sql, **p):
    async with engine.connect() as conn:
        return (await conn.execute(text(sql), p)).scalar()


async def _exec(engine, sql, **p):
    async with engine.begin() as conn:
        await conn.execute(text(sql), p)


async def _cleanup(engine):
    await _exec(engine, "DELETE FROM contract_renewal WHERE company_name LIKE 'ZZTEST\\_%'")
    await _exec(engine, "DELETE FROM customer_edit_log WHERE changed_by = 'zztest'")
    async with engine.begin() as conn:
        await conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        await conn.execute(text("DELETE FROM contract_addon_charges WHERE contract_serial = :s"), {"s": ORPHAN_SERIAL})
        await conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))


@pytest_asyncio.fixture(autouse=True, loop_scope="module")
async def clean_slate(engine):
    await _cleanup(engine)
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0, (
        f"{TEST_DB}.contract_renewal is not empty; tests need an empty local tenant table"
    )
    yield
    await _cleanup(engine)


async def _upload(client, body: bytes):
    return await client.post("/api/contract-renewal/upload", files={"file": ("u.csv", io.BytesIO(body), "text/csv")})


# Each reject reason: (id, row overrides, substring expected in the error list)
REJECTS = [
    ("esi_missing",          {"premise_id": ""},                              "ESI ID is required"),
    ("esi_space_inside",     {"premise_id": "1044372000 8719104"},            "spaces or symbols"),
    ("esi_leading_space",    {"premise_id": " " + GOOD_ESI},                  "spaces or symbols"),
    ("esi_trailing_newline", {"premise_id": GOOD_ESI + "\n"},                 "spaces or symbols"),
    ("esi_tab",              {"premise_id": GOOD_ESI + "\t"},                 "spaces or symbols"),
    ("esi_punctuation",      {"premise_id": "10443-72000871910"},             "spaces or symbols"),
    ("esi_underscore",       {"premise_id": "10443_72000871910"},             "spaces or symbols"),
    ("esi_unicode_digit",    {"premise_id": "1044372000871910" + chr(0x663)}, "spaces or symbols"),
    ("load_profile_missing", {"load_profile": ""},                            "Load profile is required"),
    ("load_profile_unknown", {"load_profile": "NOT_A_PROFILE"},               "not in the master list"),
    ("load_profile_near_miss", {"load_profile": "BUSHILF_WEST_IDR_NWS_NOTOU"}, "not in the master list"),
    ("load_profile_lowercase", {"load_profile": GOOD_LP.lower()},             "Did you mean 'BUSLOLF_COAST_IDR_WS_NOTOU'"),
    ("load_profile_trailing_space", {"load_profile": GOOD_LP + " "},          "not in the master list"),
    ("rate_missing",         {"contract_rate": ""},                           "Contract rate is required"),
    ("rate_whitespace_only", {"contract_rate": "   "},                        "Contract rate is required"),
    ("rate_text",            {"contract_rate": "abc"},                        "Contract rate must be a number"),
    ("rate_dollar_sign",     {"contract_rate": "$0.065"},                     "Contract rate must be a number"),
    ("rate_exponent",        {"contract_rate": "6.5e-2"},                     "Contract rate must be a number"),
    ("rate_nan",             {"contract_rate": "NaN"},                        "Contract rate must be a number"),
    ("rate_negative",        {"contract_rate": "-0.01"},                      "Contract rate must be a number"),
    ("rate_one",             {"contract_rate": "1.0"},                        "Contract rate must be a number"),
    ("rate_cents_not_dollars", {"contract_rate": "6.5"},                      "Contract rate must be a number"),
    ("usage_missing",        {"usage": ""},                                   "Annual volume is required"),
    ("volume_text",          {"usage": "lots"},                               "Annual volume must be a number"),
    ("volume_comma",         {"usage": "120,000"},                            "Annual volume must be a number"),
    ("volume_negative",      {"usage": "-1"},                                 "Annual volume must be a number"),
    ("type_missing",         {"contract_type": ""},                           "Contract type is required"),
    ("type_unknown",         {"contract_type": "Bogus"},                      "not recognised"),
    ("type_default",         {"contract_type": "Default"},                    "not recognised"),
    ("end_date_missing",     {"contract_end_date": ""},                       "Contract end date is required"),
    ("end_date_iso",         {"contract_end_date": "2028-06-23"},             "must be a real date"),
    ("end_date_text",        {"contract_end_date": "next year"},              "must be a real date"),
    ("end_date_impossible",  {"contract_end_date": "13/45/2028"},             "must be a real date"),
    ("future_no_start",      {"contract_type": "Future", "contract_start_date": ""}, "Future contracts need"),
    ("start_date_bad",       {"contract_type": "Future", "contract_start_date": "2027-01-01"}, "Contract start date"),
]


@pytest.mark.parametrize("rid,override,expected", REJECTS, ids=[r[0] for r in REJECTS])
async def test_reject_reason_inserts_nothing(client, engine, rid, override, expected):
    body = _csv({"company_name": "ZZTEST_good1"}, {"company_name": "ZZTEST_bad", **override},
                {"company_name": "ZZTEST_good2", "premise_id": "10443720008719105"})
    resp = await _upload(client, body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["accepted"] is False
    assert data["total_rows"] == 3
    assert data["error_count"] == 1
    bad = data["invalid_rows"][0]
    assert bad["line"] == 3
    assert any(expected in e for e in bad["errors"]), bad["errors"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0
    assert await _scalar(engine, "SELECT COUNT(*) FROM portfolio_contracts") == 0


ACCEPTS = [
    ("lettered_22char_esi", {"premise_id": "100890107693110LHA2200"}),
    ("rate_0_0465",         {"contract_rate": "0.0465"}),
    ("rate_zero",           {"contract_rate": "0"}),
    ("rate_just_under_one", {"contract_rate": "0.9999"}),
    ("volume_zero",         {"usage": "0"}),
    ("volume_decimal",      {"usage": "1234.5"}),
]


@pytest.mark.parametrize("rid,override", ACCEPTS, ids=[a[0] for a in ACCEPTS])
async def test_accepted_values_insert(client, engine, rid, override):
    resp = await _upload(client, _csv({"company_name": "ZZTEST_ok", **override}))
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"accepted": True, "inserted": 1, "total": 1}
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal WHERE company_name='ZZTEST_ok'") == 1


async def test_known_profile_is_accepted(client, engine):
    resp = await _upload(client, _csv({"company_name": "ZZTEST_ok", "load_profile": "RESLOWR_WEST_IDR_WS_NOTOU"}))
    assert resp.json() == {"accepted": True, "inserted": 1, "total": 1}


class _EmptyDb:
    async def execute(self, *_a, **_k):
        class R:
            def fetchall(self): return []
        return R()


class _BrokenDb:
    async def execute(self, *_a, **_k):
        raise RuntimeError("table does not exist")


async def test_master_empty_fails_loudly_not_skipped(client, engine, monkeypatch):
    # Real upload endpoint, with the profile loader pointed at an empty master table.
    monkeypatch.setattr(contract_renewal, "load_valid_profiles", lambda db: load_valid_profiles(_EmptyDb()))
    resp = await _upload(client, _csv({"company_name": "ZZTEST_ok"}))
    assert resp.status_code == 503, resp.text
    assert "load_profiles_master is empty" in resp.json()["detail"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_master_missing_fails_loudly_not_skipped(client, engine, monkeypatch):
    monkeypatch.setattr(contract_renewal, "load_valid_profiles", lambda db: load_valid_profiles(_BrokenDb()))
    resp = await _upload(client, _csv({"company_name": "ZZTEST_ok"}))
    assert resp.status_code == 503, resp.text
    assert "could not be read" in resp.json()["detail"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_every_bad_row_is_reported(client, engine):
    body = _csv({"premise_id": ""}, {"contract_end_date": "x"}, {"contract_type": ""}, {})
    data = (await _upload(client, body)).json()
    assert data["accepted"] is False
    assert [r["line"] for r in data["invalid_rows"]] == [2, 3, 4]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_one_row_with_several_problems_lists_all_reasons(client, engine):
    data = (await _upload(client, _csv({"contract_rate": "abc", "usage": "-5", "premise_id": "10 4"}))).json()
    assert data["accepted"] is False
    assert len(data["invalid_rows"][0]["errors"]) == 3
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_missing_required_column_is_400_and_inserts_nothing(client, engine):
    resp = await _upload(client, b"company_name,premise_id\nZZTEST_x,10443720008719104\n")
    assert resp.status_code == 400
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_first_upload_into_empty_table_works(client, engine):
    body = _csv({"company_name": "ZZTEST_1"}, {"company_name": "ZZTEST_2", "premise_id": "10443720008719105",
                                                "contract_end_date": "12/31/2027"})
    resp = await _upload(client, body)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"accepted": True, "inserted": 2, "total": 2}
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal WHERE company_name LIKE 'ZZTEST\\_%'") == 2
    # every accepted row reached Portfolio via the sync trigger (full-tenant DB)
    assert await _scalar(engine, "SELECT COUNT(*) FROM portfolio_contracts WHERE source='synced'") == 2
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal_unsynced") == 0
    # stored exactly as uploaded (m/d/Y string), no whitespace added
    assert await _scalar(engine, "SELECT contract_end_date FROM contract_renewal WHERE company_name='ZZTEST_1'") == "6/23/2028"


async def test_second_upload_returns_409_and_changes_nothing(client, engine):
    first = await _upload(client, _csv({"company_name": "ZZTEST_1"}))
    assert first.status_code == 200
    before = await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal")
    resp = await _upload(client, _csv({"company_name": "ZZTEST_2", "premise_id": "10443720008719105"}))
    assert resp.status_code == 409
    assert "already has" in resp.json()["detail"] and "support" in resp.json()["detail"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == before
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal WHERE company_name='ZZTEST_2'") == 0


async def test_invalid_second_upload_is_still_409_not_validation(client, engine):
    await _upload(client, _csv({"company_name": "ZZTEST_1"}))
    resp = await _upload(client, _csv({"company_name": "ZZTEST_bad", "premise_id": ""}))
    assert resp.status_code == 409


async def test_dependent_soft_reference_rows_only_returns_409(client, engine):
    await _exec(engine, "INSERT INTO customer_edit_log (contract_serial, field_name, changed_by) "
                        "VALUES (:s, 'zz', 'zztest')", s=ORPHAN_SERIAL)
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0
    resp = await _upload(client, _csv({"company_name": "ZZTEST_1"}))
    assert resp.status_code == 409
    assert "customer_edit_log" in resp.json()["detail"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0


async def test_dependent_hard_fk_rows_only_returns_409(client, engine):
    # An addon row with no parent contract_renewal row can only exist with FK checks off.
    async with engine.begin() as conn:
        await conn.execute(text("SET FOREIGN_KEY_CHECKS=0"))
        await conn.execute(text("INSERT INTO contract_addon_charges (contract_serial, addon_type_id) VALUES (:s, 1)"),
                           {"s": ORPHAN_SERIAL})
        await conn.execute(text("SET FOREIGN_KEY_CHECKS=1"))
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0
    resp = await _upload(client, _csv({"company_name": "ZZTEST_1"}))
    assert resp.status_code == 409
    assert "contract_addon_charges" in resp.json()["detail"]
    assert await _scalar(engine, "SELECT COUNT(*) FROM contract_renewal") == 0
