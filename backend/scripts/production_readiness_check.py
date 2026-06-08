"""
Validate AutoBuddy production readiness from environment and load-test evidence.

This script is intentionally dependency-free so it can run in CI before deploy.
Use --skip-env for local load-test report validation, and --production when the
current environment should be held to production gates.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


PRODUCTION_ENVIRONMENTS = {"production", "staging"}
WEAK_SECRET_VALUES = {
    "autorickshaw-secret-key-change-in-production",
    "changeme",
    "default",
    "secret",
}


def clean(value: Any) -> str:
    cleaned = str(value or "").strip()
    while len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def bool_env(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def int_env(name: str, default: int) -> int:
    try:
        return int(clean(os.environ.get(name, default)))
    except ValueError:
        return default


def feature_database_url() -> str:
    for name in ("FEATURE_DATABASE_URL", "PASSENGER_FEATURE_DATABASE_URL", "SQLALCHEMY_DATABASE_URL"):
        value = clean(os.environ.get(name, ""))
        if value.startswith("postgres://"):
            return f"postgresql://{value[len('postgres://'):]}"
        if value:
            return value
    return ""


def is_postgresql_url(value: str) -> bool:
    normalized = value.lower()
    return normalized.startswith("postgresql:") or normalized.startswith("postgresql+")


def is_mongo_url(value: str) -> bool:
    normalized = value.lower()
    return normalized.startswith("mongodb://") or normalized.startswith("mongodb+srv://")


def split_origins(value: str) -> list[str]:
    return [origin.strip().rstrip("/") for origin in str(value or "").split(",") if origin.strip()]


def public_https_origins(origins: list[str]) -> bool:
    if not origins or "*" in origins:
        return False
    for origin in origins:
        parsed = urlparse(origin)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme.lower() != "https":
            return False
        if hostname in {"localhost", "127.0.0.1", "0.0.0.0"}:
            return False
    return True


def check(name: str, passed: bool, detail: str, severity: str = "error") -> dict[str, Any]:
    return {
        "name": name,
        "passed": bool(passed),
        "severity": severity,
        "detail": detail,
    }


def env_checks(force_production: bool) -> list[dict[str, Any]]:
    environment = clean(os.environ.get("ENVIRONMENT", "development")).lower()
    production_like = force_production or environment in PRODUCTION_ENVIRONMENTS
    mongo_url = clean(os.environ.get("MONGO_URL") or os.environ.get("DATABASE_URL", ""))
    feature_url = feature_database_url()
    jwt_secret = clean(os.environ.get("JWT_SECRET") or os.environ.get("JWT_SECRET_KEY", ""))
    redis_url = clean(os.environ.get("REDIS_URL", ""))
    origins = split_origins(os.environ.get("ALLOWED_ORIGINS", os.environ.get("CORS_ORIGINS", "")))
    sentry_dsn = clean(os.environ.get("SENTRY_DSN", ""))
    enable_metrics = bool_env("ENABLE_METRICS", True)

    if not production_like:
        return [
            check("environment", True, f"environment={environment}; production gates not forced", "info"),
        ]

    strong_secret = len(jwt_secret) >= 32 and jwt_secret.lower() not in WEAK_SECRET_VALUES
    return [
        check("environment", environment in PRODUCTION_ENVIRONMENTS, f"ENVIRONMENT={environment}"),
        check("debug", not bool_env("DEBUG", False), "DEBUG must be false"),
        check("mongo_url", bool(mongo_url) and is_mongo_url(mongo_url), "MONGO_URL must be mongodb:// or mongodb+srv://"),
        check(
            "feature_database_url",
            bool(feature_url) and is_postgresql_url(feature_url),
            "FEATURE_DATABASE_URL/PASSENGER_FEATURE_DATABASE_URL/SQLALCHEMY_DATABASE_URL must be PostgreSQL",
        ),
        check("jwt_secret", strong_secret, "JWT_SECRET must be a strong 32+ character secret"),
        check("redis_url", bool(redis_url), "REDIS_URL is required for multi-instance realtime/cache stability"),
        check(
            "redis_startup_guard",
            bool_env("REQUIRE_REDIS_IN_PRODUCTION", False),
            "Set REQUIRE_REDIS_IN_PRODUCTION=true so production cannot silently fall back to local memory",
        ),
        check("allowed_origins", public_https_origins(origins), "ALLOWED_ORIGINS must be explicit public HTTPS origins"),
        check("mongo_pool", int_env("MONGO_MAX_POOL_SIZE", 300) >= 300, "MONGO_MAX_POOL_SIZE should be >= 300 for the 10k/1k gate"),
        check("observability", bool(sentry_dsn) or enable_metrics, "SENTRY_DSN or ENABLE_METRICS must be configured"),
    ]


def read_report(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_report_checks(
    report: dict[str, Any],
    min_rps: float,
    max_failure_rate: float,
    max_p95_ms: float,
    min_total_requests: int,
) -> list[dict[str, Any]]:
    load = report.get("load", {})
    config = report.get("config", {})
    endpoints = load.get("endpoints", {})
    endpoint_p95s = {
        name: metrics.get("p95_ms", 0)
        for name, metrics in endpoints.items()
        if isinstance(metrics, dict)
    }
    slowest_endpoint = max(endpoint_p95s.items(), key=lambda item: item[1], default=("none", 0))
    required_endpoints = {
        "health",
        "passenger_create_booking",
        "passenger_nearby_drivers",
        "driver_location_update",
        "driver_pending_requests",
        "admin_dashboard",
        "admin_live_status",
    }
    covered_endpoints = set(endpoints)
    missing_endpoints = sorted(required_endpoints - covered_endpoints)

    return [
        check(
            "load_report_shape",
            bool(load) and bool(config),
            "Report must include config and load sections",
        ),
        check(
            "load_population",
            config.get("passengers", 0) >= 10000 and config.get("drivers", 0) >= 1000,
            f"passengers={config.get('passengers')}, drivers={config.get('drivers')}",
        ),
        check(
            "load_concurrency",
            config.get("concurrency", 0) >= 100,
            f"concurrency={config.get('concurrency')}; expected >= 100",
        ),
        check(
            "load_total_requests",
            load.get("total_requests", 0) >= min_total_requests,
            f"total_requests={load.get('total_requests')}; expected >= {min_total_requests}",
        ),
        check(
            "load_failure_rate",
            float(load.get("failure_rate", 100.0)) <= max_failure_rate,
            f"failure_rate={load.get('failure_rate')}%; max={max_failure_rate}%",
        ),
        check(
            "load_rps",
            float(load.get("rps", 0.0)) >= min_rps,
            f"rps={load.get('rps')}; min={min_rps}",
        ),
        check(
            "load_endpoint_coverage",
            not missing_endpoints,
            "missing=" + ",".join(missing_endpoints) if missing_endpoints else "passenger, driver, and admin endpoints covered",
        ),
        check(
            "load_p95_latency",
            float(slowest_endpoint[1]) <= max_p95_ms,
            f"slowest={slowest_endpoint[0]} p95={slowest_endpoint[1]}ms; max={max_p95_ms}ms",
        ),
    ]


def summarize(checks: list[dict[str, Any]]) -> dict[str, Any]:
    blocking = [item for item in checks if item["severity"] == "error" and not item["passed"]]
    warnings = [item for item in checks if item["severity"] == "warning" and not item["passed"]]
    return {
        "status": "pass" if not blocking else "fail",
        "blocking_failures": len(blocking),
        "warnings": len(warnings),
        "checks": checks,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate AutoBuddy production readiness evidence.")
    parser.add_argument("--production", action="store_true", help="Force production/staging environment gates.")
    parser.add_argument("--skip-env", action="store_true", help="Only validate the load-test report.")
    parser.add_argument("--load-report", type=Path, help="Path to a JSON report from backend/scripts/scale_load_test.py.")
    parser.add_argument("--min-rps", type=float, default=50.0)
    parser.add_argument("--max-failure-rate", type=float, default=0.5, help="Allowed failure rate percentage.")
    parser.add_argument("--max-p95-ms", type=float, default=8500.0)
    parser.add_argument("--min-total-requests", type=int, default=1000)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    checks: list[dict[str, Any]] = []

    if not args.skip_env:
        checks.extend(env_checks(args.production))

    if args.load_report:
        if not args.load_report.exists():
            checks.append(check("load_report_exists", False, f"{args.load_report} does not exist"))
        else:
            checks.append(check("load_report_exists", True, str(args.load_report)))
            checks.extend(
                load_report_checks(
                    read_report(args.load_report),
                    min_rps=args.min_rps,
                    max_failure_rate=args.max_failure_rate,
                    max_p95_ms=args.max_p95_ms,
                    min_total_requests=args.min_total_requests,
                )
            )

    result = summarize(checks)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
