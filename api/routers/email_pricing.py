from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from utils.database import get_db
from controllers.email_pricing import (
    send_daily_pricing_email,
    send_custom_pricing_email,
    calculate_matrix_for_start_date,
    calculate_custom_price,
    build_email_html,
    send_email_async,
)
from utils.email_routing import get_tenant_display_name
from sqlalchemy import text

router = APIRouter(prefix="/email", tags=["Email Pricing"])


@router.post("/daily")
async def send_daily(data: dict, db: AsyncSession = Depends(get_db)):
    broker_ids = data.get("broker_ids", [])
    start_date = data.get("start_date")
    terms = data.get("terms", [6, 12, 18, 24])
    price_type = data.get("price_type", "commercial")
    num_months = data.get("num_months", 6)
    return await send_daily_pricing_email(
        broker_ids, start_date, terms, price_type, num_months, db
    )


@router.post("/custom")
async def send_custom(data: dict, db: AsyncSession = Depends(get_db)):
    broker_ids = data.get("broker_ids", [])
    terms = data.get("terms", [6, 12, 18, 24])
    return await send_custom_pricing_email(broker_ids, terms, db)


@router.get("/brokers/regular")
async def get_regular_brokers(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text

    result = await db.execute(
        text(
            """
        SELECT sid, broker_code, company_name, 
               daily_pricing_email1, daily_pricing_flag1,
               mills1
        FROM broker_new
        WHERE regular_status IN ('active', 'partial')
        AND (daily_pricing_flag1=1 OR daily_pricing_flag2=1 OR 
             daily_pricing_flag3=1 OR daily_pricing_flag4=1 OR daily_pricing_flag5=1)
        ORDER BY company_name
    """
        )
    )
    return [dict(row) for row in result.mappings()]


@router.get("/brokers/irregular")
async def get_irregular_brokers(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text

    result = await db.execute(
        text(
            """
        SELECT sid, broker_code, company_name,
               daily_pricing_email1, daily_pricing_flag1,
               mills1
        FROM broker_new
        ORDER BY company_name
    """
        )
    )
    return [dict(row) for row in result.mappings()]


@router.get("/brokers/custom")
async def get_custom_pricing_brokers(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text

    result = await db.execute(
        text(
            """
        SELECT b.sid, b.broker_code, b.company_name, b.pricing_email,
               COUNT(c.id) as customer_count
        FROM broker_new b
        LEFT JOIN customers_new c ON c.broker_code = b.broker_code
        WHERE b.pricing_flag = 1
        GROUP BY b.sid
        ORDER BY b.company_name
    """
        )
    )
    return [dict(row) for row in result.mappings()]


@router.post("/preview")
async def preview_email(data: dict, db: AsyncSession = Depends(get_db)):
    from controllers.email_pricing import build_daily_matrix_html, build_email_html
    from controllers.custom_pricing import calculate_custom_price

    broker_id = data.get("broker_id")
    email_type = data.get("email_type", "daily")

    broker_res = await db.execute(
        text("SELECT * FROM broker_new WHERE sid = :sid"), {"sid": broker_id}
    )
    broker = dict(broker_res.mappings().first())

    if email_type == "daily":
        start_date = data.get("start_date")
        terms = data.get("terms", [6, 12, 18, 24])
        price_type = data.get("price_type", "commercial")
        mills = float(broker.get("mills1") or 0)

        matrix_result = await calculate_matrix_for_start_date(
            start_date, terms, db, price_type
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

        matrix_html = build_daily_matrix_html(matrix, actual_terms, price_type, mills)
        html = build_email_html(broker["company_name"], matrix_html)
    else:
        # Custom pricing preview
        customers_res = await db.execute(
            text("SELECT * FROM customers_new WHERE broker_code = :bc AND status = 1"),
            {"bc": broker["broker_code"]},
        )
        customers = [dict(row) for row in customers_res.mappings()]
        content_html = f"<p>Preview for {len(customers)} customers</p>"
        html = build_email_html(broker["company_name"], content_html)

    return {"html": html}


@router.post("/preview-data")
async def preview_data(data: dict, db: AsyncSession = Depends(get_db)):
    broker_ids = data.get("broker_ids", [])
    email_type = data.get("email_type", "daily")
    start_date = data.get("start_date")
    terms = data.get("terms", [6, 12, 18, 24])
    price_type = data.get("price_type", "commercial")
    mills_map = {}

    placeholders = ",".join([f":id{i}" for i in range(len(broker_ids))])
    params = {f"id{i}": bid for i, bid in enumerate(broker_ids)}
    brokers_res = await db.execute(
        text(f"SELECT * FROM broker_new WHERE sid IN ({placeholders})"), params
    )
    brokers = [dict(row) for row in brokers_res.mappings()]

    if email_type == "daily":
        matrix_result = await calculate_matrix_for_start_date(
            start_date, terms, db, price_type
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

        preview = []
        for broker in brokers:
            mills = float(broker.get("mills1") or 0)
            adjusted = []
            for row in matrix:
                adj_row = {"zone": row["zone"]}
                lfs = (
                    ["Residential"]
                    if "residential" in price_type
                    else ["Low", "Medium", "High"]
                )
                for lf in lfs:
                    for t in actual_terms:
                        key = f"{lf}_{t}"
                        val = row.get(key)
                        if val and val != "N/A":
                            adj_row[key] = round(float(val) + mills, 4)
                        else:
                            adj_row[key] = "N/A"
                adjusted.append(adj_row)
            preview.append(
                {
                    "broker": broker["company_name"],
                    "broker_code": broker["broker_code"],
                    "mills": mills,
                    "matrix": adjusted,
                    "terms": actual_terms,
                }
            )
        return {"type": "daily", "price_type": price_type, "brokers": preview}

    else:
        preview = []
        for broker in brokers:
            customers_res = await db.execute(
                text(
                    "SELECT * FROM customers_new WHERE broker_code = :bc AND status = 1"
                ),
                {"bc": broker["broker_code"]},
            )
            customers = [dict(row) for row in customers_res.mappings()]
            customer_prices = []
            for customer in customers:
                start = str(customer.get("contract_start_date") or "")
                if not start or start == "0000-00-00":
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
                    customer["id"], start, terms, profiles, db
                )
                customer_prices.append(
                    {
                        "company": customer["company_name"],
                        "start_date": start,
                        "num_esids": customer.get("num_esids", 1),
                        "credit_status": customer.get("credit_status", "Pending"),
                        "prices": {str(p["term"]): p["custom_price"] for p in pricing},
                        "terms": [p["term"] for p in pricing],
                    }
                )
            preview.append(
                {
                    "broker": broker["company_name"],
                    "broker_code": broker["broker_code"],
                    "customers": customer_prices,
                }
            )
        return {"type": "custom", "brokers": preview}


@router.post("/send-single-custom")
async def send_single_custom(data: dict, db: AsyncSession = Depends(get_db)):
    customer_id = data.get("customer_id")
    terms = data.get("terms", [6, 12, 18, 24])
    profiles = data.get("profiles", {})
    start_date = data.get("start_date")

    # Get customer
    cust = await db.execute(
        text("SELECT * FROM customers_new WHERE id = :id"), {"id": customer_id}
    )
    customer = cust.mappings().first()
    if not customer:
        raise HTTPException(404, "Customer not found")

    # Get broker email
    broker = await db.execute(
        text("SELECT * FROM broker_new WHERE broker_code = :bc"),
        {"bc": customer["broker_code"]},
    )
    broker = broker.mappings().first()
    if not broker or not broker.get("pricing_email"):
        raise HTTPException(400, "Broker pricing email not configured")

    # Calculate price
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

    content_html = f"""
    <table style='border-collapse:collapse;width:100%;margin-bottom:20px;font-size:12px'>
        <thead><tr>
            <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Company Name</th>
            <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Start Month</th>
            <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>ESIIDs</th>
            <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Broker Mills</th>
            <th style='padding:6px 10px;border:1px solid #ddd;background:#f1f5f9'>Credit</th>
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

    html = build_email_html(broker["company_name"], content_html)
    subject = f"Pricing from {get_tenant_display_name()} - {customer['company_name']}"
    await send_email_async(broker["pricing_email"], subject, html, purpose="pricing")

    return {"sent": True, "to": broker["pricing_email"]}
