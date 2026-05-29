"""
Live Operations Center Socket.IO Events
Real-time bidirectional communication for operations monitoring
"""

import asyncio
import logging
from datetime import datetime, timedelta
import random
from typing import Dict, List

logger = logging.getLogger(__name__)


def register_operations_socket_events(sio):
    """
    Register all operations center Socket.IO events.
    
    Rooms:
    - operations_{city_id}: Operations team members for a city
    - incidents_{city_id}: Safety incident subscribers
    - demand_{city_id}: Demand metric subscribers
    """

    @sio.event
    async def operations_join(sid, data):
        """
        Join operations center for a city.
        
        Payload: {
            "city_id": "...",
            "user_id": "...",
            "role": "ops_manager|incident_commander|demand_planner"
        }
        """
        try:
            city_id = data.get("city_id")
            user_id = data.get("user_id")
            room = f"operations_{city_id}"
            
            sio.enter_room(sid, room)
            logger.info(f"User {user_id} joined operations center for {city_id}")
            
            # Notify team
            await sio.emit(
                "operations_user_joined",
                {
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "members_online": random.randint(3, 10)
                },
                room=room
            )
        except Exception as e:
            logger.error(f"Error in operations_join: {e}")

    @sio.event
    async def operations_leave(sid, data):
        """Leave operations center."""
        try:
            city_id = data.get("city_id")
            user_id = data.get("user_id")
            room = f"operations_{city_id}"
            
            sio.leave_room(sid, room)
            logger.info(f"User {user_id} left operations center for {city_id}")
            
            await sio.emit(
                "operations_user_left",
                {
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat()
                },
                room=room
            )
        except Exception as e:
            logger.error(f"Error in operations_leave: {e}")

    @sio.event
    async def incident_reported(sid, data):
        """
        New incident reported in real-time.
        
        Payload: {
            "city_id": "...",
            "incident_type": "sos_alert|accident|harassment|...",
            "severity": "critical|high|medium|low",
            "latitude": 12.97,
            "longitude": 77.59,
            "description": "..."
        }
        """
        try:
            city_id = data.get("city_id")
            room = f"operations_{city_id}"
            
            incident = {
                "incident_id": f"inc_{int(datetime.utcnow().timestamp())}",
                "incident_type": data.get("incident_type"),
                "severity": data.get("severity"),
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "description": data.get("description"),
                "reported_at": datetime.utcnow().isoformat(),
                "status": "active",
                "responders": []
            }
            
            logger.info(f"Incident reported in {city_id}: {incident['incident_id']}")
            
            # Broadcast to all ops team members
            await sio.emit(
                "incident_alert",
                incident,
                room=room
            )
            
            # Store in a mock incidents list (in production, use database)
            
        except Exception as e:
            logger.error(f"Error in incident_reported: {e}")

    @sio.event
    async def metrics_subscribe(sid, data):
        """
        Subscribe to live metrics updates.
        
        Payload: {
            "city_id": "...",
            "metrics": ["demand", "supply", "revenue", "safety"]
        }
        """
        try:
            city_id = data.get("city_id")
            metrics_types = data.get("metrics", [])
            
            room = f"metrics_{city_id}"
            sio.enter_room(sid, room)
            
            logger.info(f"Client subscribed to metrics for {city_id}: {metrics_types}")
            
            # Start sending metrics updates every 5 seconds
            asyncio.create_task(_send_metrics_updates(sio, room, city_id))
            
        except Exception as e:
            logger.error(f"Error in metrics_subscribe: {e}")

    @sio.event
    async def demand_forecast_subscribe(sid, data):
        """
        Subscribe to demand forecast updates.
        
        Payload: {
            "city_id": "...",
            "zones": ["zone_1", "zone_2"]
        }
        """
        try:
            city_id = data.get("city_id")
            zones = data.get("zones", [])
            
            room = f"demand_forecast_{city_id}"
            sio.enter_room(sid, room)
            
            logger.info(f"Client subscribed to demand forecast for {city_id}")
            
            # Start sending forecast updates every 30 seconds
            asyncio.create_task(_send_forecast_updates(sio, room, city_id))
            
        except Exception as e:
            logger.error(f"Error in demand_forecast_subscribe: {e}")

    @sio.event
    async def incident_acknowledge(sid, data):
        """
        Acknowledge an incident by operations team.
        
        Payload: {
            "city_id": "...",
            "incident_id": "...",
            "responder_id": "...",
            "notes": "..."
        }
        """
        try:
            city_id = data.get("city_id")
            incident_id = data.get("incident_id")
            responder_id = data.get("responder_id")
            
            room = f"operations_{city_id}"
            
            await sio.emit(
                "incident_acknowledged",
                {
                    "incident_id": incident_id,
                    "responder_id": responder_id,
                    "acknowledged_at": datetime.utcnow().isoformat()
                },
                room=room
            )
            
            logger.info(f"Incident {incident_id} acknowledged by {responder_id}")
            
        except Exception as e:
            logger.error(f"Error in incident_acknowledge: {e}")

    @sio.event
    async def activate_surge_pricing(sid, data):
        """
        Activate surge pricing for a zone.
        
        Payload: {
            "city_id": "...",
            "zone_id": "...",
            "surge_multiplier": 1.5,
            "duration_minutes": 30,
            "reason": "..."
        }
        """
        try:
            city_id = data.get("city_id")
            zone_id = data.get("zone_id")
            surge_multiplier = data.get("surge_multiplier", 1.5)
            
            room = f"operations_{city_id}"
            
            await sio.emit(
                "surge_activated",
                {
                    "zone_id": zone_id,
                    "surge_multiplier": surge_multiplier,
                    "activated_at": datetime.utcnow().isoformat(),
                    "duration_minutes": data.get("duration_minutes", 30)
                },
                room=room
            )
            
            logger.info(f"Surge pricing activated in {zone_id}: {surge_multiplier}x")
            
        except Exception as e:
            logger.error(f"Error in activate_surge_pricing: {e}")

    @sio.event
    async def send_driver_incentive(sid, data):
        """
        Send incentive notification to drivers.
        
        Payload: {
            "city_id": "...",
            "zone_id": "...",
            "incentive_amount": 100,
            "message": "..."
        }
        """
        try:
            city_id = data.get("city_id")
            zone_id = data.get("zone_id")
            
            room = f"drivers_{city_id}_{zone_id}"
            
            await sio.emit(
                "incentive_notification",
                {
                    "zone_id": zone_id,
                    "incentive_amount": data.get("incentive_amount"),
                    "message": data.get("message"),
                    "expires_at": (datetime.utcnow() + timedelta(hours=1)).isoformat()
                },
                room=room
            )
            
            logger.info(f"Incentive sent to {zone_id}")
            
        except Exception as e:
            logger.error(f"Error in send_driver_incentive: {e}")

    @sio.event
    async def safety_dispatch(sid, data):
        """
        Dispatch safety team to an incident.
        
        Payload: {
            "city_id": "...",
            "incident_id": "...",
            "team_id": "...",
            "latitude": 12.97,
            "longitude": 77.59
        }
        """
        try:
            city_id = data.get("city_id")
            incident_id = data.get("incident_id")
            team_id = data.get("team_id")
            
            room = f"safety_teams_{city_id}"
            
            await sio.emit(
                "dispatch_order",
                {
                    "incident_id": incident_id,
                    "latitude": data.get("latitude"),
                    "longitude": data.get("longitude"),
                    "priority": "high",
                    "dispatched_at": datetime.utcnow().isoformat()
                },
                room=room
            )
            
            # Also notify ops team
            await sio.emit(
                "safety_dispatch_sent",
                {
                    "incident_id": incident_id,
                    "team_id": team_id,
                    "dispatched_at": datetime.utcnow().isoformat()
                },
                room=f"operations_{city_id}"
            )
            
            logger.info(f"Safety team {team_id} dispatched for incident {incident_id}")
            
        except Exception as e:
            logger.error(f"Error in safety_dispatch: {e}")

    @sio.event
    async def driver_density_subscribe(sid, data):
        """
        Subscribe to driver density grid updates.
        
        Payload: {
            "city_id": "...",
            "refresh_interval_seconds": 30
        }
        """
        try:
            city_id = data.get("city_id")
            room = f"driver_density_{city_id}"
            
            sio.enter_room(sid, room)
            logger.info(f"Client subscribed to driver density for {city_id}")
            
            # Start sending density updates
            asyncio.create_task(_send_driver_density_updates(sio, room, city_id))
            
        except Exception as e:
            logger.error(f"Error in driver_density_subscribe: {e}")

    logger.info("Operations center Socket.IO events registered")


# ============================================================================
# BACKGROUND TASKS FOR PERIODIC UPDATES
# ============================================================================

async def _send_metrics_updates(sio, room: str, city_id: str):
    """Send live metrics updates every 5 seconds."""
    try:
        while True:
            await asyncio.sleep(5)
            
            metrics = {
                "timestamp": datetime.utcnow().isoformat(),
                "online_drivers": random.randint(200, 600),
                "active_rides": random.randint(50, 250),
                "waiting_passengers": random.randint(10, 50),
                "city_demand_score": random.randint(40, 95),
                "current_surge": random.choice([1.0, 1.2, 1.5, 1.8, 2.0]),
                "revenue_last_hour": round(random.uniform(50000, 100000), 2),
                "incidents_active": random.randint(0, 5)
            }
            
            await sio.emit("metrics_update", metrics, room=room)
            
    except Exception as e:
        logger.error(f"Error in metrics updates: {e}")


async def _send_forecast_updates(sio, room: str, city_id: str):
    """Send demand forecast updates every 30 seconds."""
    try:
        while True:
            await asyncio.sleep(30)
            
            forecast = {
                "timestamp": datetime.utcnow().isoformat(),
                "next_hour_demand": random.randint(40, 95),
                "next_2hour_demand": random.randint(40, 95),
                "next_4hour_demand": random.randint(40, 95),
                "confidence": random.choice([0.85, 0.87, 0.89, 0.91, 0.93]),
                "recommendations": [
                    "Increase driver incentives",
                    "Prepare surge pricing",
                    "Monitor peak zones"
                ]
            }
            
            await sio.emit("forecast_update", forecast, room=room)
            
    except Exception as e:
        logger.error(f"Error in forecast updates: {e}")


async def _send_driver_density_updates(sio, room: str, city_id: str):
    """Send driver density grid updates every 15 seconds."""
    try:
        while True:
            await asyncio.sleep(15)
            
            grid_cells = []
            for i in range(9):  # 3x3 grid
                grid_cells.append({
                    "grid_id": f"DENSITY_{i}",
                    "driver_count": random.randint(5, 30),
                    "demand_score": random.randint(30, 90),
                    "average_eta": random.randint(3, 12)
                })
            
            density_update = {
                "timestamp": datetime.utcnow().isoformat(),
                "grid_cells": grid_cells,
                "total_drivers": random.randint(150, 400)
            }
            
            await sio.emit("driver_density_update", density_update, room=room)
            
    except Exception as e:
        logger.error(f"Error in density updates: {e}")
