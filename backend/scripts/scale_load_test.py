"""
Seed and run a local AutoBuddy scale load test.

This script is intentionally local-only. It seeds a dedicated Mongo database
with ride-ready passengers, drivers, and an admin user, then drives current
authenticated API routes with generated JWTs.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import random
import statistics
import time
import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Tuple

import httpx
import jwt
from pymongo import ASCENDING, GEOSPHERE, MongoClient, UpdateOne


DEFAULT_BASE_URL = "http://127.0.0.1:8001"
DEFAULT_DB_NAME = "autobuddy_scale_loadtest"
DEFAULT_JWT_SECRET = "autobuddy-loadtest-secret-local-only-change-me"
JWT_ALGORITHM = "HS256"

KOCHI_LAT = 9.9312
KOCHI_LNG = 76.2673


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def chunked(items: Iterable[Any], size: int) -> Iterable[List[Any]]:
    batch: List[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) >= size:
            yield batch
            batch = []
    if batch:
        yield batch


def require_loadtest_db_name(db_name: str, allow_non_loadtest_db: bool) -> None:
    lowered = db_name.lower()
    safe_markers = ("loadtest", "load_test", "scale_test", "scale-load", "scale_load")
    if allow_non_loadtest_db or any(marker in lowered for marker in safe_markers):
        return
    raise SystemExit(
        f"Refusing to seed or drop database {db_name!r}. Use a load-test DB name "
        "or pass --allow-non-loadtest-db intentionally."
    )


def phone_from_index(prefix: int, index: int) -> str:
    return str(prefix + index).zfill(10)[-10:]


def actor_ip(kind: str, index: int) -> str:
    if kind == "passenger":
        return f"10.11.{(index // 240) % 240}.{(index % 240) + 10}"
    if kind == "driver":
        return f"10.21.{(index // 240) % 240}.{(index % 240) + 10}"
    return "10.31.0.10"


def make_token(user_id: str, role: str, jwt_secret: str, ttl_minutes: int) -> str:
    now = utcnow()
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, jwt_secret, algorithm=JWT_ALGORITHM)


def auth_headers(actor: Dict[str, Any]) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {actor['token']}",
        "Content-Type": "application/json",
        "X-Forwarded-For": actor["ip"],
        "User-Agent": "autobuddy-local-scale-test/1.0",
    }


def public_headers(actor: Dict[str, Any]) -> Dict[str, str]:
    return {
        "X-Forwarded-For": actor["ip"],
        "User-Agent": "autobuddy-local-scale-test/1.0",
    }


def random_location(rng: random.Random, spread_degrees: float = 0.035) -> Dict[str, Any]:
    return {
        "latitude": round(KOCHI_LAT + rng.uniform(-spread_degrees, spread_degrees), 6),
        "longitude": round(KOCHI_LNG + rng.uniform(-spread_degrees, spread_degrees), 6),
        "address": "Scale test pickup zone",
    }


def driver_location_for_index(index: int, total: int) -> Dict[str, Any]:
    columns = max(1, int(math.sqrt(total)))
    row = index // columns
    col = index % columns
    lat_offset = (row - columns / 2) * 0.0011
    lng_offset = (col - columns / 2) * 0.0011
    return {
        "latitude": round(KOCHI_LAT + lat_offset, 6),
        "longitude": round(KOCHI_LNG + lng_offset, 6),
        "address": "Scale test driver zone",
    }


def geo_point(location: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "type": "Point",
        "coordinates": [float(location["longitude"]), float(location["latitude"])],
    }


def build_user_doc(user_id: str, role: str, name: str, email: str, phone: str, index: int) -> Dict[str, Any]:
    now = utcnow()
    return {
        "id": user_id,
        "email": email,
        "name": name,
        "phone": phone,
        "password_hash": "load-test-not-used",
        "role": role,
        "user_type": role,
        "gender": "female" if index % 5 == 0 else "male",
        "language": "en",
        "status": "active",
        "is_verified": True,
        "phone_verified": True,
        "email_verified": True,
        "kyc_status": "approved",
        "subscription": {
            "plan_type": "monthly",
            "is_active": True,
            "activated_by_admin": True,
            "period_expires_at": now + timedelta(days=30),
            "outstanding_amount": 0.0,
        },
        "created_at": now,
        "updated_at": now,
    }


def build_driver_docs(index: int, total: int) -> Tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    driver_id = f"scale-driver-{index:04d}"
    now = utcnow()
    location = driver_location_for_index(index, total)
    plate = f"KL07LT{index:04d}"
    accepted_ride_types = ["normal", "rental", "rental_hourly", "women_only"]
    vehicle_info = {
        "vehicle_number": plate,
        "vehicle_model": "Bajaj RE Compact",
        "vehicle_color": "Green",
        "vehicle_type": "auto",
        "vehicle_type_id": "auto",
        "vehicle_subtype_id": None,
        "accepted_ride_types": accepted_ride_types,
    }
    driver_profile = {
        "id": driver_id,
        "user_id": driver_id,
        "name": f"Scale Driver {index:04d}",
        "phone": phone_from_index(7000000000, index),
        "gender": "female" if index % 5 == 0 else "male",
        "vehicle_info": vehicle_info,
        "vehicle_type": "auto",
        "vehicle_type_id": "auto",
        "accepted_ride_types": accepted_ride_types,
        "is_available": True,
        "is_online": True,
        "kyc_status": "approved",
        "verification_status": "approved",
        "current_location": location,
        "current_location_geo": geo_point(location),
        "geo_point": geo_point(location),
        "last_location_at": now,
        "last_heartbeat_at": now,
        "last_online_at": now,
        "rating": 4.8,
        "total_rides": 100 + (index % 80),
        "fare_multiplier": 1.0,
        "assigned_count": 0,
        "profile_photo": "https://example.invalid/load-test-driver.png",
        "emergency_contact_verified": True,
        "bank_verification_status": "verified",
        "created_at": now,
        "updated_at": now,
    }
    vehicle = {
        "id": f"scale-vehicle-{index:04d}",
        "driver_id": driver_id,
        "make": "Bajaj",
        "model": "RE Compact",
        "year": 2024,
        "color": "Green",
        "license_plate": plate,
        "registration_number": plate,
        "vehicle_type": "auto",
        "vehicle_type_id": "auto",
        "vehicle_subtype_id": None,
        "seating_capacity": 3,
        "accepted_ride_types": accepted_ride_types,
        "is_active": True,
        "verification_status": "approved",
        "created_at": now,
        "updated_at": now,
    }
    kyc = {
        "id": f"scale-driver-kyc-{index:04d}",
        "driver_id": driver_id,
        "user_id": driver_id,
        "status": "approved",
        "is_verified": True,
        "reviewed_by": "scale-admin-0001",
        "reviewed_at": now,
        "created_at": now,
        "updated_at": now,
    }
    return driver_profile, vehicle, kyc


def create_indexes(db: Any) -> None:
    db.users.create_index("id", unique=True)
    db.users.create_index("email", unique=True)
    db.users.create_index([("role", ASCENDING), ("status", ASCENDING)])
    db.drivers.create_index("user_id", unique=True)
    db.drivers.create_index([("current_location_geo", GEOSPHERE)])
    db.drivers.create_index([("geo_point", GEOSPHERE)])
    db.drivers.create_index([("is_online", ASCENDING), ("is_available", ASCENDING), ("kyc_status", ASCENDING)])
    db.driver_vehicles.create_index([("driver_id", ASCENDING), ("id", ASCENDING)], unique=True)
    db.driver_vehicles.create_index([("driver_id", ASCENDING), ("is_active", ASCENDING)])
    db.driver_kyc.create_index("driver_id", unique=True)
    db.passenger_kyc.create_index("user_id", unique=True)
    db.bookings.create_index("id", unique=True)
    db.bookings.create_index("passenger_id")
    db.bookings.create_index("driver_id")
    db.bookings.create_index([("status", ASCENDING), ("created_at", ASCENDING)])
    db.dispatch_logs.create_index([("created_at", ASCENDING)])
    db.dispatch_attempts.create_index([("booking_id", ASCENDING), ("driver_id", ASCENDING)], unique=True)


def upsert_many(collection: Any, key: str, docs: Iterable[Dict[str, Any]], batch_size: int = 1000) -> int:
    total = 0
    for batch in chunked(docs, batch_size):
        operations = [
            UpdateOne({key: doc[key]}, {"$set": doc}, upsert=True)
            for doc in batch
        ]
        if operations:
            result = collection.bulk_write(operations, ordered=False)
            total += result.upserted_count + result.modified_count + result.matched_count
    return total


def seed_database(args: argparse.Namespace) -> Dict[str, Any]:
    require_loadtest_db_name(args.db_name, args.allow_non_loadtest_db)
    client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")

    if args.cleanup_before:
        client.drop_database(args.db_name)

    db = client[args.db_name]
    create_indexes(db)

    admin = build_user_doc(
        "scale-admin-0001",
        "admin",
        "Scale Admin",
        "scale-admin@loadtest.local",
        "9000000001",
        0,
    )
    users: List[Dict[str, Any]] = [admin]
    passenger_kyc: List[Dict[str, Any]] = []
    now = utcnow()
    for i in range(args.passengers):
        passenger_id = f"scale-passenger-{i:05d}"
        users.append(
            build_user_doc(
                passenger_id,
                "passenger",
                f"Scale Passenger {i:05d}",
                f"scale-passenger-{i:05d}@loadtest.local",
                phone_from_index(8000000000, i),
                i,
            )
        )
        passenger_kyc.append(
            {
                "id": f"scale-passenger-kyc-{i:05d}",
                "user_id": passenger_id,
                "status": "approved",
                "verification_level": "approved",
                "is_verified": True,
                "reviewed_by": "scale-admin-0001",
                "reviewed_at": now,
                "created_at": now,
                "updated_at": now,
            }
        )

    driver_profiles: List[Dict[str, Any]] = []
    driver_vehicles: List[Dict[str, Any]] = []
    driver_kyc: List[Dict[str, Any]] = []
    for i in range(args.drivers):
        driver_id = f"scale-driver-{i:04d}"
        users.append(
            build_user_doc(
                driver_id,
                "driver",
                f"Scale Driver {i:04d}",
                f"scale-driver-{i:04d}@loadtest.local",
                phone_from_index(7000000000, i),
                i,
            )
        )
        profile, vehicle, kyc_doc = build_driver_docs(i, args.drivers)
        driver_profiles.append(profile)
        driver_vehicles.append(vehicle)
        driver_kyc.append(kyc_doc)

    upsert_many(db.users, "id", users)
    upsert_many(db.drivers, "user_id", driver_profiles)
    upsert_many(db.driver_vehicles, "id", driver_vehicles)
    upsert_many(db.driver_kyc, "driver_id", driver_kyc)
    upsert_many(db.passenger_kyc, "user_id", passenger_kyc)

    return {
        "db_name": args.db_name,
        "users": len(users),
        "passengers": args.passengers,
        "drivers": args.drivers,
        "admin": 1,
    }


def build_actor(user_id: str, role: str, jwt_secret: str, ttl_minutes: int, index: int) -> Dict[str, Any]:
    return {
        "id": user_id,
        "role": role,
        "token": make_token(user_id, role, jwt_secret, ttl_minutes),
        "ip": actor_ip(role, index),
    }


def build_active_actors(args: argparse.Namespace) -> Dict[str, Any]:
    active_passengers = min(args.active_passengers, args.passengers)
    active_drivers = min(args.active_drivers, args.drivers)
    return {
        "admin": build_actor("scale-admin-0001", "admin", args.jwt_secret, args.token_ttl_minutes, 0),
        "passengers": [
            build_actor(f"scale-passenger-{i:05d}", "passenger", args.jwt_secret, args.token_ttl_minutes, i)
            for i in range(active_passengers)
        ],
        "drivers": [
            build_actor(f"scale-driver-{i:04d}", "driver", args.jwt_secret, args.token_ttl_minutes, i)
            for i in range(active_drivers)
        ],
    }


@dataclass
class Metrics:
    latencies_ms: Dict[str, List[float]] = field(default_factory=lambda: defaultdict(list))
    statuses: Dict[str, Counter] = field(default_factory=lambda: defaultdict(Counter))
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def record(self, name: str, status_code: int, latency_ms: float, detail: Optional[str] = None) -> None:
        self.latencies_ms[name].append(latency_ms)
        self.statuses[name][str(status_code)] += 1
        if detail and len(self.errors) < 40:
            self.errors.append(
                {
                    "endpoint": name,
                    "status_code": status_code,
                    "latency_ms": round(latency_ms, 2),
                    "detail": detail[:350],
                }
            )


def percentile(values: List[float], pct: float) -> Optional[float]:
    if not values:
        return None
    sorted_values = sorted(values)
    if len(sorted_values) == 1:
        return sorted_values[0]
    rank = (len(sorted_values) - 1) * (pct / 100.0)
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    if low == high:
        return sorted_values[low]
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (rank - low)


def summarize(metrics: Metrics, started_at: float, finished_at: float) -> Dict[str, Any]:
    duration = max(0.001, finished_at - started_at)
    endpoints: Dict[str, Any] = {}
    total = 0
    success = 0
    status_totals: Counter = Counter()

    for name in sorted(metrics.latencies_ms):
        latencies = metrics.latencies_ms[name]
        statuses = metrics.statuses[name]
        count = len(latencies)
        endpoint_success = sum(
            amount for status, amount in statuses.items()
            if status.isdigit() and 200 <= int(status) < 400
        )
        total += count
        success += endpoint_success
        status_totals.update(statuses)
        endpoints[name] = {
            "requests": count,
            "success": endpoint_success,
            "failures": count - endpoint_success,
            "status_counts": dict(statuses),
            "avg_ms": round(statistics.fmean(latencies), 2) if latencies else None,
            "p50_ms": round(percentile(latencies, 50) or 0.0, 2) if latencies else None,
            "p95_ms": round(percentile(latencies, 95) or 0.0, 2) if latencies else None,
            "p99_ms": round(percentile(latencies, 99) or 0.0, 2) if latencies else None,
            "max_ms": round(max(latencies), 2) if latencies else None,
        }

    return {
        "duration_seconds": round(duration, 2),
        "total_requests": total,
        "rps": round(total / duration, 2),
        "success": success,
        "failures": total - success,
        "failure_rate": round(((total - success) / total) * 100.0, 2) if total else 0.0,
        "status_counts": dict(status_totals),
        "endpoints": endpoints,
        "sample_errors": metrics.errors,
    }


async def request_and_record(
    client: httpx.AsyncClient,
    metrics: Metrics,
    name: str,
    method: str,
    url: str,
    **kwargs: Any,
) -> Optional[httpx.Response]:
    started = time.perf_counter()
    try:
        response = await client.request(method, url, **kwargs)
        latency_ms = (time.perf_counter() - started) * 1000.0
        detail = None
        if response.status_code >= 400:
            detail = response.text
        metrics.record(name, response.status_code, latency_ms, detail)
        return response
    except Exception as exc:
        latency_ms = (time.perf_counter() - started) * 1000.0
        metrics.record(name, 0, latency_ms, f"{type(exc).__name__}: {exc}")
        return None


async def wait_for_server(base_url: str, timeout_seconds: float = 30.0) -> None:
    deadline = time.perf_counter() + timeout_seconds
    async with httpx.AsyncClient(timeout=2.0) as client:
        last_error = "server did not respond"
        while time.perf_counter() < deadline:
            try:
                response = await client.get(f"{base_url}/api/health")
                if response.status_code < 500:
                    return
                last_error = response.text[:200]
            except Exception as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            await asyncio.sleep(0.5)
    raise RuntimeError(f"Backend is not ready at {base_url}: {last_error}")


async def action_health(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    await request_and_record(client, metrics, "health", "GET", "/api/health")


async def action_catalog_ride_products(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    await request_and_record(
        client,
        metrics,
        "catalog_ride_products",
        "GET",
        "/api/ride-products",
        headers=public_headers(passenger),
    )


async def action_catalog_vehicles(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    await request_and_record(
        client,
        metrics,
        "catalog_vehicles",
        "GET",
        "/api/vehicles/public/all",
        headers=public_headers(passenger),
    )


async def action_driver_location(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    driver = rng.choice(actors["drivers"])
    location = random_location(rng, spread_degrees=0.025)
    await request_and_record(
        client,
        metrics,
        "driver_location_update",
        "POST",
        "/api/drivers/location",
        headers=auth_headers(driver),
        json={
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "address": location["address"],
        },
    )


async def action_driver_telemetry(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    driver = rng.choice(actors["drivers"])
    location = random_location(rng, spread_degrees=0.025)
    await request_and_record(
        client,
        metrics,
        "driver_telemetry",
        "POST",
        "/api/drivers/telemetry",
        headers=auth_headers(driver),
        json={
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "speed": round(rng.uniform(0, 42), 2),
            "timestamp": int(time.time() * 1000),
        },
    )


async def action_driver_pending(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    driver = rng.choice(actors["drivers"])
    await request_and_record(
        client,
        metrics,
        "driver_pending_requests",
        "GET",
        "/api/drivers/pending-requests",
        headers=auth_headers(driver),
    )


async def action_driver_readiness(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    driver = rng.choice(actors["drivers"])
    await request_and_record(
        client,
        metrics,
        "driver_readiness",
        "GET",
        "/api/drivers/readiness",
        headers=auth_headers(driver),
    )


async def action_nearby_drivers(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    pickup = random_location(rng, spread_degrees=0.03)
    drop = random_location(rng, spread_degrees=0.045)
    params = {
        "latitude": pickup["latitude"],
        "longitude": pickup["longitude"],
        "drop_latitude": drop["latitude"],
        "drop_longitude": drop["longitude"],
        "vehicle_type_id": "auto",
        "ride_type": "normal",
    }
    await request_and_record(
        client,
        metrics,
        "passenger_nearby_drivers",
        "GET",
        "/api/drivers/nearby",
        headers=auth_headers(passenger),
        params=params,
    )


async def action_passenger_active_booking(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    await request_and_record(
        client,
        metrics,
        "passenger_active_booking",
        "GET",
        "/api/bookings/active",
        headers=auth_headers(passenger),
    )


async def action_passenger_booking_history(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    await request_and_record(
        client,
        metrics,
        "passenger_booking_history",
        "GET",
        "/api/bookings",
        headers=auth_headers(passenger),
    )


async def action_create_booking(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    passenger = rng.choice(actors["passengers"])
    pickup = random_location(rng, spread_degrees=0.02)
    drop = random_location(rng, spread_degrees=0.045)
    await request_and_record(
        client,
        metrics,
        "passenger_create_booking",
        "POST",
        "/api/bookings",
        headers=auth_headers(passenger),
        json={
            "pickup_location": pickup,
            "drop_location": drop,
            "payment_method": "cash",
            "allow_parallel": True,
            "vehicle_type_id": "auto",
            "ride_type": "normal",
        },
    )


async def action_admin_dashboard(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    await request_and_record(
        client,
        metrics,
        "admin_dashboard",
        "GET",
        "/api/admin/dashboard",
        headers=auth_headers(actors["admin"]),
    )


async def action_admin_live_status(client: httpx.AsyncClient, metrics: Metrics, actors: Dict[str, Any], rng: random.Random) -> None:
    await request_and_record(
        client,
        metrics,
        "admin_live_status",
        "GET",
        "/api/admin/users/live-status",
        headers=auth_headers(actors["admin"]),
    )


Action = Callable[[httpx.AsyncClient, Metrics, Dict[str, Any], random.Random], Awaitable[None]]


def build_actions(args: argparse.Namespace) -> List[Tuple[str, int, Action]]:
    actions: List[Tuple[str, int, Action]] = [
        ("health", 2, action_health),
        ("catalog_ride_products", 3, action_catalog_ride_products),
        ("catalog_vehicles", 3, action_catalog_vehicles),
        ("driver_location_update", 24, action_driver_location),
        ("driver_telemetry", 18, action_driver_telemetry),
        ("driver_pending_requests", 10, action_driver_pending),
        ("driver_readiness", 3, action_driver_readiness),
        ("passenger_nearby_drivers", 14, action_nearby_drivers),
        ("passenger_active_booking", 8, action_passenger_active_booking),
        ("passenger_booking_history", 4, action_passenger_booking_history),
        ("admin_dashboard", 2, action_admin_dashboard),
        ("admin_live_status", 2, action_admin_live_status),
    ]
    if args.booking_weight > 0:
        actions.append(("passenger_create_booking", args.booking_weight, action_create_booking))
    only_actions = {
        action_name.strip()
        for action_name in str(args.only_actions or "").split(",")
        if action_name.strip()
    }
    if only_actions:
        known_actions = {name for name, _, _ in actions}
        unknown_actions = sorted(only_actions - known_actions)
        if unknown_actions:
            raise SystemExit(f"Unknown --only-actions value(s): {', '.join(unknown_actions)}")
        actions = [entry for entry in actions if entry[0] in only_actions]
    return [(name, weight, action) for name, weight, action in actions if weight > 0]


def choose_action(actions: List[Tuple[str, int, Action]], rng: random.Random) -> Action:
    total = sum(weight for _, weight, _ in actions)
    pick = rng.uniform(0, total)
    running = 0.0
    for _, weight, action in actions:
        running += weight
        if pick <= running:
            return action
    return actions[-1][2]


async def load_worker(
    worker_id: int,
    client: httpx.AsyncClient,
    metrics: Metrics,
    actors: Dict[str, Any],
    actions: List[Tuple[str, int, Action]],
    args: argparse.Namespace,
    deadline: float,
) -> None:
    rng = random.Random(args.seed + worker_id)
    if args.startup_jitter_seconds > 0:
        await asyncio.sleep(rng.uniform(0, args.startup_jitter_seconds))
    while time.perf_counter() < deadline:
        action = choose_action(actions, rng)
        await action(client, metrics, actors, rng)
        if args.max_think_seconds > 0:
            await asyncio.sleep(rng.uniform(args.min_think_seconds, args.max_think_seconds))


async def run_load(args: argparse.Namespace) -> Dict[str, Any]:
    if args.active_passengers <= 0 or args.active_drivers <= 0:
        raise SystemExit("--active-passengers and --active-drivers must be greater than zero")
    await wait_for_server(args.base_url, timeout_seconds=args.server_timeout_seconds)
    actors = build_active_actors(args)
    actions = build_actions(args)
    metrics = Metrics()
    limits = httpx.Limits(
        max_connections=max(args.concurrency * 2, 20),
        max_keepalive_connections=max(args.concurrency, 20),
    )
    timeout = httpx.Timeout(args.request_timeout_seconds)
    started = time.perf_counter()
    deadline = started + args.duration_seconds
    async with httpx.AsyncClient(base_url=args.base_url, timeout=timeout, limits=limits) as client:
        workers = [
            load_worker(worker_id, client, metrics, actors, actions, args, deadline)
            for worker_id in range(args.concurrency)
        ]
        await asyncio.gather(*workers)
    finished = time.perf_counter()
    return summarize(metrics, started, finished)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed and run a local AutoBuddy scale load test.")
    parser.add_argument("--base-url", default=os.environ.get("LOAD_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--mongo-url", default=os.environ.get("MONGO_URL") or os.environ.get("MONGO_URL_DEV") or "mongodb://localhost:27017/autobuddy_scale_loadtest")
    parser.add_argument("--db-name", default=os.environ.get("DB_NAME", DEFAULT_DB_NAME))
    parser.add_argument("--jwt-secret", default=os.environ.get("JWT_SECRET", DEFAULT_JWT_SECRET))
    parser.add_argument("--passengers", type=int, default=10000)
    parser.add_argument("--drivers", type=int, default=1000)
    parser.add_argument("--active-passengers", type=int, default=1000)
    parser.add_argument("--active-drivers", type=int, default=300)
    parser.add_argument("--duration-seconds", type=float, default=30.0)
    parser.add_argument("--concurrency", type=int, default=100)
    parser.add_argument("--booking-weight", type=int, default=4)
    parser.add_argument("--only-actions", default="")
    parser.add_argument("--min-think-seconds", type=float, default=0.03)
    parser.add_argument("--max-think-seconds", type=float, default=0.20)
    parser.add_argument("--startup-jitter-seconds", type=float, default=0.0)
    parser.add_argument("--request-timeout-seconds", type=float, default=20.0)
    parser.add_argument("--server-timeout-seconds", type=float, default=30.0)
    parser.add_argument("--token-ttl-minutes", type=int, default=240)
    parser.add_argument("--seed", type=int, default=20260608)
    parser.add_argument("--skip-seed", action="store_true")
    parser.add_argument("--seed-only", action="store_true")
    parser.add_argument("--skip-load", action="store_true")
    parser.add_argument("--cleanup-before", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--cleanup-after", action="store_true")
    parser.add_argument("--allow-non-loadtest-db", action="store_true")
    parser.add_argument("--output", default="")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    report: Dict[str, Any] = {
        "config": {
            "base_url": args.base_url,
            "mongo_url": args.mongo_url,
            "db_name": args.db_name,
            "passengers": args.passengers,
            "drivers": args.drivers,
            "active_passengers": args.active_passengers,
            "active_drivers": args.active_drivers,
            "duration_seconds": args.duration_seconds,
            "concurrency": args.concurrency,
            "booking_weight": args.booking_weight,
        }
    }
    client: Optional[MongoClient] = None
    try:
        if not args.skip_seed:
            report["seed"] = seed_database(args)
        if not args.seed_only and not args.skip_load:
            report["load"] = asyncio.run(run_load(args))
    finally:
        if args.cleanup_after:
            require_loadtest_db_name(args.db_name, args.allow_non_loadtest_db)
            client = MongoClient(args.mongo_url, serverSelectionTimeoutMS=5000)
            client.drop_database(args.db_name)
            report["cleanup_after"] = {"dropped_db": args.db_name}
        if client is not None:
            client.close()

    rendered = json.dumps(report, indent=2, default=str)
    print(rendered)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(rendered + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
