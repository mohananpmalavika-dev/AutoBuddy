"""Import smoke tests for v2 routers that share schema/model wiring."""


def test_v2_routers_import_with_models_and_schemas(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")

    from app import models, schemas
    from app.routers import booking_api_v2, smart_dispatch_v2, surge_pricing_v2, vehicle_types_api

    assert schemas.FareEstimateRequest
    assert schemas.VehicleTypeResponse
    assert models.VehicleType.__tablename__ == "vehicle_types"
    assert models.RidePricingOverride.__tablename__ == "ride_pricing_overrides"
    assert booking_api_v2.router
    assert vehicle_types_api.router
    assert smart_dispatch_v2.router
    assert surge_pricing_v2.router
