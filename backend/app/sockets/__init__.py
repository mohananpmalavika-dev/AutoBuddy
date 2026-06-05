"""Realtime compatibility package.

The production Socket.IO server is defined and mounted in ``backend/server.py``.
Modules in this package are import shims for older code paths.
"""

from app.sockets.events import broadcast_event, configure_socket_server, emit_to_user

__all__ = ["broadcast_event", "configure_socket_server", "emit_to_user"]
