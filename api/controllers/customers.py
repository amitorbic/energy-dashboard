from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date


async def create_customer(data: dict, db: AsyncSession):
    data["pricing_start_date"] = date.today().isoformat()
    query = text(
        """
        INSERT INTO customers_new (
            company_name, esid, num_esids, nodal, broker_code,
            broker_fee, ameripower_mills, credit_status,
            contract_start_date, pricing_start_date, intermediate_months,
            contact_person, contact_number, contact_email,
            billing_address, comments, status
        ) VALUES (
            :company_name, :esid, :num_esids, :nodal, :broker_code,
            :broker_fee, :ameripower_mills, :credit_status,
            :contract_start_date, :pricing_start_date, :intermediate_months,
            :contact_person, :contact_number, :contact_email,
            :billing_address, :comments, 1
        )
    """
    )
    result = await db.execute(query, data)
    await db.commit()
    print(f"Created customer id={result.lastrowid}")
    return result.lastrowid


async def get_customers(db: AsyncSession):
    result = await db.execute(
        text("SELECT * FROM customers_new ORDER BY created_at DESC")
    )
    return [dict(row) for row in result.mappings()]


async def get_customer(cid: int, db: AsyncSession):
    result = await db.execute(
        text("SELECT * FROM customers_new WHERE id = :id"), {"id": cid}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def update_customer(cid: int, data: dict, db: AsyncSession):
    data["id"] = cid
    query = text(
        """
        UPDATE customers_new SET
            company_name=:company_name, esid=:esid, num_esids=:num_esids,
            nodal=:nodal, broker_code=:broker_code, broker_fee=:broker_fee,
            ameripower_mills=:ameripower_mills, credit_status=:credit_status,
            contract_start_date=:contract_start_date, pricing_start_date=:pricing_start_date,
            intermediate_months=:intermediate_months, contact_person=:contact_person,
            contact_number=:contact_number, contact_email=:contact_email,
            billing_address=:billing_address, comments=:comments
        WHERE id=:id
    """
    )
    await db.execute(query, data)
    await db.commit()


async def delete_customer(cid: int, db: AsyncSession):
    await db.execute(
        text("DELETE FROM customer_usage WHERE customer_id = :id"), {"id": cid}
    )
    await db.execute(text("DELETE FROM customers_new WHERE id = :id"), {"id": cid})
    await db.commit()
