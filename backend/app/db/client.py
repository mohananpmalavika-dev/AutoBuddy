import os

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings


def create_mongo_client(settings: Settings) -> AsyncIOMotorClient:
    """Create MongoDB client with production-ready connection pooling."""
    mongo_client = AsyncIOMotorClient(
        settings.mongo_url,
        # Timeouts
        serverSelectionTimeoutMS=max(5000, settings.mongo_server_selection_timeout_ms),
        connectTimeoutMS=max(1000, settings.mongo_connect_timeout_ms),
        socketTimeoutMS=max(2000, settings.mongo_socket_timeout_ms),
        # Connection pooling
        maxPoolSize=100,  # Maximum concurrent connections
        minPoolSize=10,   # Minimum connections to maintain
        maxIdleTimeMS=45000,  # Close idle connections after 45 seconds
        # Retries
        retryWrites=True,
        retryReads=True,
        # Health monitoring
        heartbeatFrequencyMS=10000,  # Health check every 10 seconds
    )
    globals()["client"] = mongo_client
    return mongo_client


def create_database(client: AsyncIOMotorClient, settings: Settings) -> AsyncIOMotorDatabase:
    database = client[settings.db_name]
    globals()["db"] = database
    return database


async def get_db():
    """
    FastAPI dependency for MongoDB database access.
    Used by admin routers.
    """
    db = globals().get("db", None)
    if db is not None:
        return db

    client = globals().get("client", None)
    if client is not None:
        db_name = os.getenv("DB_NAME", "Autobuddy_db")
        return client[db_name]

    raise RuntimeError("MongoDB client is not initialized")
