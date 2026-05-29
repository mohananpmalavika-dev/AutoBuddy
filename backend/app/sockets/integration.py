"""Compatibility shim for the production Socket.IO integration.

AutoBuddy mounts one authenticated Socket.IO server in ``backend/server.py`` at
``/ws/socket.io``.  Older code imported ``app.sockets.integration``; this shim
binds those imports to the already-created server instead of creating another
server with independent CORS/session behavior.
"""

from __future__ import annotations

from typing import Optional

from app.sockets.events import broadcast_event, configure_socket_server, get_socket_server


class SocketIOIntegration:
    def __init__(self):
        self.sio = None
        self.handlers_registered = False

    def initialize(self, app):
        self.sio = getattr(getattr(app, "state", None), "sio", None)
        configure_socket_server(self.sio)
        self.handlers_registered = self.sio is not None
        return self.sio

    def get_asgi_app(self, app):
        return app


socketio_integration = SocketIOIntegration()


def init_socketio(app):
    return socketio_integration.initialize(app)


def get_configured_socket_server() -> Optional[object]:
    return get_socket_server()


__all__ = [
    "SocketIOIntegration",
    "broadcast_event",
    "get_configured_socket_server",
    "init_socketio",
    "socketio_integration",
]
