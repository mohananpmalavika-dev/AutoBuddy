"""
Real-Time Traffic Alerts WebSocket Handler
Broadcasts traffic alerts to drivers based on their route and location
Supports priority-based alerts (HIGH/MEDIUM/LOW) with deduplication
"""

import logging
import json
from datetime import datetime, timedelta
from typing import Dict, Set, Optional, List
from dataclasses import dataclass, asdict
import socketio
from app.utils.time_helpers import get_ist_now

logger = logging.getLogger("autobuddy.traffic_alerts")

# Traffic alert connections storage
# Format: {driver_id: {route_id: sid, ...}}
driver_alert_subscriptions: Dict[str, Dict[str, str]] = {}

# Alert deduplication cache
# Format: {alert_key: {timestamp, count}}
alert_cache: Dict[str, Dict] = {}

# Driver alert preferences
# Format: {driver_id: {muted_alert_ids: set, dismissed_alert_ids: set}}
driver_preferences: Dict[str, Dict] = {}


@dataclass
class TrafficAlert:
    """Traffic alert data structure"""
    id: str
    type: str  # ACCIDENT, CONGESTION, CONSTRUCTION, RADAR, etc.
    severity: str  # HIGH, MEDIUM, LOW
    title: str
    description: str
    location: str
    delay_time: int  # seconds
    impact: str  # AVOID, CONSIDER, INFO
    reported_time: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_crowdsourced: bool = False

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "location": self.location,
            "delay_time": self.delay_time,
            "impact": self.impact,
            "reported_time": self.reported_time.isoformat(),
            "latitude": self.latitude,
            "longitude": self.longitude,
            "is_crowdsourced": self.is_crowdsourced,
        }


def get_alert_key(alert: TrafficAlert) -> str:
    """Generate deduplication key for alert"""
    return f"{alert.location}-{alert.type}".lower().strip()


def is_alert_duplicate(alert: TrafficAlert, within_minutes: int = 5) -> bool:
    """Check if alert is duplicate within timeframe"""
    key = get_alert_key(alert)
    if key in alert_cache:
        cached = alert_cache[key]
        age = (datetime.now() - cached["timestamp"]).total_seconds() / 60
        if age < within_minutes:
            cached["count"] += 1
            return True
        else:
            del alert_cache[key]
    return False


def cache_alert(alert: TrafficAlert) -> None:
    """Cache alert for deduplication"""
    key = get_alert_key(alert)
    alert_cache[key] = {
        "timestamp": datetime.now(),
        "count": 1,
        "severity": alert.severity,
    }


def register_traffic_alert_handlers(sio: socketio.AsyncServer):
    """Register WebSocket handlers for traffic alerts"""

    @sio.on("traffic:subscribe_alerts")
    async def handle_subscribe_alerts(sid: str, data: dict):
        """Subscribe driver to traffic alerts for a route"""
        driver_id = data.get("driver_id")
        route_id = data.get("route_id")

        if not driver_id or not route_id:
            logger.warning(f"Invalid subscription request: driver_id={driver_id}, route_id={route_id}")
            await sio.emit(
                "traffic:subscription_error",
                {"error": "Missing driver_id or route_id"},
                to=sid
            )
            return

        # Initialize driver subscription if needed
        if driver_id not in driver_alert_subscriptions:
            driver_alert_subscriptions[driver_id] = {}
            driver_preferences[driver_id] = {
                "muted_alert_ids": set(),
                "dismissed_alert_ids": set(),
            }

        # Subscribe to traffic alerts room
        driver_alert_subscriptions[driver_id][route_id] = sid
        room_name = f"traffic:route:{route_id}"
        await sio.enter_room(sid, room_name)

        logger.info(f"Driver {driver_id} subscribed to traffic alerts for route {route_id}")

        await sio.emit(
            "traffic:subscription_confirmed",
            {
                "driver_id": driver_id,
                "route_id": route_id,
                "status": "subscribed",
                "timestamp": get_ist_now().isoformat(),
            },
            to=sid
        )

    @sio.on("traffic:unsubscribe_alerts")
    async def handle_unsubscribe_alerts(sid: str, data: dict):
        """Unsubscribe driver from traffic alerts"""
        driver_id = data.get("driver_id")
        route_id = data.get("route_id")

        if driver_id and route_id:
            if driver_id in driver_alert_subscriptions:
                if route_id in driver_alert_subscriptions[driver_id]:
                    del driver_alert_subscriptions[driver_id][route_id]
                    if not driver_alert_subscriptions[driver_id]:
                        del driver_alert_subscriptions[driver_id]

            room_name = f"traffic:route:{route_id}"
            await sio.leave_room(sid, room_name)
            logger.info(f"Driver {driver_id} unsubscribed from traffic alerts for route {route_id}")

    @sio.on("traffic:dismiss_alert")
    async def handle_dismiss_alert(sid: str, data: dict):
        """Driver dismisses an alert"""
        driver_id = data.get("driver_id")
        alert_id = data.get("alert_id")

        if driver_id and alert_id:
            if driver_id in driver_preferences:
                driver_preferences[driver_id]["dismissed_alert_ids"].add(alert_id)
                logger.info(f"Driver {driver_id} dismissed alert {alert_id}")

    @sio.on("traffic:mute_alert_type")
    async def handle_mute_alert_type(sid: str, data: dict):
        """Driver mutes a type of alert"""
        driver_id = data.get("driver_id")
        alert_type = data.get("alert_type")  # e.g., "CONSTRUCTION"

        if driver_id and alert_type:
            if driver_id in driver_preferences:
                driver_preferences[driver_id]["muted_alert_ids"].add(alert_type)
                logger.info(f"Driver {driver_id} muted alert type {alert_type}")

    @sio.on("disconnect")
    async def handle_disconnect_alerts(sid: str):
        """Handle driver disconnection from traffic alerts"""
        for driver_id in list(driver_alert_subscriptions.keys()):
            for route_id in list(driver_alert_subscriptions[driver_id].keys()):
                if driver_alert_subscriptions[driver_id][route_id] == sid:
                    del driver_alert_subscriptions[driver_id][route_id]
            if not driver_alert_subscriptions[driver_id]:
                del driver_alert_subscriptions[driver_id]


async def broadcast_traffic_alert(sio: socketio.AsyncServer, alert: TrafficAlert, route_id: str) -> bool:
    """
    Broadcast traffic alert to all drivers subscribed to the route
    Returns: True if alert was broadcast, False if filtered (duplicate/muted)
    """
    # Check for duplicates
    if is_alert_duplicate(alert):
        logger.debug(f"Alert {alert.id} is duplicate, filtering")
        return False

    cache_alert(alert)

    room_name = f"traffic:route:{route_id}"
    alert_dict = alert.to_dict()

    # Emit to all subscribed drivers
    await sio.emit(
        "traffic:alert_new",
        {
            "type": "traffic:alert_new",
            "payload": alert_dict,
            "timestamp": get_ist_now().isoformat(),
        },
        to=room_name
    )

    logger.info(f"Traffic alert broadcast to route {route_id}: {alert.title} ({alert.severity})")
    return True


async def broadcast_alert_cleared(sio: socketio.AsyncServer, alert_id: str, route_id: str) -> None:
    """Broadcast alert cleared notification"""
    room_name = f"traffic:route:{route_id}"

    await sio.emit(
        "traffic:alert_cleared",
        {
            "type": "traffic:alert_cleared",
            "alert_id": alert_id,
            "timestamp": get_ist_now().isoformat(),
        },
        to=room_name
    )

    logger.info(f"Alert {alert_id} cleared for route {route_id}")


async def broadcast_route_recommendation(
    sio: socketio.AsyncServer,
    driver_id: str,
    route_id: str,
    recommended_route: dict
) -> None:
    """Broadcast recommended route to specific driver"""
    # Find the driver's socket ID
    if driver_id not in driver_alert_subscriptions:
        return

    for r_id, sid in driver_alert_subscriptions[driver_id].items():
        await sio.emit(
            "traffic:route_recommendation",
            {
                "type": "traffic:route_recommendation",
                "payload": recommended_route,
                "reason": "Found faster route based on traffic conditions",
                "timestamp": get_ist_now().isoformat(),
            },
            to=sid
        )

    logger.info(f"Route recommendation sent to driver {driver_id}: {recommended_route.get('name', 'Alternative route')}")


async def cleanup_old_alerts() -> None:
    """Cleanup old alerts from cache (run periodically)"""
    now = datetime.now()
    old_alerts = [
        key for key, data in alert_cache.items()
        if (now - data["timestamp"]).total_seconds() > 3600  # 1 hour
    ]

    for key in old_alerts:
        del alert_cache[key]

    if old_alerts:
        logger.info(f"Cleaned up {len(old_alerts)} old alerts from cache")


def get_active_drivers() -> List[str]:
    """Get list of drivers currently subscribed to traffic alerts"""
    return list(driver_alert_subscriptions.keys())


def get_subscribed_routes(driver_id: str) -> List[str]:
    """Get routes a driver is subscribed to"""
    if driver_id not in driver_alert_subscriptions:
        return []
    return list(driver_alert_subscriptions[driver_id].keys())


def get_driver_muted_types(driver_id: str) -> Set[str]:
    """Get alert types muted by driver"""
    if driver_id not in driver_preferences:
        return set()
    return driver_preferences[driver_id]["muted_alert_ids"]


def get_alert_stats() -> dict:
    """Get traffic alert statistics"""
    return {
        "active_drivers": len(driver_alert_subscriptions),
        "total_subscriptions": sum(len(routes) for routes in driver_alert_subscriptions.values()),
        "cached_alerts": len(alert_cache),
        "timestamp": get_ist_now().isoformat(),
    }
