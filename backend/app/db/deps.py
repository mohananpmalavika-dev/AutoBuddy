from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import Settings


def get_db(request: Request) -> AsyncIOMotorDatabase:
    return request.app.state.db


def get_settings_from_app(request: Request) -> Settings:
    return request.app.state.settings
