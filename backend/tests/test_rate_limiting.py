from app.utils.rate_limiting import (
    DEFAULT_ENDPOINT_RATE_LIMITS,
    _default_limit_settings,
    _find_endpoint_rule,
)


def test_active_booking_uses_specific_rate_limit_before_bookings_prefix():
    settings = _default_limit_settings()

    active_rule = _find_endpoint_rule("/api/bookings/active", settings["endpoints"])
    bookings_rule = _find_endpoint_rule("/api/bookings", settings["endpoints"])

    assert any(
        config["endpoint"] == "/api/bookings/active" and config["limit_type"] == "normal"
        for config in DEFAULT_ENDPOINT_RATE_LIMITS
    )
    assert active_rule["endpoint"] == "/api/bookings/active"
    assert active_rule["limit_type"] == "normal"
    assert bookings_rule["endpoint"] == "/api/bookings"
    assert bookings_rule["limit_type"] == "moderate"
