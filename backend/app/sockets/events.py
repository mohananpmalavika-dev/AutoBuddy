"""Compatibility helpers for AutoBuddy realtime events.

The production Socket.IO server lives in ``backend/server.py``.  This module is
kept only for older imports that used ``app.sockets.events``; it never creates a
second Socket.IO server.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_socket_server = None
sio = None


def configure_socket_server(sio) -> None:
    """Attach the production Socket.IO server for compatibility emit helpers."""
    global _socket_server
    globals()["sio"] = sio
    _socket_server = sio


def get_socket_server():
    return _socket_server


def user_room(user_id: str) -> str:
    return f"user:{str(user_id or '').strip()}"


async def emit_to_user(user_id: str, event: str, data: Optional[Dict[str, Any]] = None) -> None:
    """Emit through the production Socket.IO server when it is configured."""
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id or _socket_server is None:
        return
    await _socket_server.emit(str(event), data or {}, room=user_room(normalized_user_id))


async def broadcast_event(event_type: str, data: Optional[Dict[str, Any]] = None, room: Optional[str] = None) -> None:
    if _socket_server is None:
        return
    kwargs = {}
    if room:
        kwargs["room"] = room
    await _socket_server.emit(str(event_type), data or {}, **kwargs)


async def get_connection_stats() -> Dict[str, Any]:
    manager = getattr(_socket_server, "manager", None)
    rooms = getattr(manager, "rooms", {}) or {}
    return {
        "socket_server_configured": _socket_server is not None,
        "room_count": len(rooms) if hasattr(rooms, "__len__") else 0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _compat_emit(event_name: str) -> Callable[..., Awaitable[None]]:
    async def emitter(user_id: str = "", data: Optional[Dict[str, Any]] = None, *args, **kwargs) -> None:
        payload: Dict[str, Any]
        if isinstance(data, dict):
            payload = dict(data)
        else:
            payload = {}
        if args:
            payload["args"] = list(args)
        if kwargs:
            payload.update(kwargs)
        await emit_to_user(user_id, event_name, payload)

    return emitter


def __getattr__(name: str):
    if name.startswith("emit_"):
        return _compat_emit(name[5:])
    if name.startswith("broadcast_"):
        async def broadcaster(*args, **kwargs) -> None:
            payload = {"args": list(args), **kwargs}
            await broadcast_event(name[10:], payload)

        return broadcaster
    raise AttributeError(name)
