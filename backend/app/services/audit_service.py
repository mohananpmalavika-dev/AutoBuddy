import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase


async def write_audit_log(
    *,
    db: AsyncIOMotorDatabase,
    action: str,
    success: bool,
    user_id: Optional[str] = None,
    request_ip: str = "",
    user_agent: str = "",
    method: str = "",
    path: str = "",
    resource: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        await db.audit_logs.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "action": str(action or "").strip(),
                "resource": str(resource or path or "").strip(),
                "success": bool(success),
                "ip": str(request_ip or "").strip(),
                "user_agent": str(user_agent or "").strip(),
                "method": str(method or "").strip().upper(),
                "path": str(path or "").strip(),
                "metadata": metadata or {},
                "created_at": datetime.utcnow(),
            }
        )
    except Exception:
        # Audit logging must not break auth/business flows.
        return
