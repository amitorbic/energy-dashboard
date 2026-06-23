from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def create_broker(data: dict, db: AsyncSession):
    query = text(
        """
        INSERT INTO broker_new (
            vendor, broker_code, company_name, broker_name, phone_number,
            pricing_email, daily_pricing_email1, mills1,
            daily_pricing_email2, mills2,
            daily_pricing_email3, mills3,
            daily_pricing_email4, mills4,
            daily_pricing_email5, mills5,
            commission_email, confirmation_email,
            split, terms_upfront, upfront_mills, payment_term,
            discount_upfront, upfront_flag, regular_status, commission_status
        ) VALUES (
            :vendor, :broker_code, :company_name, :broker_name, :phone_number,
            :pricing_email, :daily_pricing_email1, :mills1,
            :daily_pricing_email2, :mills2,
            :daily_pricing_email3, :mills3,
            :daily_pricing_email4, :mills4,
            :daily_pricing_email5, :mills5,
            :commission_email, :confirmation_email,
            :split, :terms_upfront, :upfront_mills, :payment_term,
            :discount_upfront, :upfront_flag, :regular_status, :commission_status
        )
    """
    )
    result = await db.execute(query, data)
    await db.commit()
    return result.lastrowid


async def get_brokers(db: AsyncSession):
    result = await db.execute(text("SELECT * FROM broker_new ORDER BY sid DESC"))
    return [dict(row) for row in result.mappings()]


async def get_broker(sid: int, db: AsyncSession):
    result = await db.execute(
        text("SELECT * FROM broker_new WHERE sid = :sid"), {"sid": sid}
    )
    row = result.mappings().first()
    return dict(row) if row else None


async def update_broker(sid: int, data: dict, db: AsyncSession):
    data["sid"] = sid
    if "pricing_flag" not in data and "daily_pricing_flag1" not in data:
        # Coming from edit form — preserve existing flags
        existing = await get_broker(sid, db)
        data["pricing_flag"] = existing.get("pricing_flag", 0)
        data["daily_pricing_flag1"] = existing.get("daily_pricing_flag1", 0)
        data["daily_pricing_flag2"] = existing.get("daily_pricing_flag2", 0)
        data["daily_pricing_flag3"] = existing.get("daily_pricing_flag3", 0)
        data["daily_pricing_flag4"] = existing.get("daily_pricing_flag4", 0)
        data["daily_pricing_flag5"] = existing.get("daily_pricing_flag5", 0)
        data["commission_flag"] = existing.get("commission_flag", 0)
        data["confirmation_flag"] = existing.get("confirmation_flag", 0)
        data["upfront_flag"] = existing.get("upfront_flag", "0")
    flags = [
        data.get("pricing_flag", 0),
        data.get("daily_pricing_flag1", 0),
        data.get("daily_pricing_flag2", 0),
        data.get("daily_pricing_flag3", 0),
        data.get("daily_pricing_flag4", 0),
        data.get("daily_pricing_flag5", 0),
        data.get("commission_flag", 0),
        data.get("confirmation_flag", 0),
    ]
    any_active = any(int(f or 0) == 1 for f in flags)
    all_active = all(int(f or 0) == 1 for f in flags)

    if all_active:
        data["regular_status"] = "active"
    elif any_active:
        data["regular_status"] = "partial"
    else:
        data["regular_status"] = "inactive"
    query = text(
        """
    UPDATE broker_new SET
        vendor=:vendor, broker_code=:broker_code, company_name=:company_name,
        broker_name=:broker_name, phone_number=:phone_number,
        pricing_email=:pricing_email, pricing_flag=:pricing_flag,
        daily_pricing_email1=:daily_pricing_email1, mills1=:mills1,
        daily_pricing_flag1=:daily_pricing_flag1,
        daily_pricing_email2=:daily_pricing_email2, mills2=:mills2,
        daily_pricing_flag2=:daily_pricing_flag2,
        daily_pricing_email3=:daily_pricing_email3, mills3=:mills3,
        daily_pricing_flag3=:daily_pricing_flag3,
        daily_pricing_email4=:daily_pricing_email4, mills4=:mills4,
        daily_pricing_flag4=:daily_pricing_flag4,
        daily_pricing_email5=:daily_pricing_email5, mills5=:mills5,
        daily_pricing_flag5=:daily_pricing_flag5,
        commission_email=:commission_email, commission_flag=:commission_flag,
        confirmation_email=:confirmation_email, confirmation_flag=:confirmation_flag,
        split=:split, terms_upfront=:terms_upfront, upfront_mills=:upfront_mills,
        payment_term=:payment_term, discount_upfront=:discount_upfront,
        upfront_flag=:upfront_flag, regular_status=:regular_status,
        commission_status=:commission_status
    WHERE sid=:sid
"""
    )
    await db.execute(query, data)
    await db.commit()


async def update_broker_status(sid: int, status: str, db: AsyncSession):
    if status == "inactive":
        # Turn off all flags when deactivating
        await db.execute(
            text(
                """
            UPDATE broker_new SET 
                regular_status=:status,
                pricing_flag=0,
                daily_pricing_flag1=0, daily_pricing_flag2=0,
                daily_pricing_flag3=0, daily_pricing_flag4=0,
                daily_pricing_flag5=0,
                commission_flag=0,
                confirmation_flag=0,
                upfront_flag='0'
            WHERE sid=:sid
        """
            ),
            {"status": status, "sid": sid},
        )
    else:
        await db.execute(
            text("UPDATE broker_new SET regular_status=:status WHERE sid=:sid"),
            {"status": status, "sid": sid},
        )
    await db.commit()


async def delete_broker(sid: int, db: AsyncSession):
    await db.execute(text("DELETE FROM broker_new WHERE sid=:sid"), {"sid": sid})
    await db.commit()
