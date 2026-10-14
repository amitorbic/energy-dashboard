"""
Real-call tests for the shared-validator rules on the Portfolio standalone upload
(POST /api/admin/portfolio-contracts/upload) against a LOCAL portfolio-only
tenant DB (tenant_sync_verify_co by default; override with TEST_PORTFOLIO_DB).

The DB must have portfolio_contracts_sync_state.is_full_tenant = 0. Every ESI the
tests use starts with 'ZZPF' and cleanup deletes only rows with that prefix, in
portfolio_contracts and the two forecast tables the upload also writes.
Never point this at a production or shared DB.
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

from middleware.auth import require_admin
from routers import admin_portfolio_contracts as router_mod
from utils import database
from utils.contract_upload_validation import load_valid_profiles

pytestmark = pytest.mark.asyncio(loop_scope="module")

TEST_DB = os.getenv("TEST_PORTFOLIO_DB", "tenant_sync_verify_co")
PREFIX = "ZZPF"
HEADER = "esi_id,load_profile,contract_rate,annual_volume,contract_type,contract_end_date\n"
GOOD = {"esi_id": PREFIX + "0000000001", "load_profile": "BUSLOLF_COAST_IDR_WS_NOTOU", "contract_rate": "0.0650",
        "annual_volume": "120000", "contract_type": "Fix", "contract_end_date": "12/31/2030"}


def _csv(*rows: dict) -> bytes:
    cols = list(GOOD.keys())
    lines = [",".join('"' + str({**GOOD, **r}[c]) + '"' for c in cols) for r in rows]
    return (HEADER + "\n".join(lines) + "\n").encode("utf-8")


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def engine():
    assert TEST_DB.startswith("tenant_"), "refusing to run against a non-test DB"
    eng = create_async_engine(database._build_url(TEST_DB), poolclass=NullPool,
                              connect_args={"charset": "utf8mb4"})
    async with eng.connect() as c:
        full = (await c.execute(text("SELECT is_full_tenant FROM portfolio_contracts_sync_state WHERE id=1"))).scalar()
    assert full == 0, f"{TEST_DB} must be a portfolio-only tenant for these tests"
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def client(engine):
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_db():
        async with factory() as s:
            yield s

    app = FastAPI()
    app.include_router(router_mod.router, prefix="/api")
    app.dependency_overrides[database.get_db] = _get_db
    app.dependency_overrides[require_admin] = lambda: {"email": "zztest"}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def _count(engine):
    async with engine.connect() as c:
        return (await c.execute(text("SELECT COUNT(*) FROM portfolio_contracts WHERE esi_id LIKE :p"),
                                {"p": PREFIX + "%"})).scalar()


async def _cleanup(engine):
    async with engine.begin() as c:
        for t, col in (("portfolio_contracts", "esi_id"), ("customer_forecast_dates", "esid"),
                       ("future_forecast_dates", "esid")):
            await c.execute(text(f"DELETE FROM {t} WHERE {col} LIKE :p"), {"p": PREFIX + "%"})


@pytest_asyncio.fixture(autouse=True, loop_scope="module")
async def clean_slate(engine):
    await _cleanup(engine)
    yield
    await _cleanup(engine)


async def _upload(client, body: bytes):
    return await client.post("/api/admin/portfolio-contracts/upload",
                             files={"file": ("u.csv", io.BytesIO(body), "text/csv")})


REJECTS = [
    ("esi_punctuation",  {"esi_id": PREFIX + "00-00000002"},  "spaces or symbols"),
    ("esi_inner_space",  {"esi_id": PREFIX + "0000 000002"},  "spaces or symbols"),
    ("esi_trailing_space", {"esi_id": PREFIX + "0000000002 "}, "spaces or symbols"),
    ("esi_leading_space", {"esi_id": " " + PREFIX + "0000000002"}, "spaces or symbols"),
    ("esi_trailing_newline", {"esi_id": PREFIX + "0000000002" + chr(10)}, "spaces or symbols"),
    ("load_profile_unknown", {"load_profile": "NOT_A_PROFILE"}, "not in the master list"),
    ("load_profile_lowercase", {"load_profile": "buslolf_coast_idr_ws_notou"}, "Did you mean"),
    ("load_profile_trailing_space", {"load_profile": "BUSLOLF_COAST_IDR_WS_NOTOU "}, "not in the master list"),
    ("rate_text",        {"contract_rate": "abc"},            "Contract rate must be a number"),
    ("rate_negative",    {"contract_rate": "-0.01"},          "Contract rate must be a number"),
    ("rate_one",         {"contract_rate": "1.0"},            "Contract rate must be a number"),
    ("rate_cents",       {"contract_rate": "6.5"},            "Contract rate must be a number"),
    ("volume_text",      {"annual_volume": "lots"},           "Annual volume must be a number"),
    ("volume_negative",  {"annual_volume": "-1"},             "Annual volume must be a number"),
]


@pytest.mark.parametrize("rid,override,expected", REJECTS, ids=[r[0] for r in REJECTS])
async def test_reject_inserts_nothing(client, engine, rid, override, expected):
    body = _csv({}, {"esi_id": PREFIX + "0000000002", **override}, {"esi_id": PREFIX + "0000000003"})
    data = (await _upload(client, body)).json()
    assert data["accepted"] is False
    assert data["error_count"] == 1
    assert data["invalid_rows"][0]["line"] == 3
    assert any(expected in e for e in data["invalid_rows"][0]["errors"]), data["invalid_rows"][0]
    assert await _count(engine) == 0


ACCEPTS = [
    ("lettered_esi", {"esi_id": "ZZPF100890107693110LHA2200"}),
    ("rate_0_0465",  {"contract_rate": "0.0465"}),
    ("volume_zero",  {"annual_volume": "0"}),
    ("known_profile", {"load_profile": "RESLOWR_WEST_IDR_WS_NOTOU"}),
]


@pytest.mark.parametrize("rid,override", ACCEPTS, ids=[a[0] for a in ACCEPTS])
async def test_accepts(client, engine, rid, override):
    data = (await _upload(client, _csv(override))).json()
    assert data["accepted"] is True, data
    assert data["inserted"] == 1
    assert await _count(engine) == 1


class _EmptyDb:
    async def execute(self, *_a, **_k):
        class R:
            def fetchall(self): return []
        return R()


async def test_master_empty_fails_loudly_not_skipped(client, engine, monkeypatch):
    monkeypatch.setattr(router_mod, "load_valid_profiles", lambda db: load_valid_profiles(_EmptyDb()))
    resp = await _upload(client, _csv({}))
    assert resp.status_code == 503, resp.text
    assert "load_profiles_master is empty" in resp.json()["detail"]
    assert await _count(engine) == 0


async def test_rejection_carries_excel_row_column_value_code_and_fix(client, engine):
    body = _csv({}, {"esi_id": PREFIX + "0000000002", "contract_rate": "4.65"}, {"esi_id": PREFIX + "0000000003"})
    data = (await _upload(client, body)).json()
    assert data["accepted"] is False and data["error_count"] == 1 and data["problem_count"] == 1
    bad = data["invalid_rows"][0]
    assert bad["line"] == 3 and bad["row"] == 3   # header = row 1, first data row = row 2
    assert bad["errors"] and bad["esi_id"] == PREFIX + "0000000002"
    p = bad["problems"][0]
    assert p["row"] == 3 and p["column"] == "contract_rate" and p["value"] == "4.65"
    assert p["code"] == "rate_out_of_range"
    assert "0.0465" in p["message"] and p["fix"]
    assert await _count(engine) == 0


async def test_duplicate_esi_pair_rejected_nothing_inserted(client, engine):
    e = PREFIX + "0000000007"
    body = _csv({"esi_id": PREFIX + "0000000001"}, {"esi_id": e}, {"esi_id": PREFIX + "0000000003"}, {"esi_id": e})
    data = (await _upload(client, body)).json()
    assert data["accepted"] is False and data["error_count"] == 2
    assert [r["row"] for r in data["invalid_rows"]] == [3, 5]
    p = data["invalid_rows"][0]["problems"][0]
    assert p["code"] == "esi_duplicate" and p["column"] == "esi_id" and "rows 3 and 5" in p["message"]
    assert await _count(engine) == 0


async def test_duplicate_esi_three_rows_all_reported(client, engine):
    e = PREFIX + "0000000007"
    body = _csv({"esi_id": e}, {"esi_id": PREFIX + "0000000002"}, {"esi_id": e}, {"esi_id": e})
    data = (await _upload(client, body)).json()
    assert [r["row"] for r in data["invalid_rows"]] == [2, 4, 5]
    assert all("rows 2, 4 and 5" in r["problems"][0]["message"] for r in data["invalid_rows"])
    assert await _count(engine) == 0


async def test_unexpected_failure_returns_clean_500_with_reference(client, engine, monkeypatch, caplog):
    async def boom(*a, **k):
        raise RuntimeError("secret SQL: INSERT INTO future_forecast_dates ...")

    monkeypatch.setattr(router_mod, "_sync_forecast_tables_bulk", boom)
    await _cleanup(engine)
    try:
        r = await _upload(client, _csv({"esi_id": PREFIX + "0000000099"}))
        assert r.status_code == 500
        detail = r.json()["detail"]
        assert "reference" in detail and "secret SQL" not in detail and "Traceback" not in detail
        ref = detail.rsplit("reference ", 1)[1].split()[0]
        assert any(ref in rec.getMessage() and rec.exc_info for rec in caplog.records)
        assert await _count(engine) == 0  # rolled back, nothing left behind
    finally:
        await _cleanup(engine)


async def test_bulk_insert_then_update_across_batches_and_forecast_tables(client, engine):
    """1,100 rows (3 batches of 500): insert, then re-upload as updates; Future rows move tables."""
    await _cleanup(engine)
    try:
        def rows(rate, ftype_every=10):
            out = []
            for i in range(1100):
                r = {"esi_id": f"{PREFIX}{i:010d}", "contract_rate": rate}
                if i % ftype_every == 0:
                    r.update({"contract_type": "Future", "contract_start_date": "01/01/2031", "contract_end_date": "12/31/2032"})
                out.append(r)
            return out
        def csv_with_start(rs):
            cols = list(GOOD.keys()) + ["contract_start_date"]
            lines = [",".join('"' + str({**GOOD, "contract_start_date": "", **r}[c]) + '"' for c in cols) for r in rs]
            hdr = "esi_id,load_profile,contract_rate,annual_volume,contract_type,contract_end_date,contract_start_date"
            return (hdr + chr(10) + chr(10).join(lines) + chr(10)).encode("utf-8")

        d = (await _upload(client, csv_with_start(rows("0.0650")))).json()
        assert d["accepted"], d["invalid_rows"][:2]
        assert d["inserted"] == 1100 and d["updated"] == 0
        async with engine.connect() as c:
            n_cf = (await c.execute(text("SELECT COUNT(*) FROM customer_forecast_dates WHERE esid LIKE :p"), {"p": PREFIX + "%"})).scalar()
            n_ff = (await c.execute(text("SELECT COUNT(*) FROM future_forecast_dates WHERE esid LIKE :p"), {"p": PREFIX + "%"})).scalar()
        assert (n_cf, n_ff) == (990, 110)
        d = (await _upload(client, csv_with_start(rows("0.0700", ftype_every=5)))).json()
        assert d["accepted"] and d["inserted"] == 0 and d["updated"] == 1100
        async with engine.connect() as c:
            assert (await c.execute(text("SELECT COUNT(*) FROM portfolio_contracts WHERE esi_id LIKE :p AND contract_rate='0.0700'"), {"p": PREFIX + "%"})).scalar() == 1100
            assert (await c.execute(text("SELECT COUNT(*) FROM portfolio_contracts WHERE esi_id LIKE :p"), {"p": PREFIX + "%"})).scalar() == 1100
            n_cf = (await c.execute(text("SELECT COUNT(*) FROM customer_forecast_dates WHERE esid LIKE :p"), {"p": PREFIX + "%"})).scalar()
            n_ff = (await c.execute(text("SELECT COUNT(*) FROM future_forecast_dates WHERE esid LIKE :p"), {"p": PREFIX + "%"})).scalar()
        assert (n_cf, n_ff) == (880, 220)  # rows that became Future left customer_forecast_dates
    finally:
        await _cleanup(engine)


async def _lock_is_free(engine) -> bool:
    async with engine.connect() as c:
        name = (await c.execute(text("SELECT CONCAT('pu:', MD5(DATABASE()))"))).scalar()
        return (await c.execute(text("SELECT IS_FREE_LOCK(:n)"), {"n": name})).scalar() == 1


async def test_second_simultaneous_upload_refused_with_409_then_lock_released(client, engine, monkeypatch):
    import asyncio
    await _cleanup(engine)
    entered, proceed = asyncio.Event(), asyncio.Event()
    real = router_mod._write_contracts

    async def slow(db, rows):
        entered.set()
        await proceed.wait()
        return await real(db, rows)

    monkeypatch.setattr(router_mod, "_write_contracts", slow)
    try:
        first = asyncio.create_task(_upload(client, _csv({"esi_id": PREFIX + "0000000071"})))
        await asyncio.wait_for(entered.wait(), 30)
        assert not await _lock_is_free(engine)
        second = await _upload(client, _csv({"esi_id": PREFIX + "0000000072"}))
        assert second.status_code == 409
        assert second.json()["detail"] == "Another upload is still running. Wait for it to finish."
        proceed.set()
        r1 = await first
        assert r1.status_code == 200 and r1.json()["accepted"] is True
        assert await _lock_is_free(engine)  # released after success
        assert await _count(engine) == 1  # only the first upload wrote anything
    finally:
        proceed.set()
        await _cleanup(engine)


async def test_lock_released_after_error_and_after_rejection(client, engine, monkeypatch):
    await _cleanup(engine)

    async def boom(*a, **k):
        raise RuntimeError("boom")

    try:
        with monkeypatch.context() as mp:
            mp.setattr(router_mod, "_sync_forecast_tables_bulk", boom)
            r = await _upload(client, _csv({"esi_id": PREFIX + "0000000073"}))
            assert r.status_code == 500
        assert await _lock_is_free(engine)  # released after an exception
        r = await _upload(client, _csv({"esi_id": PREFIX + "0000000074", "contract_rate": "9"}))
        assert r.status_code == 200 and r.json()["accepted"] is False
        assert await _lock_is_free(engine)  # released after a validation rejection
        r = await _upload(client, b"not,a,valid\n1,2,3\n")
        assert r.status_code == 400
        assert await _lock_is_free(engine)  # released after an HTTP error
        r = await _upload(client, _csv({"esi_id": PREFIX + "0000000075"}))  # a later upload is not blocked
        assert r.status_code == 200 and r.json()["accepted"] is True
    finally:
        await _cleanup(engine)


async def test_same_file_twice_gives_same_rows(client, engine):
    await _cleanup(engine)
    try:
        body = _csv({"esi_id": PREFIX + "0000000081"}, {"esi_id": PREFIX + "0000000082", "contract_type": "LMP"})
        a = (await _upload(client, body)).json()
        assert a["accepted"] and (a["inserted"], a["updated"]) == (2, 0)
        async def snap():
            async with engine.connect() as c:
                return (await c.execute(text("SELECT esi_id,load_profile,contract_rate,annual_volume,contract_type,contract_end_date FROM portfolio_contracts WHERE esi_id LIKE :p ORDER BY esi_id"), {"p": PREFIX + "%"})).fetchall()
        s1 = await snap()
        b = (await _upload(client, body)).json()
        assert b["accepted"] and (b["inserted"], b["updated"]) == (0, 2)
        assert await snap() == s1 and await _count(engine) == 2
    finally:
        await _cleanup(engine)


# ── Duplicate upload rows: safety net and /status count ──────────────────────────────────

_INSERT_UPLOAD_ROW = ("INSERT INTO portfolio_contracts (esi_id,load_profile,contract_rate,annual_volume,contract_type,"
                      "contract_start_date,contract_end_date,source) VALUES (:e,'BUSLOLF_COAST_IDR_WS_NOTOU','0.0650',"
                      "'1','Fix','2026-01-01','2030-12-31','upload')")


async def _upload_rows(engine, esi):
    async with engine.connect() as c:
        return (await c.execute(text("SELECT COUNT(*) FROM portfolio_contracts WHERE esi_id=:e AND source='upload'"),
                                {"e": esi})).scalar()


async def test_safety_net_rolls_back_when_upload_would_create_duplicate_rows(client, engine, monkeypatch):
    """Two upload rows for one ESI inside the upload's own transaction: nothing is committed."""
    esi, other = PREFIX + "0000000091", PREFIX + "0000000092"
    real = router_mod._write_contracts

    async def write_then_double(db, rows):
        out = await real(db, rows)
        await db.execute(text(_INSERT_UPLOAD_ROW), {"e": rows[0]["esi_id"]})  # a second copy
        return out

    monkeypatch.setattr(router_mod, "_write_contracts", write_then_double)
    r = await _upload(client, _csv({"esi_id": esi}, {"esi_id": other}))
    assert r.status_code == 409
    detail = r.json()["detail"]
    assert "nothing was imported" in detail and "reference" in detail and "SELECT" not in detail
    assert await _count(engine) == 0           # rolled back: neither row exists
    assert await _lock_is_free(engine)


async def test_safety_net_sees_a_row_another_request_committed_meanwhile(client, engine, monkeypatch):
    """Simulates the real race: a competing upload commits the same ESI after our lookup, before our commit."""
    esi = PREFIX + "0000000093"
    real = router_mod._write_contracts

    async def write_then_competitor_commits(db, rows):
        out = await real(db, rows)
        # a separate connection (another request), no lock held, commits first. It must not block
        # on our uncommitted row, so use a different ESI row id range: same ESI is allowed (no unique key).
        async with engine.begin() as other:
            await other.execute(text(_INSERT_UPLOAD_ROW), {"e": esi})
        return out

    monkeypatch.setattr(router_mod, "_write_contracts", write_then_competitor_commits)
    r = await _upload(client, _csv({"esi_id": esi}))
    assert r.status_code == 409 and "reference" in r.json()["detail"]
    assert await _upload_rows(engine, esi) == 1   # only the competitor's row; ours was rolled back


async def test_status_reports_duplicate_upload_esis_only_when_present(client, engine):
    async def dup_count():
        r = await client.get("/api/admin/portfolio-contracts/status")
        assert r.status_code == 200
        return r.json()["duplicate_upload_esis"]

    base = await dup_count()
    esi = PREFIX + "0000000094"
    async with engine.begin() as c:
        await c.execute(text(_INSERT_UPLOAD_ROW), {"e": esi})
        await c.execute(text(_INSERT_UPLOAD_ROW), {"e": esi})
    assert await dup_count() == base + 1
    async with engine.begin() as c:
        await c.execute(text("DELETE FROM portfolio_contracts WHERE esi_id=:e LIMIT 1"), {"e": esi})
    assert await dup_count() == base


async def test_sequential_uploads_never_create_duplicates(client, engine):
    body = _csv({"esi_id": PREFIX + "0000000095"}, {"esi_id": PREFIX + "0000000096"})
    for _ in range(3):
        assert (await _upload(client, body)).json()["accepted"] is True
    assert await _count(engine) == 2
    assert (await client.get("/api/admin/portfolio-contracts/status")).json()["duplicate_upload_esis"] == 0
