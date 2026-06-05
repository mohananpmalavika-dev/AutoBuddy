import os
import sys
import traceback
import faulthandler

import uvicorn


def _is_set(name: str) -> str:
    value = os.environ.get(name)
    return "set" if value else "missing"


def _import_probe() -> None:
    modules = [
        "fastapi",
        "motor.motor_asyncio",
        "httpx",
        "bcrypt",
        "jwt",
        "socketio",
        "stripe",
        "cryptography.fernet",
        "google.auth.transport.requests",
        "google.oauth2.id_token",
        "redis.asyncio",
        "prometheus_client",
        "sentry_sdk",
    ]
    for module_name in modules:
        try:
            print(f"[render_start] Probe import: {module_name}", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            __import__(module_name)
            print(f"[render_start] ✓ {module_name}", flush=True)
        except ImportError as e:
            # ImportError is expected for optional modules
            print(f"[render_start] ⊘ {module_name} (optional): {e}", flush=True)
        except Exception as e:
            print(f"[render_start] ✗ {module_name}: {e}", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            raise
    print("[render_start] Probe imports complete", flush=True)
    sys.stdout.flush()
    sys.stderr.flush()


def _app_module_probe() -> None:
    """Probe app module imports step by step."""
    modules = [
        ("app.core.config", "Settings module"),
        ("app.db.client", "Database client"),
        ("app.state", "Runtime state"),
        ("app.routers.auth", "Auth router"),
    ]
    for module_name, description in modules:
        try:
            print(f"[render_start] Probe app import: {description} ({module_name})", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            __import__(module_name)
            print(f"[render_start] ✓ {description}", flush=True)
        except Exception as e:
            print(f"[render_start] ✗ {description}: {e}", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            raise
    print("[render_start] App module probes complete", flush=True)
    sys.stdout.flush()
    sys.stderr.flush()


def main() -> int:
    faulthandler.enable()
    port_raw = os.environ.get("PORT", "10000")
    try:
        port = int(port_raw)
    except ValueError:
        port = 10000

    print(f"[render_start v2026-05-26b] Python: {sys.version.split()[0]}", flush=True)
    print(
        "[render_start] ENV status: "
        f"MONGO_URL={_is_set('MONGO_URL')}, "
        f"JWT_SECRET={_is_set('JWT_SECRET')}, "
        f"ALLOWED_ORIGINS={_is_set('ALLOWED_ORIGINS')}, "
        f"REDIS_URL={_is_set('REDIS_URL')}",
        flush=True,
    )
    run_probes = os.environ.get("RENDER_START_PROBES", "false").strip().lower() in {"1", "true", "yes", "on"}
    if run_probes:
        try:
            _import_probe()
        except BaseException:
            print("[render_start] Import probe failed", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            traceback.print_exc(file=sys.stdout)
            sys.stdout.flush()
            sys.stderr.flush()
            return 1
        try:
            _app_module_probe()
        except BaseException:
            print("[render_start] App module probe failed", flush=True)
            sys.stdout.flush()
            sys.stderr.flush()
            traceback.print_exc(file=sys.stdout)
            sys.stdout.flush()
            sys.stderr.flush()
            return 1
    else:
        print("[render_start] Import probes disabled; set RENDER_START_PROBES=true to debug startup imports.", flush=True)
    try:
        # Force import now so full traceback is printed here if import-time fails.
        print("[render_start] Importing server:app...", flush=True)
        sys.stdout.flush()
        try:
            from server import app
        except Exception as e:
            import traceback
            print("[render_start] SERVER IMPORT FAILED:", repr(e))
            traceback.print_exc()
            raise
        print("[render_start] server:app imported successfully", flush=True)
        sys.stdout.flush()
    except BaseException:
        print("[render_start] Failed to import server:app", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        sys.stderr.flush()
        return 1
    try:
        print(f"[render_start] Starting uvicorn on port {port}", flush=True)
        sys.stdout.flush()
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            log_level=os.environ.get("UVICORN_LOG_LEVEL", "info").strip() or "info",
            access_log=True,
        )
    except BaseException:
        print("[render_start] Uvicorn failed to start", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        sys.stderr.flush()
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except BaseException:
        print("[render_start] Fatal bootstrap error", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
        traceback.print_exc(file=sys.stdout)
        sys.stdout.flush()
        sys.stderr.flush()
        raise
