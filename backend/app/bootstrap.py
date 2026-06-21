from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import socketio
    from fastapi import FastAPI
    from motor.motor_asyncio import AsyncIOMotorDatabase


def configure_socket_event_handlers(sio: "socketio.AsyncServer") -> None:
    """Register all Socket.IO event handlers owned outside server.py."""
    from app.sockets import configure_socket_server
    from app.sockets.fleet_events import register_fleet_socket_events
    from app.sockets.operations_events import register_operations_socket_events
    from app.sockets.realtime_updates import register_realtime_handlers

    configure_socket_server(sio)
    register_fleet_socket_events(sio)
    register_operations_socket_events(sio)
    register_realtime_handlers(sio)


async def initialize_default_catalogs(db: "AsyncIOMotorDatabase") -> None:
    """Initialize route/product catalogs required during application startup."""
    from app.routers.rate_limit_config import init_default_rate_limit_configs
    from app.routers.ride_types_router import init_default_ride_types
    from app.routers.vehicle_types import init_default_vehicle_types
    from app.routers.vehicle_types_extended import init_default_vehicle_types_extended
    from app.routers.vehicles_canonical import init_canonical_vehicles

    await init_default_vehicle_types(db)
    await init_default_vehicle_types_extended(db)
    await init_default_ride_types(db)
    await init_canonical_vehicles(db)
    await init_default_rate_limit_configs(db)


def register_modular_routers(app: "FastAPI") -> None:
    """Attach routers that already live in app.routers modules.

    Legacy endpoints still defined in server.py are mounted separately through
    api_router; this function is the boundary for already-modular routes.
    """
    from app.routers.accessibility_backend import router as accessibility_backend_router
    from app.routers.admin_account_deletions import router as admin_account_deletions_router
    from app.routers.admin_audit_compliance import router as admin_audit_compliance_router
    from app.routers.admin_control_center import router as admin_control_center_router
    from app.routers.admin_dispute_management import router as admin_dispute_management_router
    from app.routers.admin_document_requirements import router as admin_document_requirements_router
    from app.routers.admin_driver_management import router as admin_driver_management_router
    from app.routers.admin_fare_management import router as admin_fare_management_router
    from app.routers.admin_fare_proposals import router as admin_fare_proposals_router
    from app.routers.admin_financial_management import router as admin_financial_management_router
    from app.routers.admin_kyc_enhanced import router as admin_kyc_enhanced_router
    from app.routers.admin_launch_visitors import router as admin_launch_visitors_router
    from app.routers.admin_passenger_management import router as admin_passenger_management_router
    from app.routers.admin_phone_requests import router as admin_phone_requests_router
    from app.routers.admin_promotions_marketing import router as admin_promotions_marketing_router
    from app.routers.admin_reports_analytics import router as admin_reports_analytics_router
    from app.routers.admin_safety_compliance import router as admin_safety_compliance_router
    from app.routers.admin_subscriptions_enhanced import router as admin_subscriptions_enhanced_router
    from app.routers.admin_support_management import router as admin_support_management_router
    from app.routers.admin_system_config import router as admin_system_config_router
    from app.routers.admin_trip_management import router as admin_trip_management_router
    from app.routers.admin_wallet_topups import router as admin_wallet_topups_router
    from app.routers.advanced_features import router as advanced_features_router
    from app.routers.airport_rides import router as airport_router
    from app.routers.analytics import router as analytics_router
    from app.routers.analytics_intelligence_v3 import router as phase3_analytics_router
    from app.routers.assisted_rides import router as assisted_rides_router
    from app.routers.auth import router as auth_router
    from app.routers.bookings_extended import router as bookings_extended_router
    from app.routers.corporate_portal import router as corporate_portal_router
    from app.routers.core_flows import router as core_flows_router
    from app.routers.coverage_admin import router as coverage_admin_router
    from app.routers.dispatch_service import router as dispatch_service_router
    from app.routers.driver_documents import router as driver_documents_router
    from app.routers.driver_fare_override import router as driver_fare_override_router
    from app.routers.driver_fare_proposals import router as driver_fare_proposals_router
    from app.routers.driver_heatmaps import router as heatmaps_router
    from app.routers.driver_operations import router as driver_operations_router
    from app.routers.driver_trust import router as driver_trust_router
    from app.routers.features_routes import router as features_router
    from app.routers.fleet_advanced import router as fleet_advanced_router
    from app.routers.fleet_profitability import router as profitability_router
    from app.routers.health import router as health_router
    from app.routers.lost_items_backend import router as lost_items_backend_router
    from app.routers.notifications_addon import router as notifications_router
    from app.routers.notifications_backend import router as notifications_backend_router
    from app.routers.operations_center import router as operations_center_router
    from app.routers.operator_portal import admin_router as operator_admin_router
    from app.routers.operator_portal import router as operator_portal_router
    from app.routers.passenger_documents import router as passenger_documents_router
    from app.routers.payment_processing_v3 import router as phase3_payment_router
    from app.routers.promo_codes_backend import router as promo_codes_backend_router
    from app.routers.rate_limit_config import router as rate_limit_config_router
    from app.routers.realtime_tracking_v3 import router as phase3_tracking_router
    from app.routers.rental_rides import router as rental_rides_router
    from app.routers.revenue import router as revenue_router
    from app.routers.ride_operations import router as ride_operations_router
    from app.routers.ride_pooling_backend import router as ride_pooling_backend_router
    from app.routers.ride_products import router as ride_products_router
    from app.routers.ride_types_router import router as ride_types_router
    from app.routers.safety import router as safety_router
    from app.routers.safety_insurance_v3 import router as phase3_safety_router
    from app.routers.scheduled_rides import router as scheduled_rides_router
    from app.routers.security import router as security_router
    from app.routers.stripe_webhooks import router as stripe_webhooks_router
    from app.routers.support_backend import router as support_backend_router
    from app.routers.support_tickets import router as support_tickets_router
    from app.routers.tier1_driver_features import router as tier1_router
    from app.routers.tier2_driver_features import router as tier2_router
    from app.routers.tier3_polish_features import router as tier3_router
    from app.routers.uploads import router as uploads_router
    from app.routers.ticket_detection import router as ticket_detection_router
    from app.routers.vehicle_types import router as vehicle_types_router
    from app.routers.vehicle_types_extended import router as vehicle_types_extended_router
    from app.routers.vehicles import router as vehicles_router
    from app.routers.vehicles_canonical import router as vehicles_canonical_router
    from app.routers.women_only_rides import router as women_only_rides_router

    routers = (
        auth_router,
        core_flows_router,
        analytics_router,
        driver_trust_router,
        ride_products_router,
        women_only_rides_router,
        rental_rides_router,
        revenue_router,
        security_router,
        safety_router,
        advanced_features_router,
        features_router,
        notifications_router,
        tier1_router,
        tier2_router,
        tier3_router,
        health_router,
        scheduled_rides_router,
        vehicles_canonical_router,
        vehicles_router,
        vehicle_types_router,
        vehicle_types_extended_router,
        ride_types_router,
        bookings_extended_router,
        coverage_admin_router,
        operator_portal_router,
        operator_admin_router,
        support_tickets_router,
        uploads_router,
        admin_control_center_router,
        admin_account_deletions_router,
        admin_audit_compliance_router,
        admin_dispute_management_router,
        admin_driver_management_router,
        admin_financial_management_router,
        admin_kyc_enhanced_router,
        admin_launch_visitors_router,
        admin_passenger_management_router,
        admin_phone_requests_router,
        admin_promotions_marketing_router,
        admin_reports_analytics_router,
        admin_safety_compliance_router,
        admin_subscriptions_enhanced_router,
        admin_support_management_router,
        admin_system_config_router,
        admin_trip_management_router,
        admin_wallet_topups_router,
        admin_document_requirements_router,
        driver_documents_router,
        driver_operations_router,
        passenger_documents_router,
        admin_fare_management_router,
        driver_fare_override_router,
        driver_fare_proposals_router,
        admin_fare_proposals_router,
        fleet_advanced_router,
        operations_center_router,
        corporate_portal_router,
        airport_router,
        heatmaps_router,
        profitability_router,
        rate_limit_config_router,
        dispatch_service_router,
        stripe_webhooks_router,
        ride_operations_router,
        notifications_backend_router,
        support_backend_router,
        lost_items_backend_router,
        ride_pooling_backend_router,
        assisted_rides_router,
        promo_codes_backend_router,
        accessibility_backend_router,
        ticket_detection_router,
    )
    for router in routers:
        app.include_router(router)

    app.include_router(phase3_tracking_router, prefix="/api/v3/tracking", tags=["Phase 3 - Real-time Tracking"])
    app.include_router(phase3_payment_router, prefix="/api/v3/payments", tags=["Phase 3 - Payment Processing"])
    app.include_router(phase3_safety_router, prefix="/api/v3/safety", tags=["Phase 3 - Safety & Insurance"])
    app.include_router(phase3_analytics_router, prefix="/api/v3/analytics", tags=["Phase 3 - Analytics Intelligence"])
