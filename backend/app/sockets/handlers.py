"""Legacy WebSocket handler compatibility.

Realtime behavior is implemented by the authenticated Socket.IO handlers in
``backend/server.py``.  This module no longer owns a separate connection manager.
"""


class WebSocketHandlers:
    @staticmethod
    async def on_connect(*args, **kwargs):
        return {"ok": True, "source": "server.py"}

    @staticmethod
    async def on_disconnect(*args, **kwargs):
        return {"ok": True, "source": "server.py"}

    @staticmethod
    async def on_heartbeat(*args, **kwargs):
        return {"ok": True, "source": "server.py"}

    @staticmethod
    async def on_location_update(*args, **kwargs):
        return {"ok": False, "message": "Use the production Socket.IO handlers in server.py"}

    @staticmethod
    async def on_subscribe_ride(*args, **kwargs):
        return {"ok": False, "message": "Use join_ride_room on the production Socket.IO server"}

    @staticmethod
    async def on_unsubscribe_ride(*args, **kwargs):
        return {"ok": False, "message": "Use leave_ride_room on the production Socket.IO server"}
