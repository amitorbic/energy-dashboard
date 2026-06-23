"""
ERCOT Settlement Data Ingestion Script
Loads DAI and LLS output files from ERCOT settlement ZIP

Usage:
    python ingest_ercot_settlement.py <zip_file_path>

Example:
    python ingest_ercot_settlement.py "C:/ERCOT/ext_00011113_...RTM_FINAL2_CSV_.zip"

Handles:
    - DAIOUTPUTHEADER + DAIOUTPUTINTERVAL (REP load by zone)
    - LLSOUTPUTHEADER + LLSOUTPUTINTERVAL (granular load by profile)
    - All settlement runs: INITIAL, FINAL2, TRUEUP3 etc
    - Upsert logic: final replaces initial for same oper_date
"""

import os
import sys
import csv
import re
import asyncio
import zipfile
import io
from datetime import datetime
from dotenv import load_dotenv
import aiomysql

load_dotenv()

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_USER     = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME")
DB_PORT     = int(os.getenv("DB_PORT", "3306"))
if not DB_NAME:
    raise SystemExit("ERROR: DB_NAME environment variable is not set. Set it before running this script.")

# Column definitions matching ERCOT DDL exactly
DAIOUTPUTHEADER_COLS = [
    "uiddaioutputheader", "saverecorder", "savechannel", "uidbilldeterminant",
    "qsecode", "repcode", "profilecode", "losscode", "ufezonecode",
    "uidsetlpoint", "tdspcode", "uidresource", "pgccode", "resourceid",
    "method", "gensitecode", "noiecode", "lstime", "profiletypecode",
    "weatherzonecode", "metertype", "weathersensitivity", "toutype"
]

LLSOUTPUTHEADER_COLS = [
    "uidllsoutputheader", "uidbilldeterminant", "qsecode", "repcode",
    "uidsetlpoint", "ufezonecode", "profilecode", "losscode", "tdspcode",
    "method", "lstime", "saverecorder", "savechannel"
]

# Interval table fixed columns (before INT001-INT100)
INTERVAL_FIXED_COLS = [
    "uid_col", "uid_hdr_col", "starttime", "stoptime",
    "uidstatementsched", "calcgroup", "spi", "uomcode",
    "dstparticipant", "origin", "chnlcuttimestamp", "tzstdname",
    "total", "maximum", "minimum", "intervalcount"
]

def parse_filename(filename):
    """Parse ERCOT filename to extract metadata"""
    # Format: DUNS-FILETYPE_CODE_RTM(YYYYMMDD_SETTLEMENTRUN).csv
    m = re.search(
        r'(\d+)-(\w+)_CODE_RTM\((\d{8})_(\w+)\)',
        filename
    )
    if m:
        return {
            "duns"           : m.group(1),
            "file_type"      : m.group(2),
            "oper_date"      : f"{m.group(3)[:4]}-{m.group(3)[4:6]}-{m.group(3)[6:]}",
            "settlement_run" : m.group(4),
        }
    return None

def parse_date(val):
    """Parse ERCOT date format MM/DD/YYYY HH:MM:SS"""
    if not val or str(val).strip() == "":
        return None
    try:
        return datetime.strptime(str(val).strip(), "%m/%d/%Y %H:%M:%S")
    except:
        return None

def safe_decimal(val):
    """Convert to decimal safely"""
    if val is None or str(val).strip() == "":
        return None
    try:
        return float(str(val).strip())
    except:
        return None

def safe_int(val):
    if val is None or str(val).strip() == "":
        return None
    try:
        return int(float(str(val).strip()))
    except:
        return None

def safe_str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


async def load_daioutputheader(rows, meta, conn):
    """Load DAIOUTPUTHEADER rows"""
    inserted = updated = 0

    for row in rows:
        if len(row) < 23:
            continue

        vals = {
            "oper_date"          : meta["oper_date"],
            "settlement_run"     : meta["settlement_run"],
            "duns_number"        : meta["duns"],
            "uiddaioutputheader" : safe_int(row[0]),
            "saverecorder"       : safe_str(row[1]),
            "savechannel"        : safe_int(row[2]),
            "uidbilldeterminant" : safe_int(row[3]),
            "qsecode"            : safe_str(row[4]),
            "repcode"            : safe_str(row[5]),
            "profilecode"        : safe_str(row[6]),
            "losscode"           : safe_str(row[7]),
            "ufezonecode"        : safe_str(row[8]),
            "uidsetlpoint"       : safe_int(row[9]),
            "tdspcode"           : safe_str(row[10]),
            "uidresource"        : safe_int(row[11]),
            "pgccode"            : safe_str(row[12]),
            "resourceid"         : safe_str(row[13]),
            "method"             : safe_str(row[14]),
            "gensitecode"        : safe_str(row[15]),
            "noiecode"           : safe_str(row[16]),
            "lstime"             : parse_date(row[17]),
            "profiletypecode"    : safe_str(row[18]),
            "weatherzonecode"    : safe_str(row[19]),
            "metertype"          : safe_str(row[20]),
            "weathersensitivity" : safe_str(row[21]),
            "toutype"            : safe_str(row[22]) if len(row) > 22 else None,
        }

        async with conn.cursor() as cur:
            # Check if exists
            await cur.execute("""
                SELECT id FROM ercot_daioutputheader
                WHERE uiddaioutputheader = %s
                AND oper_date = %s AND settlement_run = %s
            """, (vals["uiddaioutputheader"], vals["oper_date"], vals["settlement_run"]))
            exists = await cur.fetchone()

            if exists:
                await cur.execute("""
                    UPDATE ercot_daioutputheader SET
                        saverecorder=%(saverecorder)s, savechannel=%(savechannel)s,
                        uidbilldeterminant=%(uidbilldeterminant)s,
                        qsecode=%(qsecode)s, repcode=%(repcode)s,
                        profilecode=%(profilecode)s, losscode=%(losscode)s,
                        ufezonecode=%(ufezonecode)s, uidsetlpoint=%(uidsetlpoint)s,
                        tdspcode=%(tdspcode)s, uidresource=%(uidresource)s,
                        pgccode=%(pgccode)s, resourceid=%(resourceid)s,
                        method=%(method)s, gensitecode=%(gensitecode)s,
                        noiecode=%(noiecode)s, lstime=%(lstime)s,
                        profiletypecode=%(profiletypecode)s,
                        weatherzonecode=%(weatherzonecode)s,
                        metertype=%(metertype)s,
                        weathersensitivity=%(weathersensitivity)s,
                        toutype=%(toutype)s,
                        duns_number=%(duns_number)s
                    WHERE uiddaioutputheader=%(uiddaioutputheader)s
                    AND oper_date=%(oper_date)s
                    AND settlement_run=%(settlement_run)s
                """, vals)
                updated += 1
            else:
                await cur.execute("""
                    INSERT INTO ercot_daioutputheader (
                        oper_date, settlement_run, duns_number,
                        uiddaioutputheader, saverecorder, savechannel,
                        uidbilldeterminant, qsecode, repcode,
                        profilecode, losscode, ufezonecode, uidsetlpoint,
                        tdspcode, uidresource, pgccode, resourceid,
                        method, gensitecode, noiecode, lstime,
                        profiletypecode, weatherzonecode, metertype,
                        weathersensitivity, toutype
                    ) VALUES (
                        %(oper_date)s, %(settlement_run)s, %(duns_number)s,
                        %(uiddaioutputheader)s, %(saverecorder)s, %(savechannel)s,
                        %(uidbilldeterminant)s, %(qsecode)s, %(repcode)s,
                        %(profilecode)s, %(losscode)s, %(ufezonecode)s,
                        %(uidsetlpoint)s, %(tdspcode)s, %(uidresource)s,
                        %(pgccode)s, %(resourceid)s, %(method)s,
                        %(gensitecode)s, %(noiecode)s, %(lstime)s,
                        %(profiletypecode)s, %(weatherzonecode)s,
                        %(metertype)s, %(weathersensitivity)s, %(toutype)s
                    )
                """, vals)
                inserted += 1

    await conn.commit()
    return inserted, updated


async def load_interval_table(rows, meta, conn, table, uid_col, hdr_uid_col):
    """Generic loader for both DAI and LLS interval tables"""
    inserted = updated = 0

    # Build INT column names
    int_cols = [f"int{str(i).zfill(3)}" for i in range(1, 101)]

    for row in rows:
        if len(row) < 17:
            continue

        # Parse trailing LSTIME (last non-empty value after INT columns)
        lstime_val = None
        # Last 5 cols after INT100 are: padding, padding, padding, padding, LSTIME
        if len(row) >= 117:
            lstime_val = parse_date(row[116])
        elif len(row) >= 113:
            # Find last non-empty
            for i in range(len(row)-1, 111, -1):
                if row[i] and str(row[i]).strip():
                    lstime_val = parse_date(row[i])
                    break

        vals = {
            "oper_date"      : meta["oper_date"],
            "settlement_run" : meta["settlement_run"],
            uid_col          : safe_int(row[0]),
            hdr_uid_col      : safe_int(row[1]),
            "starttime"      : parse_date(row[2]),
            "stoptime"       : parse_date(row[3]),
            "uidstatementsched": safe_int(row[4]),
            "calcgroup"      : safe_int(row[5]),
            "spi"            : safe_int(row[6]),
            "uomcode"        : safe_str(row[7]),
            "dstparticipant" : safe_str(row[8]),
            "origin"         : safe_str(row[9]),
            "chnlcuttimestamp": parse_date(row[10]),
            "tzstdname"      : safe_str(row[11]),
            "total"          : safe_decimal(row[12]),
            "maximum"        : safe_decimal(row[13]),
            "minimum"        : safe_decimal(row[14]),
            "intervalcount"  : safe_int(row[15]),
            "lstime"         : lstime_val,
        }

        # Parse INT001-INT100
        for i, col in enumerate(int_cols):
            idx = 16 + i
            vals[col] = safe_decimal(row[idx]) if idx < len(row) else None

        async with conn.cursor() as cur:
            await cur.execute(f"""
                SELECT id FROM {table}
                WHERE {uid_col} = %s
                AND oper_date = %s AND settlement_run = %s
            """, (vals[uid_col], vals["oper_date"], vals["settlement_run"]))
            exists = await cur.fetchone()

            # Build column list dynamically
            all_cols = (
                ["oper_date", "settlement_run", uid_col, hdr_uid_col,
                 "starttime", "stoptime", "uidstatementsched", "calcgroup",
                 "spi", "uomcode", "dstparticipant", "origin",
                 "chnlcuttimestamp", "tzstdname", "total", "maximum",
                 "minimum", "intervalcount"] +
                int_cols +
                ["lstime"]
            )

            if exists:
                set_clause = ", ".join([f"{c}=%({c})s" for c in all_cols
                                        if c not in [uid_col, "oper_date", "settlement_run"]])
                await cur.execute(f"""
                    UPDATE {table} SET {set_clause}
                    WHERE {uid_col}=%({uid_col})s
                    AND oper_date=%(oper_date)s
                    AND settlement_run=%(settlement_run)s
                """, vals)
                updated += 1
            else:
                col_str = ", ".join(all_cols)
                val_str = ", ".join([f"%({c})s" for c in all_cols])
                await cur.execute(f"""
                    INSERT INTO {table} ({col_str}) VALUES ({val_str})
                """, vals)
                inserted += 1

    await conn.commit()
    return inserted, updated


async def load_llsoutputheader(rows, meta, conn):
    """Load LLSOUTPUTHEADER rows"""
    inserted = updated = 0

    for row in rows:
        if len(row) < 13:
            continue

        vals = {
            "oper_date"          : meta["oper_date"],
            "settlement_run"     : meta["settlement_run"],
            "duns_number"        : meta["duns"],
            "uidllsoutputheader" : safe_int(row[0]),
            "uidbilldeterminant" : safe_int(row[1]),
            "qsecode"            : safe_str(row[2]),
            "repcode"            : safe_str(row[3]),
            "uidsetlpoint"       : safe_int(row[4]),
            "ufezonecode"        : safe_str(row[5]),
            "profilecode"        : safe_str(row[6]),
            "losscode"           : safe_str(row[7]),
            "tdspcode"           : safe_str(row[8]),
            "method"             : safe_str(row[9]),
            "lstime"             : parse_date(row[10]),
            "saverecorder"       : safe_str(row[11]),
            "savechannel"        : safe_int(row[12]) if len(row) > 12 else None,
        }

        async with conn.cursor() as cur:
            await cur.execute("""
                SELECT id FROM ercot_llsoutputheader
                WHERE uidllsoutputheader = %s
                AND oper_date = %s AND settlement_run = %s
            """, (vals["uidllsoutputheader"], vals["oper_date"], vals["settlement_run"]))
            exists = await cur.fetchone()

            if exists:
                await cur.execute("""
                    UPDATE ercot_llsoutputheader SET
                        uidbilldeterminant=%(uidbilldeterminant)s,
                        qsecode=%(qsecode)s, repcode=%(repcode)s,
                        uidsetlpoint=%(uidsetlpoint)s,
                        ufezonecode=%(ufezonecode)s, profilecode=%(profilecode)s,
                        losscode=%(losscode)s, tdspcode=%(tdspcode)s,
                        method=%(method)s, lstime=%(lstime)s,
                        saverecorder=%(saverecorder)s, savechannel=%(savechannel)s,
                        duns_number=%(duns_number)s
                    WHERE uidllsoutputheader=%(uidllsoutputheader)s
                    AND oper_date=%(oper_date)s
                    AND settlement_run=%(settlement_run)s
                """, vals)
                updated += 1
            else:
                await cur.execute("""
                    INSERT INTO ercot_llsoutputheader (
                        oper_date, settlement_run, duns_number,
                        uidllsoutputheader, uidbilldeterminant,
                        qsecode, repcode, uidsetlpoint, ufezonecode,
                        profilecode, losscode, tdspcode, method,
                        lstime, saverecorder, savechannel
                    ) VALUES (
                        %(oper_date)s, %(settlement_run)s, %(duns_number)s,
                        %(uidllsoutputheader)s, %(uidbilldeterminant)s,
                        %(qsecode)s, %(repcode)s, %(uidsetlpoint)s,
                        %(ufezonecode)s, %(profilecode)s, %(losscode)s,
                        %(tdspcode)s, %(method)s, %(lstime)s,
                        %(saverecorder)s, %(savechannel)s
                    )
                """, vals)
                inserted += 1

    await conn.commit()
    return inserted, updated


async def process_zip(zip_path):
    """Main function — process one ZIP file"""
    print(f"\n{'='*65}")
    print(f"  Processing: {os.path.basename(zip_path)}")
    print(f"{'='*65}")

    conn = await aiomysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        db=DB_NAME, autocommit=False,
        connect_timeout=30
    )

    results = {}

    with zipfile.ZipFile(zip_path, 'r') as zf:
        for name in zf.namelist():
            meta = parse_filename(name)
            if not meta:
                print(f"  ⚠️  Skipping unrecognized file: {name}")
                continue

            print(f"\n  📂 {meta['file_type']} | {meta['oper_date']} | {meta['settlement_run']}")

            # Read CSV
            with zf.open(name) as f:
                content = f.read().decode('utf-8', errors='replace')
                rows = list(csv.reader(io.StringIO(content)))

            print(f"     Rows: {len(rows)}")

            file_type = meta["file_type"].upper()

            if file_type == "DAIOUTPUTHEADER":
                ins, upd = await load_daioutputheader(rows, meta, conn)
                results["dai_header"] = {"inserted": ins, "updated": upd, "total": len(rows)}
                print(f"     ✅ Inserted: {ins} | Updated: {upd}")

            elif file_type == "DAIOUTPUTINTERVAL":
                ins, upd = await load_interval_table(
                    rows, meta, conn,
                    "ercot_daioutputinterval",
                    "uiddaioutputinterval",
                    "uiddaioutputheader"
                )
                results["dai_interval"] = {"inserted": ins, "updated": upd, "total": len(rows)}
                print(f"     ✅ Inserted: {ins} | Updated: {upd}")

            elif file_type == "LLSOUTPUTHEADER":
                ins, upd = await load_llsoutputheader(rows, meta, conn)
                results["lls_header"] = {"inserted": ins, "updated": upd, "total": len(rows)}
                print(f"     ✅ Inserted: {ins} | Updated: {upd}")

            elif file_type == "LLSOUTPUTINTERVAL":
                ins, upd = await load_interval_table(
                    rows, meta, conn,
                    "ercot_llsoutputinterval",
                    "uidllsoutputinterval",
                    "uidllsoutputheader"
                )
                results["lls_interval"] = {"inserted": ins, "updated": upd, "total": len(rows)}
                print(f"     ✅ Inserted: {ins} | Updated: {upd}")

            else:
                print(f"     ℹ️  Skipping {file_type} (DAM/RTM — not needed for load)")

    conn.close()

    print(f"\n  Summary:")
    for k, v in results.items():
        print(f"    {k:20} → {v['total']} rows | {v['inserted']} inserted | {v['updated']} updated")
    print(f"{'='*65}\n")

    return results


async def process_folder(folder_path):
    """Process all ZIP files in a folder"""
    zips = [f for f in os.listdir(folder_path) if f.endswith('.zip')]
    zips.sort()  # Process in date order

    print(f"Found {len(zips)} ZIP files in {folder_path}")

    for i, zf in enumerate(zips, 1):
        print(f"\n[{i}/{len(zips)}]")
        await process_zip(os.path.join(folder_path, zf))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Single file : python ingest_ercot_settlement.py <zip_file>")
        print("  Folder      : python ingest_ercot_settlement.py <folder_path>")
        sys.exit(1)

    path = sys.argv[1]

    if os.path.isdir(path):
        asyncio.run(process_folder(path))
    elif os.path.isfile(path):
        asyncio.run(process_zip(path))
    else:
        print(f"Error: {path} not found")
        sys.exit(1)
