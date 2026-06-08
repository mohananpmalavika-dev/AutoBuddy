import importlib.util
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "production_readiness_check.py"
SPEC = importlib.util.spec_from_file_location("production_readiness_check", SCRIPT_PATH)
readiness = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(readiness)


def sample_load_report():
    endpoints = {
        "health": {"p95_ms": 100},
        "passenger_create_booking": {"p95_ms": 900},
        "passenger_nearby_drivers": {"p95_ms": 800},
        "driver_location_update": {"p95_ms": 700},
        "driver_pending_requests": {"p95_ms": 750},
        "admin_dashboard": {"p95_ms": 1000},
        "admin_live_status": {"p95_ms": 1100},
    }
    return {
        "config": {
            "passengers": 10000,
            "drivers": 1000,
            "concurrency": 100,
        },
        "load": {
            "total_requests": 1500,
            "failure_rate": 0.0,
            "rps": 55.0,
            "endpoints": endpoints,
        },
    }


def test_load_report_gate_passes_for_required_flows():
    checks = readiness.load_report_checks(
        sample_load_report(),
        min_rps=50,
        max_failure_rate=0.5,
        max_p95_ms=2000,
        min_total_requests=1000,
    )

    assert all(item["passed"] for item in checks)


def test_production_env_gate_passes_with_required_settings(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("MONGO_URL", "mongodb://mongo.example.test/autobuddy")
    monkeypatch.setenv("FEATURE_DATABASE_URL", "postgresql://db.example.test/autobuddy")
    monkeypatch.setenv("JWT_SECRET", "a" * 40)
    monkeypatch.setenv("REDIS_URL", "redis://redis.example.test:6379/0")
    monkeypatch.setenv("REQUIRE_REDIS_IN_PRODUCTION", "true")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.test")
    monkeypatch.setenv("MONGO_MAX_POOL_SIZE", "300")
    monkeypatch.setenv("ENABLE_METRICS", "true")

    checks = readiness.env_checks(force_production=True)

    assert all(item["passed"] for item in checks)


def test_production_env_gate_requires_redis(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("MONGO_URL", "mongodb://mongo.example.test/autobuddy")
    monkeypatch.setenv("FEATURE_DATABASE_URL", "postgresql://db.example.test/autobuddy")
    monkeypatch.setenv("JWT_SECRET", "a" * 40)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("REQUIRE_REDIS_IN_PRODUCTION", "true")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://app.example.test")
    monkeypatch.setenv("MONGO_MAX_POOL_SIZE", "300")
    monkeypatch.setenv("ENABLE_METRICS", "true")

    checks = readiness.env_checks(force_production=True)
    redis_check = next(item for item in checks if item["name"] == "redis_url")

    assert redis_check["passed"] is False
