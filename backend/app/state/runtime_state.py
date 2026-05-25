import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

try:
    import redis.asyncio as redis_async
except Exception:  # pragma: no cover - dependency may not exist in local setup
    redis_async = None


@dataclass(frozen=True)
class RuntimeStateConfig:
    redis_url: str
    key_prefix: str
    otp_expiry_minutes: int
    otp_resend_cooldown_seconds: int
    login_throttle_window_minutes: int
    login_throttle_max_attempts: int
    api_rate_limit_window_seconds: int
    api_rate_limit_max_requests: int
    driver_live_location_ttl_seconds: int
    socket_state_ttl_seconds: int = 24 * 60 * 60


class RuntimeStateStore:
    def __init__(self, config: RuntimeStateConfig):
        self.config = config
        self._redis = None
        self._enabled = bool(config.redis_url.strip()) and redis_async is not None

        # Fallback memory store for non-production usage when Redis is not configured.
        self._mem_phone_otp: Dict[str, Dict[str, Any]] = {}
        self._mem_email_otp: Dict[str, Dict[str, Any]] = {}
        self._mem_login_attempts_by_ip: Dict[str, List[float]] = {}
        self._mem_api_requests_by_ip: Dict[str, List[float]] = {}
        self._mem_sid_to_user: Dict[str, Dict[str, str]] = {}
        self._mem_user_sids: Dict[str, set] = {}
        self._mem_driver_heartbeats: Dict[str, float] = {}
        self._mem_driver_active_bookings: Dict[str, str] = {}
        self._mem_driver_live_locations: Dict[str, Dict[str, Any]] = {}
        self._mem_ip_risk_hits: Dict[str, Dict[str, Any]] = {}
        self._mem_blocked_ips: Dict[str, float] = {}
        self._mem_bucket_counts: Dict[str, Dict[str, Any]] = {}

    @property
    def is_redis_enabled(self) -> bool:
        return self._enabled and self._redis is not None

    async def connect(self) -> None:
        if not self._enabled:
            return
        client = redis_async.from_url(
            self.config.redis_url,
            decode_responses=True,
            encoding="utf-8",
        )
        try:
            await client.ping()
        except Exception:
            await client.close()
            self._redis = None
            raise
        self._redis = client

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.close()
            self._redis = None

    def _key(self, *parts: str) -> str:
        prefix = str(self.config.key_prefix or "autobuddy").strip(":")
        return ":".join([prefix, *[str(part).strip(":") for part in parts]])

    @staticmethod
    def _now_ts(now: Optional[datetime] = None) -> float:
        return (now or datetime.utcnow()).timestamp()

    @staticmethod
    def _safe_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _normalize_connection_role(role: Optional[str]) -> str:
        return str(role or "").strip().lower()

    async def store_phone_otp(self, phone: str, otp_code: str, now: Optional[datetime] = None) -> None:
        await self._store_otp(kind="phone", identifier=phone, otp_code=otp_code, now=now)

    async def store_email_otp(self, email: str, otp_code: str, now: Optional[datetime] = None) -> None:
        await self._store_otp(kind="email", identifier=email, otp_code=otp_code, now=now)

    async def consume_phone_otp(self, phone: str, otp_code: str, now: Optional[datetime] = None) -> None:
        await self._consume_otp(kind="phone", identifier=phone, otp_code=otp_code, now=now)

    async def consume_email_otp(self, email: str, otp_code: str, now: Optional[datetime] = None) -> None:
        await self._consume_otp(kind="email", identifier=email, otp_code=otp_code, now=now)

    async def _store_otp(self, kind: str, identifier: str, otp_code: str, now: Optional[datetime] = None) -> None:
        now_ts = self._now_ts(now)
        key = self._key("otp", kind, identifier)
        cooldown_seconds = max(10, int(self.config.otp_resend_cooldown_seconds or 10))
        expiry_seconds = max(60, int(self.config.otp_expiry_minutes or 1) * 60)

        if self.is_redis_enabled:
            existing = await self._redis.hgetall(key)
            last_sent_ts = self._safe_float(existing.get("last_sent_ts")) if existing else 0.0
            wait_seconds = int(cooldown_seconds - max(0.0, now_ts - last_sent_ts))
            if last_sent_ts and wait_seconds > 0:
                raise HTTPException(status_code=429, detail=f"Please wait {wait_seconds}s before requesting OTP again")

            pipe = self._redis.pipeline()
            pipe.hset(
                key,
                mapping={
                    "otp": str(otp_code),
                    "expires_at_ts": str(now_ts + expiry_seconds),
                    "last_sent_ts": str(now_ts),
                },
            )
            pipe.expire(key, expiry_seconds)
            await pipe.execute()
            return

        store = self._mem_phone_otp if kind == "phone" else self._mem_email_otp
        existing = store.get(identifier)
        last_sent_ts = self._safe_float(existing.get("last_sent_ts")) if existing else 0.0
        wait_seconds = int(cooldown_seconds - max(0.0, now_ts - last_sent_ts))
        if last_sent_ts and wait_seconds > 0:
            raise HTTPException(status_code=429, detail=f"Please wait {wait_seconds}s before requesting OTP again")
        store[identifier] = {
            "otp": str(otp_code),
            "expires_at_ts": now_ts + expiry_seconds,
            "last_sent_ts": now_ts,
        }

    async def _consume_otp(self, kind: str, identifier: str, otp_code: str, now: Optional[datetime] = None) -> None:
        now_ts = self._now_ts(now)
        key = self._key("otp", kind, identifier)
        missing_detail = "OTP not requested for this number" if kind == "phone" else "OTP not requested for this email"

        if self.is_redis_enabled:
            entry = await self._redis.hgetall(key)
            if not entry:
                raise HTTPException(status_code=400, detail=missing_detail)
            expires_at_ts = self._safe_float(entry.get("expires_at_ts"))
            if now_ts > expires_at_ts:
                await self._redis.delete(key)
                raise HTTPException(status_code=400, detail="OTP expired. Please request a new OTP")
            if str(otp_code).strip() != str(entry.get("otp") or ""):
                raise HTTPException(status_code=400, detail="Invalid OTP")
            await self._redis.delete(key)
            return

        store = self._mem_phone_otp if kind == "phone" else self._mem_email_otp
        entry = store.get(identifier)
        if not entry:
            raise HTTPException(status_code=400, detail=missing_detail)
        expires_at_ts = self._safe_float(entry.get("expires_at_ts"))
        if now_ts > expires_at_ts:
            store.pop(identifier, None)
            raise HTTPException(status_code=400, detail="OTP expired. Please request a new OTP")
        if str(otp_code).strip() != str(entry.get("otp") or ""):
            raise HTTPException(status_code=400, detail="Invalid OTP")
        store.pop(identifier, None)

    async def check_login_throttle(self, ip_address: str) -> None:
        now_ts = self._now_ts()
        window_seconds = max(60, int(self.config.login_throttle_window_minutes or 1) * 60)
        max_attempts = max(1, int(self.config.login_throttle_max_attempts or 1))

        if self.is_redis_enabled:
            key = self._key("login_attempts", ip_address)
            window_start = now_ts - window_seconds
            pipe = self._redis.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.expire(key, window_seconds + 60)
            _, attempts_count, _ = await pipe.execute()
            if int(attempts_count or 0) >= max_attempts:
                raise HTTPException(
                    status_code=429,
                    detail="Too many login attempts. Please wait and try again.",
                )
            return

        attempts = self._mem_login_attempts_by_ip.get(ip_address, [])
        attempts = [attempt for attempt in attempts if attempt >= (now_ts - window_seconds)]
        self._mem_login_attempts_by_ip[ip_address] = attempts
        if len(attempts) >= max_attempts:
            raise HTTPException(
                status_code=429,
                detail="Too many login attempts. Please wait and try again.",
            )

    async def check_api_rate_limit(self, ip_address: str) -> None:
        now_ts = self._now_ts()
        window_seconds = max(10, int(self.config.api_rate_limit_window_seconds or 10))
        max_requests = max(1, int(self.config.api_rate_limit_max_requests or 1))

        if self.is_redis_enabled:
            key = self._key("api_requests", ip_address)
            window_start = now_ts - window_seconds
            member = f"{now_ts}:{uuid.uuid4().hex}"
            pipe = self._redis.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zadd(key, {member: now_ts})
            pipe.zcard(key)
            pipe.expire(key, window_seconds + 60)
            _, _, request_count, _ = await pipe.execute()
            if int(request_count or 0) > max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please slow down and try again.",
                )
            return

        requests = self._mem_api_requests_by_ip.get(ip_address, [])
        requests = [request_time for request_time in requests if request_time >= (now_ts - window_seconds)]
        requests.append(now_ts)
        self._mem_api_requests_by_ip[ip_address] = requests
        if len(requests) > max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down and try again.",
            )

    async def register_login_attempt(self, ip_address: str) -> None:
        now_ts = self._now_ts()
        window_seconds = max(60, int(self.config.login_throttle_window_minutes or 1) * 60)

        if self.is_redis_enabled:
            key = self._key("login_attempts", ip_address)
            member = f"{now_ts}:{uuid.uuid4().hex}"
            pipe = self._redis.pipeline()
            pipe.zadd(key, {member: now_ts})
            pipe.expire(key, window_seconds + 60)
            await pipe.execute()
            return

        self._mem_login_attempts_by_ip.setdefault(ip_address, []).append(now_ts)

    async def clear_login_attempts(self, ip_address: str) -> None:
        if self.is_redis_enabled:
            await self._redis.delete(self._key("login_attempts", ip_address))
            return
        self._mem_login_attempts_by_ip.pop(ip_address, None)

    async def increment_ip_risk(self, ip_address: str, ttl_seconds: int = 3600) -> int:
        ttl = max(60, int(ttl_seconds or 60))
        now_ts = self._now_ts()
        if self.is_redis_enabled:
            key = self._key("ip_risk", ip_address)
            count = await self._redis.incr(key)
            if int(count or 0) == 1:
                await self._redis.expire(key, ttl)
            return int(count or 0)

        record = self._mem_ip_risk_hits.get(ip_address)
        if not record or self._safe_float(record.get("expires_at_ts")) <= now_ts:
            record = {"count": 0, "expires_at_ts": now_ts + ttl}
            self._mem_ip_risk_hits[ip_address] = record
        record["count"] = int(record.get("count") or 0) + 1
        record["expires_at_ts"] = now_ts + ttl
        return int(record["count"])

    async def block_ip(self, ip_address: str, ttl_seconds: int = 3600) -> None:
        ttl = max(60, int(ttl_seconds or 60))
        now_ts = self._now_ts()
        if self.is_redis_enabled:
            await self._redis.set(self._key("blocked_ip", ip_address), "1", ex=ttl)
            return
        self._mem_blocked_ips[ip_address] = now_ts + ttl

    async def is_ip_blocked(self, ip_address: str) -> bool:
        now_ts = self._now_ts()
        if self.is_redis_enabled:
            value = await self._redis.get(self._key("blocked_ip", ip_address))
            return bool(value)
        expires_at_ts = self._safe_float(self._mem_blocked_ips.get(ip_address))
        if expires_at_ts <= 0:
            return False
        if now_ts > expires_at_ts:
            self._mem_blocked_ips.pop(ip_address, None)
            return False
        return True

    async def check_bucket_rate_limit(
        self,
        *,
        bucket_name: str,
        ip_address: str,
        window_seconds: int,
        max_requests: int,
    ) -> int:
        window = max(1, int(window_seconds or 1))
        limit = max(1, int(max_requests or 1))
        now_ts = int(self._now_ts())
        bucket = str(bucket_name or "default").strip().lower() or "default"
        key = self._key("bucket", bucket, ip_address, str(now_ts // window))

        if self.is_redis_enabled:
            count = await self._redis.incr(key)
            if int(count or 0) == 1:
                await self._redis.expire(key, window + 2)
            if int(count or 0) > limit:
                raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
            return int(count or 0)

        record = self._mem_bucket_counts.get(key)
        now_float = float(now_ts)
        if not record or self._safe_float(record.get("expires_at_ts")) <= now_float:
            record = {"count": 0, "expires_at_ts": now_float + window}
            self._mem_bucket_counts[key] = record
        record["count"] = int(record.get("count") or 0) + 1
        if int(record["count"]) > limit:
            raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
        if len(self._mem_bucket_counts) > 10000:
            for bucket_key, bucket_record in list(self._mem_bucket_counts.items()):
                if self._safe_float(bucket_record.get("expires_at_ts")) <= now_float:
                    self._mem_bucket_counts.pop(bucket_key, None)
        return int(record["count"])

    async def bind_socket_user(self, sid: str, user_id: str, role: Optional[str]) -> None:
        normalized_user_id = str(user_id or "").strip()
        if not normalized_user_id:
            return
        normalized_role = self._normalize_connection_role(role)
        now_ts = self._now_ts()

        if self.is_redis_enabled:
            sid_key = self._key("socket", "sid", sid)
            user_set_key = self._key("socket", "user", normalized_user_id, "sids")
            ttl = max(60, int(self.config.socket_state_ttl_seconds or 60))

            pipe = self._redis.pipeline()
            pipe.hset(
                sid_key,
                mapping={
                    "user_id": normalized_user_id,
                    "role": normalized_role,
                    "last_seen_ts": str(now_ts),
                },
            )
            pipe.expire(sid_key, ttl)
            pipe.sadd(user_set_key, sid)
            pipe.expire(user_set_key, ttl)
            pipe.set(self._key("socket", "user", normalized_user_id, "primary_sid"), sid, ex=ttl)
            await pipe.execute()
        else:
            self._mem_sid_to_user[sid] = {"user_id": normalized_user_id, "role": normalized_role}
            self._mem_user_sids.setdefault(normalized_user_id, set()).add(sid)

        if normalized_role == "driver":
            await self.touch_driver_heartbeat(normalized_user_id)

    async def get_socket_session_user(self, sid: str) -> Optional[Dict[str, str]]:
        if self.is_redis_enabled:
            sid_key = self._key("socket", "sid", sid)
            payload = await self._redis.hgetall(sid_key)
            if payload and payload.get("user_id"):
                return {
                    "user_id": str(payload.get("user_id")),
                    "role": str(payload.get("role") or ""),
                }
            return None

        raw = self._mem_sid_to_user.get(sid)
        if not raw:
            return None
        return {
            "user_id": str(raw.get("user_id") or ""),
            "role": str(raw.get("role") or ""),
        }

    async def disconnect_socket_user(self, sid: str) -> Optional[Dict[str, str]]:
        if self.is_redis_enabled:
            sid_key = self._key("socket", "sid", sid)
            raw = await self._redis.hgetall(sid_key)
            if not raw:
                return None
            user_id = str(raw.get("user_id") or "").strip()
            role = str(raw.get("role") or "").strip()

            await self._redis.delete(sid_key)
            if user_id:
                user_set_key = self._key("socket", "user", user_id, "sids")
                await self._redis.srem(user_set_key, sid)
                primary_key = self._key("socket", "user", user_id, "primary_sid")
                current_primary = await self._redis.get(primary_key)
                if current_primary == sid:
                    remaining = await self._redis.srandmember(user_set_key)
                    if remaining:
                        await self._redis.set(
                            primary_key,
                            remaining,
                            ex=max(60, int(self.config.socket_state_ttl_seconds or 60)),
                        )
                    else:
                        await self._redis.delete(primary_key)
            return {"user_id": user_id, "role": role}

        raw = self._mem_sid_to_user.pop(sid, None)
        if not raw:
            return None
        user_id = str(raw.get("user_id") or "").strip()
        if user_id and user_id in self._mem_user_sids:
            self._mem_user_sids[user_id].discard(sid)
            if not self._mem_user_sids[user_id]:
                self._mem_user_sids.pop(user_id, None)
        return {"user_id": user_id, "role": str(raw.get("role") or "")}

    async def touch_driver_heartbeat(self, driver_id: str) -> None:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return
        now_ts = self._now_ts()
        ttl_seconds = max(60, int(self.config.socket_state_ttl_seconds or 60))

        if self.is_redis_enabled:
            key = self._key("driver", "heartbeat", normalized_driver_id)
            await self._redis.set(key, str(now_ts), ex=ttl_seconds)
            return

        self._mem_driver_heartbeats[normalized_driver_id] = now_ts

    async def set_driver_active_booking(self, driver_id: str, booking_id: str) -> None:
        normalized_driver_id = str(driver_id or "").strip()
        normalized_booking_id = str(booking_id or "").strip()
        if not normalized_driver_id:
            return
        ttl_seconds = max(300, int(self.config.socket_state_ttl_seconds or 300))

        if self.is_redis_enabled:
            key = self._key("driver", "active_booking", normalized_driver_id)
            if normalized_booking_id:
                await self._redis.set(key, normalized_booking_id, ex=ttl_seconds)
            else:
                await self._redis.delete(key)
            return

        if normalized_booking_id:
            self._mem_driver_active_bookings[normalized_driver_id] = normalized_booking_id
        else:
            self._mem_driver_active_bookings.pop(normalized_driver_id, None)

    async def get_driver_active_booking(self, driver_id: str) -> str:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return ""
        if self.is_redis_enabled:
            return str(await self._redis.get(self._key("driver", "active_booking", normalized_driver_id)) or "")
        return str(self._mem_driver_active_bookings.get(normalized_driver_id) or "")

    async def list_stale_driver_ids(self, offline_cutoff: datetime) -> List[str]:
        cutoff_ts = self._now_ts(offline_cutoff)
        if self.is_redis_enabled:
            keys = await self._redis.keys(self._key("driver", "heartbeat", "*"))
            stale: List[str] = []
            for key in keys:
                last_seen_raw = await self._redis.get(key)
                last_seen_ts = self._safe_float(last_seen_raw)
                if last_seen_ts and last_seen_ts < cutoff_ts:
                    stale.append(str(key).split(":")[-1])
            return stale

        stale = []
        for driver_id, last_seen_ts in list(self._mem_driver_heartbeats.items()):
            if self._safe_float(last_seen_ts) < cutoff_ts:
                stale.append(driver_id)
        return stale

    async def mark_driver_offline(self, driver_id: str) -> None:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return
        if self.is_redis_enabled:
            await self._redis.delete(self._key("driver", "heartbeat", normalized_driver_id))
            return
        self._mem_driver_heartbeats.pop(normalized_driver_id, None)

    async def cache_driver_live_location(self, driver_id: str, location: Dict[str, Any], captured_at: datetime) -> None:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return
        ttl_seconds = max(30, int(self.config.driver_live_location_ttl_seconds or 30))
        payload = {
            "location": location,
            "captured_at_ts": self._now_ts(captured_at),
        }

        if self.is_redis_enabled:
            await self._redis.set(
                self._key("driver", "live_location", normalized_driver_id),
                json.dumps(payload, separators=(",", ":")),
                ex=ttl_seconds,
            )
            return

        self._mem_driver_live_locations[normalized_driver_id] = payload

    async def clear_driver_live_location(self, driver_id: str) -> None:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return
        if self.is_redis_enabled:
            await self._redis.delete(self._key("driver", "live_location", normalized_driver_id))
            return
        self._mem_driver_live_locations.pop(normalized_driver_id, None)

    async def get_driver_live_location(
        self,
        driver_id: str,
        *,
        max_age_seconds: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        normalized_driver_id = str(driver_id or "").strip()
        if not normalized_driver_id:
            return None
        ttl_seconds = max_age_seconds if max_age_seconds is not None else self.config.driver_live_location_ttl_seconds
        ttl_seconds = max(1, int(ttl_seconds or 1))
        now_ts = self._now_ts()

        payload: Optional[Dict[str, Any]] = None
        if self.is_redis_enabled:
            raw = await self._redis.get(self._key("driver", "live_location", normalized_driver_id))
            if not raw:
                return None
            try:
                payload = json.loads(raw)
            except Exception:
                await self._redis.delete(self._key("driver", "live_location", normalized_driver_id))
                return None
        else:
            payload = self._mem_driver_live_locations.get(normalized_driver_id)
            if not payload:
                return None

        captured_at_ts = self._safe_float((payload or {}).get("captured_at_ts"))
        if captured_at_ts <= 0:
            return None
        if (now_ts - captured_at_ts) > ttl_seconds:
            if self.is_redis_enabled:
                await self._redis.delete(self._key("driver", "live_location", normalized_driver_id))
            else:
                self._mem_driver_live_locations.pop(normalized_driver_id, None)
            return None
        location = (payload or {}).get("location")
        return location if isinstance(location, dict) else None
