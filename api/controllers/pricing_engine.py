import pandas as pd
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from dateutil.relativedelta import relativedelta
from datetime import date

import pandas as pd
import io
from fastapi.responses import StreamingResponse


async def calculate_matrix_for_start_date(
    start_date, terms, db, price_type, prior_day=False
):
    def get_sweetspot_terms(start_date: str) -> list[int]:
        start = date.fromisoformat(start_date)
        sweetspots = []
        for t in range(9, 61):
            end_month = (start.month + t + 1) % 12 - 1
            if end_month == -1:
                end_month = 11
            if end_month == 5:
                sweetspots.append(t)
        return sweetspots

    print("terms received in matrix:", terms)
    if "sweetspot" in price_type:
        terms = get_sweetspot_terms(start_date)
        print("sweetspot terms:", terms)

    # 1. Fetch Mappings and convert to a list of DICTS (Avoids AttributeErrors)
    mappings_res = await db.execute(text("SELECT * FROM ref_profile_mappings"))
    # .mappings() allows us to access columns by string names safely
    mappings = [dict(row) for row in mappings_res.mappings()]

    # 2. Bridge Pandas and AsyncSession
    def fetch_sync_data(sync_conn):
        max_term = max(terms)
        t_tdsp = "prior_tdsp" if prior_day else "tdsp"
        t_txu = "prior_txu" if prior_day else "txu"
        t_margin = "prior_margin" if prior_day else "margin"
        t_hr = "prior_heat_rates" if prior_day else "heat_rates"
        t_gas = "prior_gas_strip" if prior_day else "gas_strip"
        t_cons = "prior_consumption" if prior_day else "consumption"

        tdsp_df = pd.read_sql_query(f"SELECT profile, value FROM {t_tdsp}", sync_conn)
        supp_df = pd.read_sql_query(f"SELECT profile, value FROM {t_txu}", sync_conn)
        margin_df = pd.read_sql_query(f"SELECT * FROM {t_margin}", sync_conn)

        hr_raw = pd.read_sql_query(
            f"SELECT * FROM {t_hr} WHERE market_date >= '{start_date}' ORDER BY market_date ASC",
            sync_conn,
        )
        hr_wide = hr_raw.pivot(
            index="market_date", columns="profile_name", values="value"
        )

        gas_df = pd.read_sql_query(f"SELECT date, value FROM {t_gas}", sync_conn)
        gas_df["date"] = pd.to_datetime(gas_df["date"]).dt.date
        gas_df = gas_df.set_index("date")
        hr_wide["gas_price"] = gas_df["value"]
        market_sliced = hr_wide.iloc[:max_term].reset_index(drop=True)

        cons_raw = pd.read_sql_query(
            f"SELECT * FROM {t_cons} WHERE date >= '{start_date}' ORDER BY date ASC",
            sync_conn,
        )
        cons_sliced = cons_raw.iloc[:max_term].reset_index(drop=True)

        return {
            "tdsp": tdsp_df.set_index("profile"),
            "supp": supp_df.set_index("profile"),
            "market": market_sliced,
            "cons": cons_sliced,
            "margin": margin_df,
        }

    async_conn = await db.connection()
    dfs = await async_conn.run_sync(fetch_sync_data)

    tdsp_data = dfs["tdsp"]
    supp_data = dfs["supp"]
    market = dfs["market"]
    cons = dfs["cons"]
    margin_df = dfs["margin"]

    zones = ["South", "Coast", "North", "West"]
    zone_display = {
        "South": "South",
        "Coast": "CenterPoint",
        "North": "North",
        "West": "West",
    }

    results = []
    if "residential" in price_type:
        lfs = ["Residential"]
    elif price_type == "all":
        lfs = ["Low", "Medium", "High", "Residential"]
    else:
        lfs = ["Low", "Medium", "High"]

    for zone in zones:
        row = {"zone": zone}
        for lf in lfs:
            # 1. Find the mapping for this Zone + Load Factor
            match = [
                item
                for item in mappings
                if str(item.get("zone")).strip().lower() == zone.lower()
                and str(item.get("load_factor_type")).strip().lower() == lf.lower()
            ]

            if not match:
                for t in terms:
                    row[f"{lf}_{t}"] = "N/A"
                continue

            # 2. Define 'm' here so it's available for the rest of the logic
            m = match[0]
            print(f"zone={zone} lf={lf} match_count={len(match)}")
            for item in mappings:
                if str(item.get("zone")).strip().lower() == zone.lower():
                    print(
                        f"  found zone match: {item.get('zone')} lf={item.get('load_factor_type')}"
                    )
            # 3. Pull the specific column names from the mapping row
            hr_col = m.get("ercot_hr_header")
            c_col = m.get("consumption_profile")
            p_key = m.get("profile_key")
            cp_code = m.get("custom_profile_code")  # ← add this

            for t in terms:
                try:
                    # 4. Slice the dataframes for the specific term duration
                    # market = Heat Rates | cons = Consumption
                    m_slice = market.iloc[:t].reset_index(drop=True)
                    c_slice = cons.iloc[:t].reset_index(drop=True)
                    if len(m_slice) < t:
                        row[f"{lf}_{t}"] = "N/A"
                        continue

                    # 5. THE CALCULATION
                    # (Heat Rate * Gas Price * Consumption) / Total Consumption
                    # Ensure we are pulling the specific columns [hr_col] and [c_col]
                    numerator = (
                        m_slice[hr_col] * m_slice["gas_price"] * c_slice[c_col]
                    ).sum()
                    denominator = c_slice[c_col].sum()

                    energy_cost = numerator / denominator if denominator > 0 else 0
                    if energy_cost == 0:
                        print(
                            f"Zero energy for {zone} {lf} t={t} — m_slice rows={len(m_slice)} c_slice rows={len(c_slice)}"
                        )
                        row[f"{lf}_{t}"] = "N/A"
                        continue

                    # 6. Add-ons (Margin, TDSP, Supplier) using the profile_key
                    marg_row = margin_df[margin_df["term"] == t]
                    marg_val = (
                        marg_row[cp_code].values[0]
                        if (not marg_row.empty and cp_code in marg_row.columns)
                        else 0
                    )
                    print(
                        f"margin check: cp_code={cp_code} t={t} marg_val={marg_val} marg_row_empty={marg_row.empty}"
                    )

                    t_charge = (
                        tdsp_data.loc[cp_code, "value"]
                        if cp_code in tdsp_data.index
                        else 0
                    )
                    s_charge = (
                        supp_data.loc[cp_code, "value"]
                        if cp_code in supp_data.index
                        else 0
                    )

                    # Final result for the Matrix cell (Cents/kWh)
                    row[f"{lf}_{t}"] = float(
                        round((energy_cost + marg_val + t_charge + s_charge) / 10, 2)
                    )

                except Exception as e:
                    # If a specific column is missing or math fails, log it and keep going
                    print(f"Math Error for {p_key} at {t}mo: {e}")
                    row[f"{lf}_{t}"] = 0.00

        results.append(row)

    if price_type in ["sweetspot_commercial", "sweetspot_residential"]:
        return {"terms": terms, "matrix": results}
    return results


async def generate_excel_matrix(
    start_date: str, terms: list, num_months: int, price_type: str, db: AsyncSession
):
    is_residential = "residential" in price_type.lower()

    if is_residential:
        configs = [
            ("residential", "Residential Strip"),
            ("sweetspot_residential", "SweetSpot Residential"),
        ]
        load_factors = ["Residential"]
    else:
        configs = [
            ("commercial", "Regular Strip"),
            ("sweetspot_commercial", "SweetSpot Strip"),
        ]
        load_factors = ["Low", "Medium", "High"]

    output = io.BytesIO()
    today_str = date.today().strftime("%m/%d/%Y")

    with pd.ExcelWriter(output, engine="xlsxwriter") as writer:
        workbook = writer.book

        # --- Formats ---
        company_fmt = workbook.add_format(
            {
                "bold": True,
                "font_size": 16,
                "font_color": "#EF4444",
                "bg_color": "#0F172A",
                "valign": "vcenter",
            }
        )
        date_fmt = workbook.add_format(
            {"italic": True, "font_color": "#94A3B8", "bg_color": "#0F172A"}
        )
        month_header_fmt = workbook.add_format(
            {
                "bold": True,
                "font_size": 11,
                "font_color": "#FFFFFF",
                "bg_color": "#DC2626",
                "border": 1,
                "valign": "vcenter",
            }
        )
        lf_header_fmt = workbook.add_format(
            {
                "bold": True,
                "font_color": "#1E293B",
                "bg_color": "#F1F5F9",
                "border": 1,
                "align": "center",
                "valign": "vcenter",
            }
        )
        term_header_fmt = workbook.add_format(
            {
                "bold": True,
                "font_color": "#475569",
                "bg_color": "#F8FAFC",
                "border": 1,
                "align": "center",
                "underline": True,
            }
        )
        zone_fmt = workbook.add_format(
            {"bold": True, "font_color": "#1E293B", "bg_color": "#F8FAFC", "border": 1}
        )
        num_fmt = workbook.add_format(
            {
                "num_format": "0.00",
                "border": 1,
                "align": "center",
                "font_color": "#475569",
            }
        )
        na_fmt = workbook.add_format(
            {"align": "center", "font_color": "#94A3B8", "border": 1, "italic": True}
        )
        red_bar_fmt = workbook.add_format({"bg_color": "#DC2626"})

        for p_type, sheet_name in configs:
            worksheet = workbook.add_worksheet(sheet_name)
            worksheet.set_tab_color("#DC2626")

            # Company header rows
            worksheet.set_row(0, 30)
            worksheet.set_row(1, 20)
            worksheet.merge_range(0, 0, 0, 10, "AMERIPOWER ENERGY", company_fmt)
            worksheet.merge_range(1, 0, 1, 10, f"Report Date: {today_str}", date_fmt)

            current_row = 3
            base_date = date.fromisoformat(start_date)

            for i in range(num_months):
                target_date = base_date + relativedelta(months=i)
                target_date_str = target_date.strftime("%Y-%m-%d")

                result = await calculate_matrix_for_start_date(
                    target_date_str, terms, db, p_type
                )
                matrix = result["matrix"] if isinstance(result, dict) else result
                actual_terms = result["terms"] if isinstance(result, dict) else terms

                total_cols = len(load_factors) * len(actual_terms)

                # Month header - merged across all columns
                worksheet.set_row(current_row, 20)
                worksheet.merge_range(
                    current_row,
                    0,
                    current_row,
                    total_cols,
                    f"START MONTH: {target_date.strftime('%b %Y')}",
                    month_header_fmt,
                )
                current_row += 1

                # Load factor group headers - merged per group
                worksheet.write(current_row, 0, "", lf_header_fmt)
                col = 1
                for lf in load_factors:
                    if len(actual_terms) > 1:
                        worksheet.merge_range(
                            current_row,
                            col,
                            current_row,
                            col + len(actual_terms) - 1,
                            f"{lf} Load Factor",
                            lf_header_fmt,
                        )
                    else:
                        worksheet.write(
                            current_row, col, f"{lf} Load Factor", lf_header_fmt
                        )
                    col += len(actual_terms)
                current_row += 1

                # Term sub-headers
                worksheet.write(current_row, 0, "Zone", term_header_fmt)
                col = 1
                for lf in load_factors:
                    for t in actual_terms:
                        worksheet.write(current_row, col, f"{t}mo", term_header_fmt)
                        col += 1
                current_row += 1

                # Data rows
                for row_data in matrix:
                    zone_display = {"Coast": "CenterPoint"}.get(
                        row_data.get("zone", ""), row_data.get("zone", "")
                    )
                    worksheet.write(current_row, 0, zone_display, zone_fmt)
                    col = 1
                    for lf in load_factors:
                        for t in actual_terms:
                            val = row_data.get(f"{lf}_{t}")
                            if val is not None and val != "N/A":
                                try:
                                    worksheet.write_number(
                                        current_row, col, float(val), num_fmt
                                    )
                                except (ValueError, TypeError):
                                    worksheet.write(current_row, col, "N/A", na_fmt)
                            else:
                                worksheet.write(current_row, col, "N/A", na_fmt)
                            col += 1
                    current_row += 1

                # Red bottom bar
                worksheet.merge_range(
                    current_row, 0, current_row, total_cols, "", red_bar_fmt
                )
                current_row += 3

            # Column widths
            worksheet.set_column(0, 0, 18)
            worksheet.set_column(1, 50, 10)

    output.seek(0)
    return output
