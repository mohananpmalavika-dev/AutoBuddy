"""Legacy names for realtime manager imports.

The live connection registry is ``runtime_state`` plus the Socket.IO rooms in
``backend/server.py``.  These light wrappers avoid starting or maintaining a
second realtime manager.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional


class ConnectionType(str, Enum):
    PASSENGER = "passenger"
    DRIVER = "driver"
    ADMIN = "admin"
    SUPPORT = "support"


class EventType(str, Enum):
    NOTIFICATION = "notification"
    RIDE_UPDATE = "ride_update"
    MESSAGE_RECEIVED = "message_received"


@dataclass
class RealTimeEvent:
    event_type: EventType
    user_id: str
    data: Dict[str, Any]
    timestamp: datetime
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type.value,
            "user_id": self.user_id,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata or {},
        }


class _LegacyConnectionManager:
    async def get_active_connections_count(self) -> int:
        return 0

    async def get_active_users_count(self) -> int:
        return 0


class EventBroadcaster:
    @staticmethod
    async def broadcast_message(*args, **kwargs):
        return None


connection_manager = _LegacyConnectionManager()
