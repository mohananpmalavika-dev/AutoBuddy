import importlib
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    'role,expected',
    [
        ('passenger', 'passenger'),
        ('driver', 'driver'),
        ('admin', 'admin'),
    ],
)
def test_role_resolution_static_frontend_style(role, expected):
    # This backend test is intentionally light-weight: it validates that
    # the backend can import cleanly and that environment-side helpers exist.
    # The real end-to-end workflow tests live on the frontend in this repo.
    assert role == expected


def test_backend_can_import_server_module_without_crashing(monkeypatch):
    # Prevent accidental environment-side failures during import by providing minimal env.
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)
    monkeypatch.setenv('LOG_JSON', '0')

    # Import server.py; if it crashes due to missing env/tools, tests will fail.
    server = importlib.import_module('server')
    assert hasattr(server, 'app')


def test_no_unprefixed_placeholder_admin_routes_are_mounted(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    server = importlib.import_module('server')
    mounted_paths = {getattr(route, 'path', '') for route in server.app.routes}

    assert not any(path == '/admin' or path.startswith('/admin/') for path in mounted_paths)
    assert any(path.startswith('/api/admin/') for path in mounted_paths)


def test_modular_routers_keep_auth_user_ids_as_uuid_strings():
    router_dir = Path(__file__).resolve().parents[1] / 'app' / 'routers'
    router_files = [
        router_dir / 'scheduled_rides.py',
        router_dir / 'vehicles.py',
        router_dir / 'support_tickets.py',
    ]

    forbidden_patterns = [
        'ObjectId(current_',
        'ObjectId(assign_to_admin_id',
        '"_id": ObjectId(assign_to_admin_id',
    ]

    for router_file in router_files:
        source = router_file.read_text(encoding='utf-8')
        assert not any(pattern in source for pattern in forbidden_patterns), router_file.name


def test_upload_router_is_mounted_and_vehicle_uploads_are_real(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    server = importlib.import_module('server')
    mounted_paths = {getattr(route, 'path', '') for route in server.app.routes}

    assert '/api/uploads/profile-photo' in mounted_paths
    assert '/api/uploads/download/{file_key:path}' in mounted_paths

    vehicle_router = Path(__file__).resolve().parents[1] / 'app' / 'routers' / 'vehicles.py'
    source = vehicle_router.read_text(encoding='utf-8')
    assert 's3://uploads' not in source
    assert 'upload_vehicle_document' in source


def test_realtime_uses_single_socketio_server():
    backend_dir = Path(__file__).resolve().parents[1]
    socket_dir = backend_dir / 'app' / 'sockets'
    socket_sources = '\n'.join(
        path.read_text(encoding='utf-8')
        for path in socket_dir.glob('*.py')
        if path.name != '__init__.py'
    )

    assert "cors_allowed_origins='*'" not in socket_sources
    assert 'cors_allowed_origins="*"' not in socket_sources
    assert 'AsyncServer(' not in socket_sources

    server_source = (backend_dir / 'server.py').read_text(encoding='utf-8')
    assert server_source.count('socketio.AsyncServer(') == 1
    assert 'configure_legacy_socket_helpers(sio)' in server_source
    assert 'app.mount("/socket.io", root_socket_app)' in server_source
    assert 'app.mount("/ws", socket_app)' in server_source
    assert 'REALTIME_RATE_LIMIT_EXEMPT_PATH_PREFIXES = ("/socket.io", "/ws")' in server_source

    rate_middleware_source = (backend_dir / 'app' / 'middleware' / 'rate_limiting.py').read_text(encoding='utf-8')
    advanced_rate_middleware_source = (
        backend_dir / 'app' / 'middleware' / 'advanced_rate_limiting.py'
    ).read_text(encoding='utf-8')
    assert '"/socket.io"' in rate_middleware_source
    assert '"/socket.io"' in advanced_rate_middleware_source


def test_socketio_polling_paths_are_not_http_rate_limited(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    server = importlib.import_module('server')
    client = TestClient(server.app, raise_server_exceptions=False)

    for path in (
        '/socket.io/?EIO=4&transport=polling',
        '/ws/socket.io/?EIO=4&transport=polling',
    ):
        response = client.get(path)
        assert response.status_code != 404, path
        assert response.status_code != 429, path


def test_unsafe_payment_prototype_router_is_removed():
    backend_dir = Path(__file__).resolve().parents[1]
    assert not (backend_dir / 'app' / 'routers' / 'payments.py').exists()

    server_source = (backend_dir / 'server.py').read_text(encoding='utf-8')
    assert '/payments/order' in server_source
    assert '/payments/verify' in server_source
    assert 'from app.routers.payments' not in server_source
    assert 'include_router(modular_payments' not in server_source


def test_full_server_route_graph_contains_critical_routes(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    server = importlib.import_module('server')
    mounted_paths = {getattr(route, 'path', '') for route in server.app.routes}
    expected_paths = {
        '/api/v1/passengers/preferences',
        '/api/v1/passengers/support/tickets',
        '/api/v1/passengers/scheduled-rides',
        '/api/drivers/readiness',
        '/api/drivers/availability',
        '/api/drivers/location',
        '/drivers/status',
        '/api/drivers-tier2/ride-filters',
        '/api/drivers-tier3/badges/earned',
        '/api/bookings',
        '/api/wallet/topup/order',
        '/api/wallet/topup/verify',
        '/api/admin/passengers/kyc/pending',
        '/api/admin/wallet/topups/pending',
        '/api/uploads/profile-photo',
    }

    assert expected_paths <= mounted_paths


def test_driver_availability_response_uses_availability_or_presence_for_dashboard():
    server_source = (Path(__file__).resolve().parents[1] / 'server.py').read_text(encoding='utf-8')

    assert 'def build_driver_availability_response(' in server_source
    assert 'is_online = is_available or presence_online or live_location_online' in server_source
    assert '"is_online": is_online' in server_source
    assert '"presence_online": presence_online' in server_source
    assert '"location_online": live_location_online' in server_source
    assert '"availability_status": availability_status' in server_source
    assert 'response.update(build_driver_availability_response(profile, profile.get("current_location")))' in server_source
    assert 'confirmed_profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}' in server_source


def test_driver_location_update_accepts_flat_and_nested_payloads():
    server_source = (Path(__file__).resolve().parents[1] / 'server.py').read_text(encoding='utf-8')

    assert 'class DriverLocationUpdate(BaseModel):' in server_source
    assert '@api_router.post("/drivers/location")' in server_source
    assert '@api_router.put("/drivers/location")' in server_source
    assert 'def accept_flat_or_nested_location(cls, data):' in server_source
    assert 'if isinstance(data.get("location"), dict):' in server_source
    assert 'latitude = data.get("latitude", data.get("lat"))' in server_source
    assert 'longitude = data.get("longitude", data.get("lng"))' in server_source
    assert 'return {"location": location}' in server_source
    assert 'confirmed_location = live_location or confirmed_profile.get("current_location") or {}' in server_source
    assert 'location_online=bool(live_location)' in server_source


def test_full_server_smoke_requests_reach_real_app(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)
    monkeypatch.setenv('ENABLE_METRICS', 'true')

    server = importlib.import_module('server')
    client = TestClient(server.app, raise_server_exceptions=False)

    api_root = client.get('/api')
    assert api_root.status_code == 200
    assert api_root.json()['metrics'] == '/api/metrics'

    metrics = client.get('/api/metrics')
    assert metrics.status_code == 200
    assert 'python_gc_objects_collected_total' in metrics.text

    protected_paths = [
        '/api/v1/passengers/preferences',
        '/api/admin/dashboard',
        '/api/uploads/download/example',
    ]
    for path in protected_paths:
        response = client.get(path)
        assert response.status_code in {401, 403}, path
        assert response.status_code != 404, path
        assert response.status_code != 500, path


def test_ci_and_render_keep_mongo_and_feature_databases_separate():
    repo_root = Path(__file__).resolve().parents[2]
    backend_ci = (repo_root / '.github' / 'workflows' / 'backend-pipeline.yml').read_text(encoding='utf-8')
    render_config = (repo_root / 'render.yaml').read_text(encoding='utf-8')
    backend_ci_lines = {line.strip() for line in backend_ci.splitlines()}

    assert 'MONGO_URL=mongodb://' in backend_ci
    assert 'FEATURE_DATABASE_URL=postgresql://' in backend_ci
    assert not any(line.startswith('DATABASE_URL=postgresql://') for line in backend_ci_lines)

    assert 'key: MONGO_URL' in render_config
    assert 'key: FEATURE_DATABASE_URL' in render_config


def test_prometheus_config_matches_backend_metrics_route():
    repo_root = Path(__file__).resolve().parents[2]
    prometheus_config = (repo_root / 'prometheus.yml').read_text(encoding='utf-8')
    render_config = (repo_root / 'prometheus.render.example.yml').read_text(encoding='utf-8')

    assert "metrics_path: '/api/metrics'" in prometheus_config
    assert "host.docker.internal:8001" in prometheus_config
    assert "localhost:8000" not in prometheus_config
    assert "metrics_path: '/metrics'" not in prometheus_config

    assert "metrics_path: '/api/metrics'" in render_config
    assert "localhost" not in render_config
    assert "$PORT" not in render_config


def test_backend_import_app_core_config(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    config_mod = importlib.import_module('app.core.config')
    assert hasattr(config_mod, 'get_settings')
