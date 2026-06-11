import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
CONSUMER_DB_NAME = os.getenv("CONSUMER_DB_NAME", "consumer")

CONSUMER_DATABASE_URL = (
    f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}"
    f"/{CONSUMER_DB_NAME}?charset=utf8mb4"
)

consumer_engine = create_async_engine(
    CONSUMER_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    connect_args={"charset": "utf8mb4"},
)
ConsumerAsyncSessionLocal = sessionmaker(
    consumer_engine, class_=AsyncSession, expire_on_commit=False
)


async def get_consumer_db():
    async with ConsumerAsyncSessionLocal() as db:
        try:
            yield db
        finally:
            await db.close()
