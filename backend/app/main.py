"""
Incremental app package bootstrap for production refactor.

The current runtime entrypoint remains `backend/server.py` for compatibility.
This module exists so we can progressively migrate routers/services into `app/`.
"""

from server import app  # noqa: F401
