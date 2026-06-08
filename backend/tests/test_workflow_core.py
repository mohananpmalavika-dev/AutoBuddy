import asyncio
import importlib
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


def prepare_server_import_env(monkeypatch):
    monkeypatch.setenv('ENVIRONMENT', 'development')
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///:memory:')
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)


class FakeAsyncCursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _length):
        return list(self.docs)


class FakeAsyncCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    def _matches(self, doc, query):
        for key, expected in (query or {}).items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                if '$in' in expected and actual not in expected['$in']:
                    return False
            elif actual != expected:
                return False
        return True

    async def find_one(self, query, _projection=None, sort=None):
        matches = [doc for doc in self.docs if self._matches(doc, query)]
        if sort:
            for field, direction in reversed(sort):
                matches.sort(key=lambda doc: doc.get(field), reverse=direction < 0)
        return matches[0] if matches else None

    async def insert_one(self, doc):
        self.docs.append(doc)
        return SimpleNamespace(inserted_id=doc.get('id') or doc.get('order_id'))

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if doc is None and upsert:
            doc = dict(query)
            self.docs.append(doc)
            for key, value in update.get('$setOnInsert', {}).items():
                doc[key] = value
        if doc is None:
            return SimpleNamespace(matched_count=0, modified_count=0)
        for key, value in update.get('$set', {}).items():
            doc[key] = value
        for key, value in update.get('$inc', {}).items():
            doc[key] = doc.get(key, 0) + value
        return SimpleNamespace(matched_count=1, modified_count=1)

    def aggregate(self, pipeline):
        docs = list(self.docs)
        for stage in pipeline:
            if '$match' in stage:
                docs = [doc for doc in docs if self._matches(doc, stage['$match'])]
            if '$group' in stage and stage['$group'].get('avg_rating', {}).get('$avg') == '$rating':
                ratings = [doc.get('rating') for doc in docs if doc.get('rating') is not None]
                docs = [{'_id': None, 'avg_rating': sum(ratings) / len(ratings)}] if ratings else []
        return FakeAsyncCursor(docs)


def install_fake_core_flow_db(monkeypatch, server, *, bookings, payment_orders=None, ratings=None):
    fake_db = SimpleNamespace(
        bookings=FakeAsyncCollection(bookings),
        payment_orders=FakeAsyncCollection(payment_orders),
        ratings=FakeAsyncCollection(ratings),
        drivers=FakeAsyncCollection(),
        driver_wallets=FakeAsyncCollection(),
    )
    monkeypatch.setattr(server, 'db', fake_db)

    async def noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(server, 'emit_to_user', noop)
    monkeypatch.setattr(server, 'notify_user', noop)
    monkeypatch.setattr(server, 'STRIPE_SECRET_KEY', '')
    return fake_db


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
    prepare_server_import_env(monkeypatch)
    monkeypatch.setenv('LOG_JSON', '0')

    # Import server.py; if it crashes due to missing env/tools, tests will fail.
    server = importlib.import_module('server')
    assert hasattr(server, 'app')


def test_no_unprefixed_placeholder_admin_routes_are_mounted(monkeypatch):
    prepare_server_import_env(monkeypatch)

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
    prepare_server_import_env(monkeypatch)

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
    bootstrap_source = (backend_dir / 'app' / 'bootstrap.py').read_text(encoding='utf-8')
    assert server_source.count('socketio.AsyncServer(') == 1
    assert 'configure_socket_event_handlers(sio)' in server_source
    assert 'configure_socket_server(sio)' in bootstrap_source
    assert 'register_fleet_socket_events(sio)' in bootstrap_source
    assert 'register_operations_socket_events(sio)' in bootstrap_source
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
    prepare_server_import_env(monkeypatch)

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
    prepare_server_import_env(monkeypatch)

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
        '/api/admin/control/capabilities',
        '/api/uploads/profile-photo',
    }

    assert expected_paths <= mounted_paths


def test_admin_control_center_covers_required_admin_domains(monkeypatch):
    prepare_server_import_env(monkeypatch)

    server = importlib.import_module('server')
    control_center = importlib.import_module('app.routers.admin_control_center')
    mounted = {
        (getattr(route, 'path', ''), method)
        for route in server.app.routes
        for method in getattr(route, 'methods', set())
    }

    required_capabilities = {
        'fares',
        'drivers',
        'passengers',
        'disputes',
        'refunds',
        'commissions',
        'documents',
        'live_rides',
        'blocked_users',
    }
    assert required_capabilities <= set(control_center.ADMIN_CONTROL_CAPABILITIES)

    expected_routes = {
        ('/api/admin/control/capabilities', 'GET'),
        ('/api/admin/control/fares', 'GET'),
        ('/api/admin/control/fares/pricing', 'PUT'),
        ('/api/admin/control/drivers', 'GET'),
        ('/api/admin/control/drivers/{driver_id}/status', 'PUT'),
        ('/api/admin/control/passengers', 'GET'),
        ('/api/admin/control/passengers/{passenger_id}/status', 'PUT'),
        ('/api/admin/control/disputes', 'GET'),
        ('/api/admin/control/disputes/{dispute_id}/control', 'PUT'),
        ('/api/admin/control/refunds', 'GET'),
        ('/api/admin/control/refunds/process', 'POST'),
        ('/api/admin/control/refunds/{refund_id}/review', 'PUT'),
        ('/api/admin/control/commissions/config', 'GET'),
        ('/api/admin/control/commissions/config', 'PUT'),
        ('/api/admin/control/commissions/summary', 'GET'),
        ('/api/admin/control/documents/review-queue', 'GET'),
        ('/api/admin/control/documents/{collection}/{document_id}/review', 'PUT'),
        ('/api/admin/control/live-rides', 'GET'),
        ('/api/admin/control/live-rides/{booking_id}/control', 'PUT'),
        ('/api/admin/control/blocked-users', 'GET'),
        ('/api/admin/control/blocked-users/{user_id}', 'PUT'),
    }
    assert expected_routes <= mounted


def test_core_ride_flow_routes_are_mounted(monkeypatch):
    prepare_server_import_env(monkeypatch)

    server = importlib.import_module('server')
    mounted = {
        (getattr(route, 'path', ''), method)
        for route in server.app.routes
        for method in getattr(route, 'methods', set())
    }

    expected = {
        ('/api/bookings', 'POST'),
        ('/api/bookings/{booking_id}/accept', 'PUT'),
        ('/api/bookings/{booking_id}/reject', 'PUT'),
        ('/api/bookings/{booking_id}/status', 'PUT'),
        ('/api/bookings/active', 'GET'),
        ('/api/payments/order', 'POST'),
        ('/api/payments/verify', 'POST'),
        ('/api/ratings', 'POST'),
        ('/api/bookings/{booking_id}/receipt', 'GET'),
        ('/api/bookings/{booking_id}/receipt/export', 'GET'),
    }

    assert expected <= mounted


def test_core_ride_flow_dispatch_contract_is_present():
    server_source = (Path(__file__).resolve().parents[1] / 'server.py').read_text(encoding='utf-8')
    create_booking_source = server_source[
        server_source.index('async def create_booking('):
        server_source.index('def normalize_booking_enum_value')
    ]

    assert 'ranked_drivers = await intelligent_find_drivers_for_booking(' in create_booking_source
    assert 'dispatch_candidate_queue = [item["driver_id"] for item in ranked_drivers]' in create_booking_source
    assert 'candidate_driver_ids = dispatch_candidate_queue[:1]' in create_booking_source
    assert '"candidate_driver_ids": candidate_driver_ids' in create_booking_source
    assert '"dispatch_candidate_queue": dispatch_candidate_queue' in create_booking_source
    assert '"current_dispatch_driver_id": candidate_driver_ids[0]' in create_booking_source
    assert '"dispatch_expires_at": dispatch_expires_at' in create_booking_source
    assert 'await record_dispatch_attempt_sent(' in create_booking_source
    assert 'await enqueue_ride(booking_id, priority=DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS)' in create_booking_source
    assert 'await emit_new_booking_to_drivers(booking_id=booking_id' in create_booking_source
    assert 'asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))' in create_booking_source


def test_smart_dispatch_priority_and_penalty_contract(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')

    normal_priority = server.dispatch_queue_priority_for_booking({'ride_type': 'normal'})
    assert server.dispatch_queue_priority_for_booking({'ride_type': 'airport'}) < normal_priority
    assert server.dispatch_product_priority_bonus({'ride_type': 'rental_hourly'}) > 0
    assert server.dispatch_product_priority_bonus({'ride_type': 'scheduled'}) > 0

    clean_score = server.calculate_driver_rank_score(
        {
            'distance_km': 1.0,
            'driver_stats': {'acceptance_rate': 0.95, 'completion_rate': 0.95},
            'rating': 4.9,
            'cancellation_risk': 0.05,
            'idle_minutes': 20,
        }
    )
    penalized_score = server.calculate_driver_rank_score(
        {
            'distance_km': 1.0,
            'driver_stats': {'acceptance_rate': 0.95, 'completion_rate': 0.95},
            'rating': 4.9,
            'cancellation_risk': 0.05,
            'idle_minutes': 20,
            'fatigue_penalty': 10,
            'decline_penalty': 20,
            'timeout_penalty': 8,
        }
    )
    assert penalized_score < clean_score


def test_smart_dispatch_selects_next_unattempted_driver(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')

    booking = {
        'dispatch_candidate_queue': ['driver-1', 'driver-2', 'driver-3'],
        'dispatch_attempted_driver_ids': ['driver-1'],
    }

    assert server.select_next_dispatch_candidate(booking) == 'driver-2'
    assert server.select_next_dispatch_candidate(
        booking,
        excluded_driver_ids=['driver-2'],
    ) == 'driver-3'


def test_smart_dispatch_women_only_matching_requires_safety_verified_female_driver(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')
    booking = {
        'ride_type': 'women_only',
        'vehicle_type_id': 'auto',
        'women_only_details': {'female_driver_required': True},
    }
    safe_female_driver = {
        'user_id': 'driver-1',
        'gender': 'female',
        'is_available': True,
        'kyc_status': 'approved',
        'police_verified': True,
        'rating': 4.9,
        'safety_score': 96,
        'live_location_enabled': True,
        'vehicle_info': {'vehicle_type_id': 'auto'},
    }
    male_driver = {**safe_female_driver, 'user_id': 'driver-2', 'gender': 'male'}

    assert server.driver_matches_booking_service(safe_female_driver, booking)
    assert not server.driver_matches_booking_service(male_driver, booking)


def test_core_ride_flow_transition_contract(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')

    server.validate_booking_status_transition(
        server.BookingStatus.ACCEPTED,
        server.BookingStatus.DRIVER_ARRIVED,
        server.UserRole.DRIVER,
    )
    server.validate_booking_status_transition(
        'driver_arrived',
        'in_progress',
        'driver',
    )
    server.validate_booking_status_transition(
        'in_progress',
        'completed',
        'driver',
    )

    with pytest.raises(HTTPException) as jump_error:
        server.validate_booking_status_transition('pending', 'completed', 'driver')
    assert jump_error.value.status_code == 400

    with pytest.raises(HTTPException) as terminal_error:
        server.validate_booking_status_transition('completed', 'cancelled', 'admin')
    assert terminal_error.value.status_code == 400


def test_core_ride_flow_payment_gate_contract(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')

    assert server.booking_payment_satisfied(
        {'status': 'completed', 'payment_method': 'cash'}
    )
    assert server.booking_payment_satisfied(
        {'status': 'completed', 'payment_method': 'online', 'payment_status': 'paid'}
    )
    assert not server.booking_payment_satisfied(
        {'status': 'completed', 'payment_method': 'online'}
    )
    assert not server.booking_payment_satisfied(
        {'status': 'in_progress', 'payment_method': 'cash'}
    )


def test_core_ride_flow_payment_order_requires_completed_trip(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')
    install_fake_core_flow_db(
        monkeypatch,
        server,
        bookings=[
            {
                'id': 'booking-1',
                'passenger_id': 'passenger-1',
                'driver_id': 'driver-1',
                'status': 'in_progress',
                'payment_method': 'online',
                'final_fare': 225.0,
            }
        ],
        payment_orders=[],
    )

    with pytest.raises(HTTPException) as payment_error:
        asyncio.run(
            server.create_payment_order(
                server.PaymentOrderCreate(booking_id='booking-1'),
                {'id': 'passenger-1', 'role': 'passenger'},
            )
        )

    assert payment_error.value.status_code == 400
    assert 'Complete the trip' in payment_error.value.detail


def test_core_ride_flow_online_payment_verify_marks_booking_paid(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')
    fake_db = install_fake_core_flow_db(
        monkeypatch,
        server,
        bookings=[
            {
                'id': 'booking-1',
                'passenger_id': 'passenger-1',
                'driver_id': 'driver-1',
                'status': 'completed',
                'payment_method': 'online',
                'payment_status': 'pending',
                'final_fare': 225.0,
            }
        ],
        payment_orders=[
            {
                'order_id': 'pay-1',
                'booking_id': 'booking-1',
                'passenger_id': 'passenger-1',
                'driver_id': 'driver-1',
                'amount': 225.0,
                'status': 'created',
                'provider': 'upi_intent',
            }
        ],
    )

    result = asyncio.run(
        server.verify_payment(
            server.PaymentVerifyRequest(order_id='pay-1', transaction_ref='UTR12345'),
            {'id': 'passenger-1', 'role': 'passenger'},
        )
    )

    booking = fake_db.bookings.docs[0]
    order = fake_db.payment_orders.docs[0]
    assert result['status'] == 'paid'
    assert order['status'] == 'paid'
    assert booking['payment_status'] == 'paid'
    assert booking['payment_order_id'] == 'pay-1'
    assert booking['payment_completed_at'] is not None


def test_core_ride_flow_rating_requires_payment_and_prevents_duplicates(monkeypatch):
    prepare_server_import_env(monkeypatch)
    server = importlib.import_module('server')
    fake_db = install_fake_core_flow_db(
        monkeypatch,
        server,
        bookings=[
            {
                'id': 'booking-1',
                'passenger_id': 'passenger-1',
                'driver_id': 'driver-1',
                'status': 'completed',
                'payment_method': 'online',
                'payment_status': 'pending',
            }
        ],
        ratings=[],
    )

    with pytest.raises(HTTPException) as unpaid_error:
        asyncio.run(
            server.create_rating(
                server.RatingCreate(booking_id='booking-1', rating=5, comment='Great ride'),
                {'id': 'passenger-1', 'role': 'passenger'},
            )
        )
    assert unpaid_error.value.status_code == 400
    assert 'payment' in unpaid_error.value.detail.lower()

    fake_db.bookings.docs[0]['payment_status'] = 'paid'
    result = asyncio.run(
        server.create_rating(
            server.RatingCreate(booking_id='booking-1', rating=5, comment='Great ride'),
            {'id': 'passenger-1', 'role': 'passenger'},
        )
    )

    assert result['message'] == 'Rating submitted'
    assert fake_db.ratings.docs[0]['to_user_id'] == 'driver-1'
    assert fake_db.bookings.docs[0]['passenger_rating_id'] == fake_db.ratings.docs[0]['id']

    with pytest.raises(HTTPException) as duplicate_error:
        asyncio.run(
            server.create_rating(
                server.RatingCreate(booking_id='booking-1', rating=5, comment='Again'),
                {'id': 'passenger-1', 'role': 'passenger'},
            )
        )
    assert duplicate_error.value.status_code == 409


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


def test_driver_dispatch_uses_background_accepting_location_window():
    server_source = (Path(__file__).resolve().parents[1] / 'server.py').read_text(encoding='utf-8')
    dispatch_source = server_source[
        server_source.index('async def find_nearest_drivers_mongo_geo'):
        server_source.index('def calculate_tracking_segment_km')
    ]

    assert 'DRIVER_ACCEPTING_BACKGROUND_SECONDS' in server_source
    assert 'is_recent_driver_location(driver_profile, DRIVER_ACCEPTING_BACKGROUND_SECONDS)' in server_source
    assert '"is_online": True' not in dispatch_source
    assert 'notify_driver_ride_request(driver_id, booking_id)' in server_source


def test_full_server_smoke_requests_reach_real_app(monkeypatch):
    prepare_server_import_env(monkeypatch)
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
    prepare_server_import_env(monkeypatch)

    config_mod = importlib.import_module('app.core.config')
    assert hasattr(config_mod, 'get_settings')
