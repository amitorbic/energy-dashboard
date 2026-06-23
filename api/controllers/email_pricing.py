import io
import os
from datetime import date
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from controllers.custom_pricing import calculate_custom_price
from controllers.pricing_engine import (
    calculate_matrix_for_start_date,
    generate_excel_matrix,
)
from utils.email import send_email, send_email_async
from utils.email_routing import get_tenant_display_name, filename_safe


def build_daily_matrix_html(
    matrix: list,
    terms: list,
    price_type: str,
    mills: float = 0,
    start_date: str = "",
    month_label: str = "",
    nodal_status: str = "Included",
) -> str:
    # Build ONE month's table block (matches your PHP structure)
    content = f"""
    <table width="750" border="0" align="center" cellpadding="0" cellspacing="0">
        <tr>
            <td align="left" valign="top">
                <table width="750" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                        <td style="color:#FF0000; font-size:12px; font-family:Arial;">
                            <strong>{month_label}</strong> <span style="color:#000; padding-left:5px;"><b>Start</b></span>
                        </td>
                    </tr>
                    <tr><td height="10" style="font-size:8px">&nbsp;</td></tr>
                    <tr>
                        <td align="left" valign="top">
                            <table width="750" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td width="90" align="left" valign="top">
                                        <table width="90" border="0" cellspacing="0" cellpadding="0">
                                            <tr><td align="left" style="color:#FF0000; font-size:13px; font-family:Arial; line-height:24px;">{date.today().strftime('%m/%d/%y')}</td></tr>
                                            <tr><td align="left" style="line-height:24px;">&nbsp;</td></tr>
                                            <tr><td align="left" style="color:#000; font-size:12px; font-family:Arial; line-height:24px;">South</td></tr>
                                            <tr><td align="left" style="color:#000; font-size:12px; font-family:Arial; line-height:24px;">CenterPoint</td></tr>
                                            <tr><td align="left" style="color:#000; font-size:12px; font-family:Arial; line-height:24px;">North</td></tr>
                                            <tr><td align="left" style="color:#000; font-size:12px; font-family:Arial; line-height:24px;">West</td></tr>
                                        </table>
                                    </td>
    """

    # Load Factor Columns: Low, Medium, High
    for lf in ["Low", "Medium", "High"]:
        content += f"""
        <td width="225" align="left" valign="top">
            <table width="225" border="0" cellspacing="0" cellpadding="0">
                <tr>
                    <td colspan="5" align="center" style="color:#000; font-size:12px; font-family:Arial; font-weight:bold; border-bottom:solid 1px #000; line-height:24px;">
                        {lf} Load Factor
                    </td>
                </tr>
                <tr>"""

        # Terms Headers (Matches PHP explode and counter)
        for t in terms[:4]:
            content += f'<td align="center" style="color:#000; font-size:12px; font-family:Arial; text-decoration:underline; font-weight:bold; line-height:24px;">{t}</td>'

        content += "</tr>"

        # Pricing Rows for each Zone
        # Matches PHP foreach ($month[$i] as $quotes)
        zones = [
            "South",
            "Coast",
            "North",
            "West",
        ]  # 'Coast' maps to 'CenterPoint' display
        for zone_key in zones:
            content += "<tr>"
            # Look up the specific row in your matrix data
            row = next((r for r in matrix if r["zone"] == zone_key), {})
            for t in terms[:4]:
                val = row.get(f"{lf}_{t}")
                if val and val != "N/A":
                    # Replicates number_format($quot, 2, '.', '')
                    quot = f"{float(val) + mills:.2f}"
                else:
                    quot = "N/A"
                content += f'<td align="center" style="color:#000; font-size:12px; font-family:Arial; line-height:24px;">{quot}</td>'
            content += "</tr>"

        content += "</table></td>"

    # Close the nested tables and add the red separator bar
    content += """
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr><td height="8" bgcolor="#FF0000" style="font-size:8px;">&nbsp;</td></tr>
                            <tr><td height="25">&nbsp;</td></tr>
                        </table>
                    </td>
                </tr>
            </table>"""

    return content


def build_email_html(quote_for: str, content_html: str) -> str:
    """Wraps the matrix content in the final branding/logo template."""
    today = date.today().strftime("%m/%d/%Y")
    return f"""
    <html><body style='font-family:Arial,sans-serif;color:#333'>
        <table width='100%' style='max-width:800px;margin:auto'>
            <tr>
                <td style='padding:20px 0'>
                    <img src='https://ameripowerpricing.com/images/AmeriPower%20new_logo.jpg' style='height:60px' alt='AmeriPower'/>
                </td>
                <td style='text-align:right;font-size:18px;font-weight:bold;color:#DC2626'>Energy Rate Quote</td>
            </tr>
            <tr>
                <td colspan='2' style='padding:10px 0;border-bottom:2px solid #DC2626'>
                    <strong>Quote For:</strong> {quote_for} &nbsp;&nbsp;&nbsp; <strong>Date:</strong> {today}
                </td>
            </tr>
            <tr><td colspan='2'>{content_html}</td></tr>
        </table>
    </body></html>
    """




async def send_daily_pricing_email(
    broker_ids: list,
    start_date: str,
    terms: list,
    price_type: str,
    num_months: int,
    db: AsyncSession,
) -> dict:
    from dateutil.relativedelta import relativedelta
    from utils.email_routing import get_tenant_email

    get_tenant_email("pricing")  # fail fast before touching any brokers

    results = {"sent": [], "failed": []}

    placeholders = ",".join([f":id{i}" for i in range(len(broker_ids))])
    params = {f"id{i}": bid for i, bid in enumerate(broker_ids)}
    brokers_res = await db.execute(
        text(f"SELECT * FROM broker_new WHERE sid IN ({placeholders})"), params
    )
    brokers = [dict(row) for row in brokers_res.mappings()]

    # Pre-calculate all months matrix once
    base = date.fromisoformat(start_date)
    months_data = []
    for i in range(num_months):
        target = base + relativedelta(months=i)
        target_str = target.strftime("%Y-%m-%d")
        label = target.strftime("%b-%y")
        matrix_result = await calculate_matrix_for_start_date(
            target_str, terms, db, price_type
        )
        matrix = (
            matrix_result.get("matrix", matrix_result)
            if isinstance(matrix_result, dict)
            else matrix_result
        )
        actual_terms = (
            matrix_result.get("terms", terms)
            if isinstance(matrix_result, dict)
            else terms
        )
        months_data.append(
            {
                "label": label,
                "start_date": target_str,
                "matrix": matrix,
                "terms": actual_terms,
            }
        )

    for broker in brokers:
        try:
            mills = float(broker.get("mills1") or 0)

            # Build combined HTML for all months
            all_months_html = ""
            nodal_text = "NODAL AND RUC CHARGES INCLUDED"  # You can make this dynamic based on post data
            all_months_html += f"""
                 <table width="765" border="0" align="center" cellpadding="0" cellspacing="0">
                     <tr>
                         <td align="left" valign="top" style="color:#17365D; font-weight:bold; padding-bottom:20px; font-family:Arial; font-size:13px;">{nodal_text}</td>
                     </tr>
                 </table>
                   """
            for month in months_data:
                all_months_html += build_daily_matrix_html(
                    month["matrix"],
                    month["terms"],
                    price_type,
                    mills,
                    month["start_date"],
                    month["label"],
                )

            # Add nodal note
            all_months_html += "<p style='font-size:11px;margin-top:10px'>Refer to the spreadsheet for additional pricing terms</p>"

            html = build_email_html(broker["company_name"], all_months_html)
            subject = f"Pricing from {get_tenant_display_name()} - {broker['company_name']}"

            # Generate Excel
            excel_stream = await generate_excel_matrix(
                start_date, terms, num_months, price_type, db
            )
            excel_bytes = excel_stream.read()
            _co = filename_safe(get_tenant_display_name())
            filename = f"{_co}_Matrix_{date.today().isoformat()}.xlsx"

            # Send to all active daily pricing emails
            sent_to = []
            for n in range(1, 6):
                email = broker.get(f"daily_pricing_email{n}")
                flag = broker.get(f"daily_pricing_flag{n}")
                if email and (flag == 1 or flag == "1"):
                    await send_email_async(
                        email, subject, html,
                        purpose="pricing",
                        attachment=excel_bytes,
                        attachment_name=filename,
                    )
                    sent_to.append(email)

            if sent_to:
                for email in sent_to:
                    await db.execute(
                        text(
                            """
                        INSERT INTO broker_logs (broker_code, company_name, email_type, sent_to, status)
                        VALUES (:broker_code, :company_name, :email_type, :sent_to, :status)
                    """
                        ),
                        {
                            "broker_code": broker["broker_code"],
                            "company_name": broker["company_name"],
                            "email_type": f"daily_{price_type}",
                            "sent_to": ", ".join(sent_to),
                            "status": "sent",
                        },
                    )
                results["sent"].append(broker["company_name"])
            else:
                results["failed"].append(
                    f"{broker['company_name']} — no active email flags"
                )

        except Exception as e:
            import traceback

            print(f"Email failed for {broker.get('company_name')}: {e}")
            print(traceback.format_exc())
            results["failed"].append(f"{broker['company_name']} — {str(e)}")

    await db.commit()
    return results


async def send_custom_pricing_email(
    broker_ids: list, terms: list, db: AsyncSession
) -> dict:
    import json
    from datetime import date, datetime
    from routers.msp import calculate_msp, MspCalcRequest, MspGroup
    from utils.email_routing import get_tenant_email

    get_tenant_email("pricing")  # fail fast before touching any brokers

    results = {"sent": [], "failed": []}

    placeholders = ",".join([f":id{i}" for i in range(len(broker_ids))])
    params = {f"id{i}": bid for i, bid in enumerate(broker_ids)}
    brokers_res = await db.execute(
        text(f"SELECT * FROM broker_new WHERE sid IN ({placeholders})"), params
    )
    brokers = [dict(row) for row in brokers_res.mappings()]

    for broker in brokers:
        try:
            if not broker.get("pricing_email") or not (
                broker.get("pricing_flag") == 1 or broker.get("pricing_flag") == "1"
            ):
                results["failed"].append(
                    f"{broker['company_name']} — pricing email not active"
                )
                continue

            customers_res = await db.execute(
                text(
                    "SELECT * FROM customers_new WHERE broker_code = :bc AND status = 1"
                ),
                {"bc": broker["broker_code"]},
            )
            customers = [dict(row) for row in customers_res.mappings()]

            content_html = ""

            # ── Custom pricing blocks ─────────────────────────────────
            for customer in customers:
                start_date = customer.get("contract_start_date") or customer.get(
                    "pricing_start_date"
                )
                if not start_date or start_date == "0000-00-00":
                    continue

                usage_res = await db.execute(
                    text(
                        """
                        SELECT profile_key, SUM(total_kwh) as total_kwh
                        FROM customer_usage WHERE customer_id = :id
                        GROUP BY profile_key
                    """
                    ),
                    {"id": customer["id"]},
                )
                profiles = {
                    row.profile_key: float(row.total_kwh) for row in usage_res.all()
                }

                if not profiles:
                    continue

                pricing = await calculate_custom_price(
                    customer["id"], str(start_date), terms, profiles, db
                )

                term_headers = "".join(
                    [
                        f"<th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>{p['term']}</th>"
                        for p in pricing
                    ]
                )
                price_cells = "".join(
                    [
                        f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{p['custom_price'] if p['custom_price'] else 'N/A'}</td>"
                        for p in pricing
                    ]
                )
                nodal_text = (
                    "NODAL AND RUC CHARGES INCLUDED"
                    if customer.get("nodal") == "Included"
                    else "NODAL AND RUC CHARGES EXCLUDED"
                )

                content_html += f"""
                <table style='border-collapse:collapse;width:100%;margin-bottom:20px;font-size:12px'>
                    <thead><tr>
                        <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Company Name</th>
                        <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Start Month</th>
                        <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Number of ESIIDs</th>
                        <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Broker Mills</th>
                        <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Credit Status</th>
                        {term_headers}
                    </tr></thead>
                    <tbody><tr>
                        <td style='padding:6px 10px;border:1px solid #ddd;font-weight:bold'>{customer['company_name']}</td>
                        <td style='padding:6px 10px;border:1px solid #ddd'>{start_date}</td>
                        <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{customer.get('num_esids', 1)}</td>
                        <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{customer.get('mills', 0)}</td>
                        <td style='padding:6px 10px;border:1px solid #ddd'>{customer.get('credit_status', 'Pending')}</td>
                        {price_cells}
                    </tr></tbody>
                </table>
                <p style='font-size:11px;color:#666'>{nodal_text}</p>
                """

            # ── B&E section ───────────────────────────────────────────
            bne_res = await db.execute(
                text(
                    "SELECT * FROM bne_log WHERE broker_code = :bc ORDER BY updated_at DESC"
                ),
                {"bc": broker["broker_code"]},
            )
            bne_records = [dict(r) for r in bne_res.mappings().all()]

            if bne_records:
                content_html += """
                <p style='font-size:13px;font-weight:bold;color:#333;margin:20px 0 8px;
                          border-top:1px solid #ddd;padding-top:12px'>
                    Blend &amp; Extend Pricing
                </p>
                <p style='font-size:12px;font-weight:bold;color:#333;margin-bottom:8px'>
                    B&amp;E Term / Total Contracted Months
                </p>
                """
                for rec in bne_records:
                    try:
                        bne_profiles = json.loads(rec["profiles"] or "{}")
                        ext_terms = [
                            int(t.strip())
                            for t in (rec["extension_terms"] or "6,12,18,24").split(",")
                        ]
                        bne_start = str(rec.get("start_date") or "")

                        calc = await calculate_custom_price(
                            customer_id=0,
                            start_date=bne_start,
                            terms=ext_terms,
                            profiles=bne_profiles,
                            db=db,
                        )

                        terms_left_str = rec.get("terms_left") or ""
                        rem_months = 0
                        for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
                            try:
                                end = datetime.strptime(
                                    terms_left_str.strip(), fmt
                                ).date()
                                rem_months = max(
                                    0, round((end - date.today()).days / 30.44)
                                )
                                break
                            except Exception:
                                pass

                        bne_term_headers = "".join(
                            [
                                f"<th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333;font-size:12px'>{t}/{t+rem_months}</th>"
                                for t in ext_terms
                            ]
                        )

                        bne_price_cells = ""
                        for t, mr in zip(
                            ext_terms, calc if isinstance(calc, list) else []
                        ):
                            new_rate = mr.get("custom_price") if mr else None
                            if new_rate and rem_months > 0:
                                ann_vol = sum(bne_profiles.values())
                                rem_vol = (rem_months / 12) * ann_vol
                                ext_vol = (t / 12) * ann_vol
                                total_vol = rem_vol + ext_vol
                                old_rate = float(rec.get("current_rate") or 0)
                                blended = (
                                    round(
                                        (old_rate * rem_vol + new_rate * ext_vol)
                                        / total_vol,
                                        4,
                                    )
                                    if total_vol
                                    else None
                                )
                            else:
                                blended = None
                            bne_price_cells += f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:center;font-size:12px'>{blended if blended else 'N/A'}</td>"

                        content_html += f"""
                        <table style='border-collapse:collapse;width:100%;margin-bottom:12px;font-size:12px'>
                            <thead><tr>
                                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Company Name</th>
                                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Term Left</th>
                                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Broker Mills</th>
                                {bne_term_headers}
                            </tr></thead>
                            <tbody><tr>
                                <td style='padding:6px 10px;border:1px solid #ddd;font-weight:bold'>{rec['customer_name']}</td>
                                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{rem_months}</td>
                                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{rec.get('broker_mill') or ''}</td>
                                {bne_price_cells}
                            </tr></tbody>
                        </table>"""
                    except Exception as e:
                        print(f"BNE email block failed for sid={rec.get('sid')}: {e}")

            # ── MSP section ───────────────────────────────────────────
            msp_res = await db.execute(
                text(
                    "SELECT * FROM msp_log WHERE broker_code = :bc ORDER BY updated_at DESC"
                ),
                {"bc": broker["broker_code"]},
            )
            msp_records = [dict(r) for r in msp_res.mappings().all()]

            if msp_records:
                content_html += """
                <p style='font-size:13px;font-weight:bold;color:#333;margin:20px 0 8px;
                          border-top:1px solid #ddd;padding-top:12px'>
                    Multiple Start Pricing
                </p>
                """
                for rec in msp_records:
                    try:
                        groups_data = json.loads(rec["groups"] or "[]")
                        end_month = int(rec["terms"] or "5")
                        groups = [MspGroup(**g) for g in groups_data]
                        calc = await calculate_msp(
                            MspCalcRequest(groups=groups, end_month=end_month), db
                        )

                        msp_end_headers = "".join(
                            [
                                f"<th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333;font-size:12px'>{ed['end_date']}</th>"
                                for ed in calc["end_dates"]
                            ]
                        )
                        msp_price_cells = "".join(
                            [
                                f"<td style='padding:6px 10px;border:1px solid #ddd;text-align:center;font-size:12px'>{ed['final_price'] if ed['final_price'] else 'N/A'}</td>"
                                for ed in calc["end_dates"]
                            ]
                        )

                        content_html += f"""
                        <table style='border-collapse:collapse;width:100%;margin-bottom:12px;font-size:12px'>
                            <thead><tr>
                                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Company Name</th>
                                <th style='padding:6px 10px;border:1px solid #ddd;background:#999;color:#333'>Meters</th>
                                {msp_end_headers}
                            </tr></thead>
                            <tbody><tr>
                                <td style='padding:6px 10px;border:1px solid #ddd;font-weight:bold'>{rec['customer_name']}</td>
                                <td style='padding:6px 10px;border:1px solid #ddd;text-align:center'>{calc['total_meters']}</td>
                                {msp_price_cells}
                            </tr></tbody>
                        </table>"""
                    except Exception as e:
                        print(f"MSP email block failed for sid={rec.get('sid')}: {e}")

            if not content_html:
                results["failed"].append(f"{broker['company_name']} — no valid pricing")
                continue

            html = build_email_html(broker["company_name"], content_html)
            subject = f"Pricing from {get_tenant_display_name()} - {broker['company_name']}"

            await send_email_async(broker["pricing_email"], subject, html, purpose="pricing")

            await db.execute(
                text(
                    """
                    INSERT INTO broker_logs (broker_code, company_name, email_type, sent_to, status)
                    VALUES (:broker_code, :company_name, :email_type, :sent_to, :status)
                """
                ),
                {
                    "broker_code": broker["broker_code"],
                    "company_name": broker["company_name"],
                    "email_type": "custom_pricing",
                    "sent_to": broker["pricing_email"],
                    "status": "sent",
                },
            )
            results["sent"].append(broker["company_name"])

        except Exception as e:
            print(f"Custom pricing email failed for {broker.get('company_name')}: {e}")
            results["failed"].append(f"{broker['company_name']} — {str(e)}")

    await db.commit()
    return results
