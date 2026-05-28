from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings


def create_mongo_client(settings: Settings) -> AsyncIOMotorClient:
    """Create MongoDB client with production-ready connection pooling."""
    return AsyncIOMotorClient(
        settings.mongo_url,
        # Timeouts
        serverSelectionTimeoutMS=max(1000, settings.mongo_server_selection_timeout_ms),
        connectTimeoutMS=max(1000, settings.mongo_connect_timeout_ms),
        socketTimeoutMS=max(2000, settings.mongo_socket_timeout_ms),
        # Connection pooling
        maxPoolSize=100,  # Maximum concurrent connections
        minPoolSize=10,   # Minimum connections to maintain
        maxIdleTimeMS=45000,  # Close idle connections after 45 seconds
        # Retries
        retryWrites=True,
        retryReads=True,
        # Load balancing
        serverSelectionTimeoutMS=max(5000, settings.mongo_server_selection_timeout_ms),
        heartbeatFrequencyMS=10000,  # Health check every 10 seconds
    )


def create_database(client: AsyncIOMotorClient, settings: Settings) -> AsyncIOMotorDatabase:
    return client[settings.db_name]
