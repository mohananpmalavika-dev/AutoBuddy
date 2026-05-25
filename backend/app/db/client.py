from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import Settings


def create_mongo_client(settings: Settings) -> AsyncIOMotorClient:
    return AsyncIOMotorClient(
        settings.mongo_url,
        serverSelectionTimeoutMS=max(1000, settings.mongo_server_selection_timeout_ms),
        connectTimeoutMS=max(1000, settings.mongo_connect_timeout_ms),
        socketTimeoutMS=max(2000, settings.mongo_socket_timeout_ms),
    )


def create_database(client: AsyncIOMotorClient, settings: Settings) -> AsyncIOMotorDatabase:
    return client[settings.db_name]
