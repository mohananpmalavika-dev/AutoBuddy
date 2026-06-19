"""
Real-Time Updates WebSocket Handlers for Mobile App
Handles live tracking, earnings, alerts, and driver locations
"""

import logging
import json
from datetime import datetime
from typing import Dict, Set, Optional
import socketio
from app.utils.time_helpers import get_ist_now

logger = logging.getLogger("autobuddy.realtime_updates")

# Socket connections storage
# Format: {room_name: {user_id: sid, ...}}
active_connections: Dict[str, Set[str]] = {}
user_sockets: Dict[str, str] = {}  # user_id -> sid mapping


def register_realtime_handlers(sio: socketio.AsyncServer):
    """Register all WebSocket handlers for real-time updates"""

    @sio.on("connect")
    async def handle_connect(sid: str, environ: dict):
        """Handle client connection"""
        logger.info(f"Client connected: {sid}")
        user_sockets[sid] = None
        await sio.emit("connection_response", {"status": "connected"}, to=sid)


    @sio.on("disconnect")
    async def handle_disconnect(sid: str):
        """Handle client disconnection"""
        logger.info(f"Client disconnected: {sid}")

        # Remove from all rooms
        for room in list(active_connections.keys()):
            if sid in active_connections[room]:
                active_connections[room].discard(sid)
                if not active_connections[room]:
                    del active_connections[room]

        # Remove from user mapping
        if sid in user_sockets:
            del user_sockets[sid]


    @sio.on("authenticate")
    async def handle_authenticate(sid: str, data: dict):
        """Authenticate user and assign to room"""
        user_id = data.get("user_id")
        token = data.get("token")
        role = data.get("role")

        if not user_id:
            logger.warning(f"Authentication failed for {sid}: no user_id")
            await sio.emit("auth_response", {"status": "failed", "reason": "No user_id"}, to=sid)
            return

        # Store user socket mapping
        user_sockets[sid] = user_id

        # Join user room (format: "{role}:{user_id}")
        room_name = f"{role}:{user_id}"
        await sio.enter_room(sid, room_name)

        # Also join role broadcast room (format: "broadcast:{role}")
        broadcast_room = f"broadcast:{role}"
        await sio.enter_room(sid, broadcast_room)

        if room_name not in active_connections:
            active_connections[room_name] = set()
        active_connections[room_name].add(sid)

        logger.info(f"User authenticated: {user_id} ({role}) - SID: {sid}")
        await sio.emit("auth_response", {
            "status": "authenticated",
            "user_id": user_id,
            "role": role,
            "timestamp": get_ist_now().isoformat()
        }, to=sid)


    # ==================== PASSENGER EVENTS ====================

    @sio.on("passenger:subscribe_ride")
    async def handle_passenger_subscribe(sid: str, data: dict):
        """Subscribe to ride updates"""
        ride_id = data.get("ride_id")
        user_id = user_sockets.get(sid)

        if not user_id or not ride_id:
            return

        room = f"ride:{ride_id}"
        await sio.enter_room(sid, room)
        logger.info(f"Passenger {user_id} subscribed to ride {ride_id}")

        await sio.emit("passenger:subscription_confirmed", {
            "ride_id": ride_id,
            "status": "subscribed"
        }, to=sid)


    @sio.on("passenger:unsubscribe_ride")
    async def handle_passenger_unsubscribe(sid: str, data: dict):
        """Unsubscribe from ride updates"""
        ride_id = data.get("ride_id")
        room = f"ride:{ride_id}"
        await sio.leave_room(sid, room)
        logger.info(f"Passenger unsubscribed from ride {ride_id}")


    # ==================== DRIVER EVENTS ====================

    @sio.on("driver:update_location")
    async def handle_driver_location(sid: str, data: dict):
        """Update driver location (broadcast to operators & passengers)"""
        driver_id = user_sockets.get(sid)
        if not driver_id:
            return

        location = {
            "driver_id": driver_id,
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "timestamp": get_ist_now().isoformat(),
            "accuracy": data.get("accuracy", 50),
            "heading": data.get("heading"),
            "speed": data.get("speed")
        }

        # Broadcast to operator monitoring this driver
        operator_room = f"operator:drivers"
        await sio.emit("driver:location_updated", location, skip_sid=sid, to=operator_room)

        # Broadcast to active ride (passenger tracking)
        ride_id = data.get("ride_id")
        if ride_id:
            ride_room = f"ride:{ride_id}"
            await sio.emit("driver:location_updated", location, to=ride_room)

        logger.debug(f"Driver {driver_id} location updated: {location['latitude']}, {location['longitude']}")


    @sio.on("driver:online_status_changed")
    async def handle_driver_status(sid: str, data: dict):
        """Driver online/offline status change"""
        driver_id = user_sockets.get(sid)
        if not driver_id:
            return

        online = data.get("online", False)

        status_event = {
            "driver_id": driver_id,
            "online": online,
            "timestamp": get_ist_now().isoformat()
        }

        # Broadcast to operators
        await sio.emit("driver:status_changed", status_event, to="broadcast:operator")

        if online:
            logger.info(f"Driver {driver_id} is now ONLINE")
        else:
            logger.info(f"Driver {driver_id} is now OFFLINE")


    @sio.on("driver:subscribe_ride_requests")
    async def handle_driver_subscribe_requests(sid: str, data: dict):
        """Subscribe to ride requests"""
        driver_id = user_sockets.get(sid)
        if not driver_id:
            return

        room = f"driver:requests:{driver_id}"
        await sio.enter_room(sid, room)
        logger.info(f"Driver {driver_id} subscribed to ride requests")


    # ==================== OPERATOR EVENTS ====================

    @sio.on("operator:subscribe_fleet")
    async def handle_operator_subscribe_fleet(sid: str, data: dict):
        """Subscribe to fleet updates"""
        operator_id = user_sockets.get(sid)
        if not operator_id:
            return

        await sio.enter_room(sid, f"operator:fleet:{operator_id}")
        await sio.enter_room(sid, "operator:drivers")  # Get all driver updates

        logger.info(f"Operator {operator_id} subscribed to fleet updates")

        await sio.emit("operator:fleet_subscription_confirmed", {
            "operator_id": operator_id,
            "timestamp": get_ist_now().isoformat()
        }, to=sid)


    @sio.on("operator:update_driver_incentive")
    async def handle_operator_incentive(sid: str, data: dict):
        """Operator updates driver incentive"""
        operator_id = user_sockets.get(sid)
        driver_id = data.get("driver_id")
        amount = data.get("amount")

        if not operator_id or not driver_id:
            return

        # Notify driver about incentive
        driver_room = f"driver:{driver_id}"
        await sio.emit("driver:incentive_updated", {
            "amount": amount,
            "operator_id": operator_id,
            "timestamp": get_ist_now().isoformat()
        }, to=driver_room)

        logger.info(f"Operator {operator_id} set incentive {amount} for driver {driver_id}")


    # ==================== ADMIN EVENTS ====================

    @sio.on("admin:subscribe_alerts")
    async def handle_admin_subscribe_alerts(sid: str, data: dict):
        """Admin subscribes to system alerts"""
        admin_id = user_sockets.get(sid)
        if not admin_id:
            return

        await sio.enter_room(sid, "admin:alerts")
        logger.info(f"Admin {admin_id} subscribed to system alerts")


    @sio.on("admin:subscribe_system_health")
    async def handle_admin_subscribe_health(sid: str, data: dict):
        """Admin subscribes to system health"""
        admin_id = user_sockets.get(sid)
        if not admin_id:
            return

        await sio.enter_room(sid, "admin:health")
        logger.info(f"Admin {admin_id} subscribed to system health")


    # ==================== BROADCAST EVENTS ====================

    @sio.on("broadcast:new_ride_request")
    async def handle_new_ride_request(sid: str, data: dict):
        """Broadcast new ride request to available drivers"""
        ride_request = {
            "ride_id": data.get("ride_id"),
            "pickup": data.get("pickup"),
            "dropoff": data.get("dropoff"),
            "estimated_fare": data.get("estimated_fare"),
            "passenger_rating": data.get("passenger_rating"),
            "ride_type": data.get("ride_type"),
            "expires_at": data.get("expires_at"),
            "timestamp": get_ist_now().isoformat()
        }

        # Broadcast to available drivers
        await sio.emit("driver:new_ride_request", ride_request, to="broadcast:driver")
        logger.info(f"New ride request {ride_request['ride_id']} broadcast to drivers")


    @sio.on("broadcast:ride_accepted")
    async def handle_ride_accepted(sid: str, data: dict):
        """Broadcast ride acceptance"""
        event = {
            "ride_id": data.get("ride_id"),
            "driver_id": data.get("driver_id"),
            "driver_name": data.get("driver_name"),
            "driver_rating": data.get("driver_rating"),
            "vehicle_info": data.get("vehicle_info"),
            "eta": data.get("eta"),
            "timestamp": get_ist_now().isoformat()
        }

        # Notify passenger
        ride_room = f"ride:{data.get('ride_id')}"
        await sio.emit("passenger:ride_accepted", event, to=ride_room)

        logger.info(f"Ride {event['ride_id']} accepted by driver {event['driver_id']}")


    @sio.on("broadcast:ride_completed")
    async def handle_ride_completed(sid: str, data: dict):
        """Broadcast ride completion"""
        event = {
            "ride_id": data.get("ride_id"),
            "final_fare": data.get("final_fare"),
            "rating": data.get("rating"),
            "timestamp": get_ist_now().isoformat()
        }

        ride_room = f"ride:{data.get('ride_id')}"
        await sio.emit("passenger:ride_completed", event, to=ride_room)

        # Update driver earnings in real-time
        driver_id = data.get("driver_id")
        if driver_id:
            driver_room = f"driver:{driver_id}"
            await sio.emit("driver:earning_updated", {
                "amount": event["final_fare"],
                "ride_id": event["ride_id"],
                "timestamp": event["timestamp"]
            }, to=driver_room)

        logger.info(f"Ride {event['ride_id']} completed")


    @sio.on("broadcast:alert")
    async def handle_broadcast_alert(sid: str, data: dict):
        """Broadcast system alert"""
        alert = {
            "id": data.get("id"),
            "title": data.get("title"),
            "severity": data.get("severity"),  # critical, high, medium, low
            "message": data.get("message"),
            "target_role": data.get("target_role"),  # driver, operator, admin
            "timestamp": get_ist_now().isoformat()
        }

        # Route to specific role
        target = alert.get("target_role")
        if target:
            await sio.emit("alert:received", alert, to=f"broadcast:{target}")
        else:
            await sio.emit("alert:received", alert, to="broadcast:admin")

        logger.info(f"Alert broadcast: {alert['title']} ({alert['severity']})")


    # ==================== HEARTBEAT ====================

    @sio.on("heartbeat")
    async def handle_heartbeat(sid: str, data: dict):
        """Keep connection alive"""
        await sio.emit("heartbeat_response", {
            "timestamp": get_ist_now().isoformat()
        }, to=sid)


async def broadcast_driver_location(sio: socketio.AsyncServer, driver_id: str, location: dict):
    """Utility to broadcast driver location"""
    location_data = {
        "driver_id": driver_id,
        **location,
        "timestamp": get_ist_now().isoformat()
    }
    await sio.emit("driver:location_updated", location_data, to="operator:drivers")


async def broadcast_system_alert(sio: socketio.AsyncServer, alert: dict):
    """Utility to broadcast system alert"""
    target_role = alert.get("target_role", "admin")
    alert_data = {
        **alert,
        "timestamp": get_ist_now().isoformat()
    }
    await sio.emit("alert:received", alert_data, to=f"broadcast:{target_role}")


async def notify_drivers_of_ride(sio: socketio.AsyncServer, ride_request: dict):
    """Utility to notify drivers of new ride"""
    await sio.emit("driver:new_ride_request", ride_request, to="broadcast:driver")


async def update_passenger_tracking(sio: socketio.AsyncServer, ride_id: str, tracking_data: dict):
    """Utility to update passenger with driver info"""
    room = f"ride:{ride_id}"
    await sio.emit("passenger:driver_update", tracking_data, to=room)


async def notify_operator_fleet_change(sio: socketio.AsyncServer, operator_id: str, stats: dict):
    """Utility to notify operator of fleet changes"""
    room = f"operator:fleet:{operator_id}"
    await sio.emit("operator:fleet_updated", stats, to=room)
