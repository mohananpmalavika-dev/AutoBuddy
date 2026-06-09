"""Package exports for the legacy top-level Pydantic schemas.

The package directory shadows ``app/schemas.py`` during normal imports, so
routers that use ``from app import schemas`` need these classes re-exported.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


_SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schemas.py"
_spec = importlib.util.spec_from_file_location("_app_legacy_schemas", _SCHEMA_FILE)
if _spec is None or _spec.loader is None:
    raise ImportError(f"Could not load legacy schemas from {_SCHEMA_FILE}")

_legacy_schemas = importlib.util.module_from_spec(_spec)
sys.modules.setdefault(_spec.name, _legacy_schemas)
_spec.loader.exec_module(_legacy_schemas)

__all__ = [
    name
    for name, value in vars(_legacy_schemas).items()
    if not name.startswith("_") and getattr(value, "__module__", None) == _legacy_schemas.__name__
]

for name in __all__:
    globals()[name] = getattr(_legacy_schemas, name)
