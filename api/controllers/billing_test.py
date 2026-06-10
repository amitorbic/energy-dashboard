"""
1:1 Python conversion of billing_extract.php + billing_extract_result.php.

Processes the Excel file entirely in-memory (no DB writes).
Returns results in the same order as the PHP email body.

PHP sheet1 array positions (1-indexed columns matching PHP):
  [0]  col 3  cust_id
  [1]  col 6  company_name       (strip &',)
  [2]  col 7  cust_first_name    (strip &',)
  [3]  col 8  cust_last_name     (strip &',)
  [4]  col 12 plan_group
  [5]  col 14 bal_fwd_amount     (strip $,())
  [6]  col 15 curr_amount        (strip $,())
  [7]  col 16 tax_amount         (strip $,())
  [8]  col 18 pay_amount         (strip $,())
  [9]  col 19 due_amount         (strip $,())
  [10] col 20 energy_charge      (strip $,())
  [11] col 23 passthru_charge    (strip $,())
  [12] col 25 other_charge       (strip $,())
  [13] col 28 kh_qty
  [14] col 29 metered_usage
  [15] col 30
  [16] col 43 bill_handling_code
  [17] col 51 contract_type
  [18] col 64 premise_id
  [19] col 73 gros_tax_exempt
  [20] col 75 pugra_tax_exempt
  [21] col 77
  [22] col 80
  [23] col 45
  [24] col 9  bill_no
  [25] col 1  bill_to_id
  [26] col 2  cust_type
  [27] col 46 auto_pay_type      (extended — not in original PHP sheet1)
  [28] col 47 bill_mode          (extended — not in original PHP sheet1)
"""

import os
import re
import tempfile
from datetime import date, datetime, timedelta
from typing import Dict, List

import pandas as pd
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

_LETTERS  = re.compile(r'[$,()\s]')
_LETTERS1 = re.compile(r"[&',]")

# PHP valid meter fee values — rows NOT in this list are flagged as wrong
_VALID_METER_FEES = {7.99, 2.99, 5.0, 4.99, 5.99, 7.95, 9.99, 10.0, 0.0, 8.0, 4.95}

# PHP email body section order — drives the display in exception-test.tsx
PHP_EMAIL_ORDER = [
    {"key": "bills_summary",       "label": "Total Number of Bills"},
    {"key": "kh_qty_energy_zero",  "label": "KH Qty not zero and energy charge Zero"},
    {"key": "21",                  "label": "Tax amount is ZERO"},
    {"key": "1",                   "label": "KH Qty and metered usage does not match"},
    {"key": "2",                   "label": "GRT/PUC: pugra_tax_exempt == 100 (not both)"},
    {"key": "3",                   "label": "GRT/PUC: col77 == 100 (not both)"},
    {"key": "4",                   "label": "Residential: no 100 under PUC/GRT/City (both exempt)"},
    {"key": "22",                  "label": "Filter MCPE bills (LMP Day-Ahead)"},
    {"key": "5",                   "label": "LMP rate < 4¢/kWh"},
    {"key": "6",                   "label": "LMP rate > 8¢/kWh"},
    {"key": "sub_only_mode",       "label": "Sub Only accounts (bill_mode = SubOnly)"},
    {"key": "8",                   "label": "Residential price < 7.5¢/kWh"},
    {"key": "88",                  "label": "Residential price > 15¢/kWh"},
    {"key": "9",                   "label": "Commercial >= 13¢/kWh (energy / kh_qty)"},
    {"key": "10",                  "label": "Commercial < 3.6¢/kWh (energy / metered)"},
    {"key": "11",                  "label": "Negative or low total balance"},
    {"key": "133",                 "label": "Zero usage (kh_qty == 0)"},
    {"key": "15",                  "label": "Partial payment (pay / bal_fwd ≤ 75%)"},
    {"key": "13",                  "label": "Zero meter fee (other_charge == 0)"},
    {"key": "199",                 "label": "Final bill (bill_handling_code == 9999)"},
    {"key": "20",                  "label": "State tax 100 (col80 == 100)"},
    {"key": "7",                   "label": "Commercial TDSP < 30% of energy charge"},
    {"key": "autopay_balance",     "label": "Auto pay customer with balance (auto_pay_type 6 or C)"},
    {"key": "wrong_meter_fee",     "label": "Wrong meter fee (not in valid fee list)"},
    {"key": "555",                 "label": "Sub with no Master in extract"},
    {"key": "666",                 "label": "Standalone sharing company name with Master"},
]


# ── helpers ────────────────────────────────────────────────────────────────────

def _c(row: "pd.Series", n: int) -> str:
    try:
        v = str(row.iloc[n - 1])
        return '' if v in ('nan', 'None', 'NaN') else v.strip()
    except IndexError:
        return ''

def _cm(row: "pd.Series", n: int) -> str:
    return _LETTERS.sub('', _c(row, n))

def _cn(row: "pd.Series", n: int) -> str:
    return _LETTERS1.sub('', _c(row, n))

def _n(v) -> float:
    try:
        return float(v) if v not in ('', None) else 0.0
    except (ValueError, TypeError):
        return 0.0

def _build_sheet1(row: "pd.Series") -> list:
    return [
        _c(row, 3),    # [0]  cust_id
        _cn(row, 6),   # [1]  company_name
        _cn(row, 7),   # [2]  cust_first_name
        _cn(row, 8),   # [3]  cust_last_name
        _c(row, 12),   # [4]  plan_group
        _cm(row, 14),  # [5]  bal_fwd_amount
        _cm(row, 15),  # [6]  curr_amount
        _cm(row, 16),  # [7]  tax_amount
        _cm(row, 18),  # [8]  pay_amount
        _cm(row, 19),  # [9]  due_amount
        _cm(row, 20),  # [10] energy_charge
        _cm(row, 23),  # [11] passthru_charge
        _cm(row, 25),  # [12] other_charge
        _c(row, 28),   # [13] kh_qty
        _c(row, 29),   # [14] metered_usage
        _c(row, 30),   # [15] col30
        _c(row, 43),   # [16] bill_handling_code
        _c(row, 51),   # [17] contract_type
        _c(row, 64),   # [18] premise_id
        _c(row, 73),   # [19] gros_tax_exempt
        _c(row, 75),   # [20] pugra_tax_exempt
        _c(row, 77),   # [21] col77
        _c(row, 80),   # [22] col80
        _c(row, 45),   # [23] col45
        _c(row, 9),    # [24] bill_no
        _c(row, 1),    # [25] bill_to_id
        _c(row, 2),    # [26] cust_type
        _c(row, 46),   # [27] auto_pay_type  (extended)
        _c(row, 47),   # [28] bill_mode      (extended)
    ]

def _base(s: list) -> dict:
    return {
        "cust_id":         s[0],
        "bill_no":         s[24],
        "company_name":    s[1],
        "cust_first_name": s[2],
        "cust_last_name":  s[3],
    }


# ── main function ──────────────────────────────────────────────────────────────

async def run_php_checks(file: UploadFile, db: AsyncSession) -> dict:
    """
    Runs all PHP-equivalent checks in-memory and returns:
      {
        "order":   PHP_EMAIL_ORDER,          # list of {key, label} in email order
        "rows":    {status_key: [row, ...]}, # rows per check
        "summary": {master, sub, standalone, cost}
      }
    """
    suffix = os.path.splitext(file.filename)[1].lower()
    tmp_path = os.path.join(tempfile.gettempdir(), file.filename)
    with open(tmp_path, 'wb') as f:
        f.write(await file.read())

    engine = 'xlrd' if suffix == '.xls' else 'openpyxl'
    df = pd.read_excel(tmp_path, header=0, dtype=str, engine=engine)
    df = df.fillna('')

    sheet1: List[list] = [_build_sheet1(row) for _, row in df.iterrows()]

    rows: Dict[str, list] = {}

    def _flag(key: str, s: list, extra: dict = None):
        if key not in rows:
            rows[key] = []
        entry = _base(s)
        if extra:
            entry.update(extra)
        rows[key].append(entry)

    # ── Bills summary (PHP: count masters/subs/standalone, compute cost) ────────
    master_count = sub_count = blank_count = 0
    cost = 0.0
    for s in sheet1:
        cid   = s[0]
        ctype = s[26]
        bmode = s[28]
        if not cid or bmode == 'Email':
            continue
        if ctype == 'Master':
            master_count += 1
            cost += 15
        elif ctype == 'Sub':
            sub_count += 1
            cost += 4
        else:
            blank_count += 1
            cost += 15
    summary = {
        "master":     master_count,
        "sub":        sub_count,
        "standalone": blank_count,
        "cost":       round(cost / 100, 2),
    }

    # ── KH Qty not zero AND energy charge zero (direct raw query in PHP) ────────
    for s in sheet1:
        if _n(s[10]) == 0 and _n(s[13]) != 0:
            _flag('kh_qty_energy_zero', s, {"energy_charge": s[10], "kh_qty": s[13]})

    # ── Status 21: tax_amount == 0 ───────────────────────────────────────────────
    for s in sheet1:
        if _n(s[7]) == 0:
            _flag('21', s, {"tax_amount": s[7]})

    # ── Status 1: kh_qty != metered_usage ───────────────────────────────────────
    for s in sheet1:
        if s[13] != s[14]:
            _flag('1', s, {"kh_qty": s[13], "metered_usage": s[14]})

    # ── Status 2: pugra_tax_exempt==100 AND != col77 ────────────────────────────
    for s in sheet1:
        if _n(s[20]) == 100 and s[20] != s[21]:
            _flag('2', s, {"pugra_tax_exempt": s[20], "col77": s[21]})

    # ── Status 3: col77==100 AND != pugra_tax_exempt ────────────────────────────
    for s in sheet1:
        if _n(s[21]) == 100 and s[20] != s[21]:
            _flag('3', s, {"pugra_tax_exempt": s[20], "col77": s[21]})

    # ── Status 4: pugra_tax_exempt==100 AND col77==100 ──────────────────────────
    for s in sheet1:
        if _n(s[20]) == 100 and _n(s[21]) == 100:
            _flag('4', s, {"pugra_tax_exempt": s[20], "col77": s[21]})

    # ── Status 22: LMP Day-Ahead ─────────────────────────────────────────────────
    for s in sheet1:
        if s[17] == 'LMP Day-Ahead':
            _flag('22', s, {"contract_type": s[17]})

    # ── Status 5: LMP Day-Ahead, rate < 0.04 ────────────────────────────────────
    for s in sheet1:
        if s[17] == 'LMP Day-Ahead':
            m = _n(s[14])
            div = (_n(s[10]) / m) if m else 0.0
            if round(div, 4) < 0.0400:
                _flag('5', s, {"energy_charge": s[10], "metered_usage": s[14], "rate": round(div, 4)})

    # ── Status 6: LMP Day-Ahead, rate > 0.08 ────────────────────────────────────
    for s in sheet1:
        if s[17] == 'LMP Day-Ahead':
            m = _n(s[14])
            div1 = (_n(s[10]) / m) if m else 0.0
            if round(div1, 4) > 0.0800:
                _flag('6', s, {"energy_charge": s[10], "metered_usage": s[14], "rate": round(div1, 4)})

    # ── Sub Only mode: bill_mode == 'SubOnly' (PHP direct raw query) ─────────────
    for s in sheet1:
        if s[28] == 'SubOnly':
            _flag('sub_only_mode', s)

    # ── Status 8: R1 (energy+passthru)/metered < 0.075 ──────────────────────────
    for s in sheet1:
        if s[4] == 'R1':
            m = _n(s[14])
            cal = ((_n(s[10]) + _n(s[11])) / m) if m else 0.0
            if round(cal, 4) < 0.0750:
                _flag('8', s, {"energy_charge": s[10], "passthru_charge": s[11],
                               "metered_usage": s[14], "price": round(cal, 4)})

    # ── Status 88: R1 (energy+passthru)/metered > 0.15 ──────────────────────────
    for s in sheet1:
        if s[4] == 'R1':
            m = _n(s[14])
            cal = ((_n(s[10]) + _n(s[11])) / m) if m else 0.0
            if round(cal, 4) > 0.150:
                _flag('88', s, {"energy_charge": s[10], "passthru_charge": s[11],
                                "metered_usage": s[14], "price": round(cal, 4)})

    # ── Status 9: C1/C3 energy/kh_qty >= 0.13 ───────────────────────────────────
    for s in sheet1:
        if s[4] in ('C1', 'C3'):
            k = _n(s[13])
            if k and round(_n(s[10]) / k, 2) >= 0.130:
                _flag('9', s, {"energy_charge": s[10], "kh_qty": s[13],
                               "price": round(_n(s[10]) / k, 4)})

    # ── Status 10: C1/C3 energy/metered < 0.036 ─────────────────────────────────
    for s in sheet1:
        if s[4] in ('C1', 'C3'):
            m = _n(s[14])
            if m and round(_n(s[10]) / m, 5) < 0.036:
                _flag('10', s, {"energy_charge": s[10], "metered_usage": s[14],
                                "price": round(_n(s[10]) / m, 5)})

    # ── Status 11: curr + tax > due ──────────────────────────────────────────────
    for s in sheet1:
        cal3 = _n(s[6]) + _n(s[7])
        if round(cal3, 2) == _n(s[9]):
            continue
        if cal3 > _n(s[9]):
            _flag('11', s, {"curr_amount": s[6], "tax_amount": s[7],
                            "due_amount": s[9], "computed": round(cal3, 2)})

    # ── Status 133: kh_qty == 0 ──────────────────────────────────────────────────
    for s in sheet1:
        if _n(s[13]) == 0:
            _flag('133', s, {"kh_qty": s[13]})

    # ── Status 15: pay/bal_fwd 0 < ratio <= 0.75 ────────────────────────────────
    for s in sheet1:
        bal = _n(s[5])
        if not bal:
            continue
        cal5 = _n(s[8]) / bal
        if cal5 == 0:
            continue
        if 0 < round(cal5, 2) <= 0.75:
            _flag('15', s, {"pay_amount": s[8], "bal_fwd_amount": s[5],
                            "ratio": round(cal5, 2)})

    # ── Status 13: other_charge == 0 ────────────────────────────────────────────
    for s in sheet1:
        if _n(s[12]) == 0:
            _flag('13', s, {"other_charge": s[12]})

    # ── Status 199: bill_handling_code == 9999 ───────────────────────────────────
    for s in sheet1:
        if _n(s[16]) == 9999:
            _flag('199', s, {"bill_handling_code": s[16]})

    # ── Status 20: col80 == 100 ──────────────────────────────────────────────────
    for s in sheet1:
        if _n(s[22]) == 100:
            _flag('20', s, {"col80": s[22]})

    # ── Status 7: C1/C3 passthru < 30% of energy ────────────────────────────────
    for s in sheet1:
        if s[4] in ('C1', 'C3'):
            passthru = _n(s[11].lstrip('"'))
            energy   = _n(s[10].lstrip('"'))
            if passthru < energy * 0.3:
                _flag('7', s, {"energy_charge": s[10], "passthru_charge": s[11],
                               "30pct": round(energy * 0.3, 3)})

    # ── Auto pay balance: auto_pay_type in (6, C) AND bal_fwd != pay ─────────────
    # PHP: SELECT ... WHERE auto_pay_type='6' OR auto_pay_type='C'
    #      if($row['bal_fwd_amount'] != $row['pay_amount'])
    for s in sheet1:
        if s[27] in ('6', 'C'):
            if s[5] != s[8]:
                _flag('autopay_balance', s, {"auto_pay_type": s[27],
                                             "bal_fwd_amount": s[5],
                                             "pay_amount": s[8],
                                             "cust_type": s[26]})

    # ── Wrong meter fee: other_charge not in valid list ──────────────────────────
    # PHP: if($row['other_charge']==7.99 || ... ) continue; else flag
    for s in sheet1:
        try:
            val = float(s[12]) if s[12] not in ('', None) else 0.0
        except (ValueError, TypeError):
            val = None
        if val is None or val not in _VALID_METER_FEES:
            _flag('wrong_meter_fee', s, {"other_charge": s[12]})

    # ── Status 555: Sub with no Master cust_id in the file ───────────────────────
    master_cust_ids = {s[0] for s in sheet1 if s[26] == 'Master'}
    for s in sheet1:
        if s[26] == 'Sub' and s[25] not in master_cust_ids:
            _flag('555', s, {"bill_to_id": s[25], "cust_type": s[26]})

    # ── Status 666: standalone sharing company name with a Master ─────────────────
    master_names = {s[1] for s in sheet1 if s[26] == 'Master' and s[1]}
    for s in sheet1:
        if s[1] in master_names and s[26] == '' and s[1] != '':
            _flag('666', s, {"company_name": s[1]})

    os.remove(tmp_path)

    return {
        "order":   PHP_EMAIL_ORDER,
        "rows":    rows,
        "summary": summary,
    }


async def get_php_check_counts(file: UploadFile, db: AsyncSession) -> Dict[str, int]:
    result = await run_php_checks(file, db)
    return {k: len(v) for k, v in result["rows"].items()}
