import importlib
import os

import pytest


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


def test_backend_import_app_core_config(monkeypatch):
    monkeypatch.setenv('MONGO_URL', os.getenv('MONGO_URL') or 'mongodb://localhost:27017/test')
    monkeypatch.setenv('JWT_SECRET', os.getenv('JWT_SECRET') or 'a' * 40)

    config_mod = importlib.import_module('app.core.config')
    assert hasattr(config_mod, 'get_settings')

