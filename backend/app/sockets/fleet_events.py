"""
Socket.IO Event Handlers for Fleet Advanced Features
Implements real-time updates for KPIs, vehicle locations, and heatmaps
"""

import asyncio
import logging
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


def register_fleet_socket_events(sio):
    """
    Register Socket.IO event handlers for Fleet Portal real-time features.
    
    Events handled:
    - fleet_kpi_subscribe: Subscribe to KPI updates (30s interval)
    - vehicle_location_subscribe: Subscribe to vehicle location updates (10s interval)
    - heatmap_subscribe: Subscribe to heatmap updates (5m interval)
    - fleet_join: Connect client to fleet room
    - fleet_leave: Disconnect client from fleet room
    """
    
    # Store active subscriptions per fleet
    fleet_subscriptions: Dict[str, Dict[str, Any]] = {}
    
    @sio.on("fleet_join")
    async def on_fleet_join(sid, data):
        """
        Join a fleet's real-time channel.
        Clients should send: {"fleet_id": "...", "token": "..."}
        """
        try:
            fleet_id = data.get("fleet_id")
            token = data.get("token", "")
            
            if not fleet_id:
                await sio.emit("error", {"message": "fleet_id required"}, room=sid)
                return
            
            room_name = f"fleet_{fleet_id}"
            sio.enter_room(sid, room_name)
            
            logger.info(f"Client {sid} joined fleet room: {room_name}")
            await sio.emit("fleet_joined", {"fleet_id": fleet_id}, room=sid)
            
        except Exception as e:
            logger.error(f"Error in fleet_join: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.on("fleet_leave")
    async def on_fleet_leave(sid, data):
        """Leave a fleet's real-time channel."""
        try:
            fleet_id = data.get("fleet_id")
            if not fleet_id:
                return
            
            room_name = f"fleet_{fleet_id}"
            sio.leave_room(sid, room_name)
            logger.info(f"Client {sid} left fleet room: {room_name}")
            
        except Exception as e:
            logger.error(f"Error in fleet_leave: {e}")
    
    @sio.on("fleet_kpi_subscribe")
    async def on_kpi_subscribe(sid, data):
        """
        Subscribe to KPI updates for a fleet (30-second interval).
        Clients should send: {"fleet_id": "..."}
        """
        try:
            fleet_id = data.get("fleet_id")
            if not fleet_id:
                await sio.emit("error", {"message": "fleet_id required"}, room=sid)
                return
            
            sub_key = f"kpi_{fleet_id}"
            room_name = f"fleet_{fleet_id}"
            
            # Start KPI update task
            async def send_kpi_updates():
                while True:
                    try:
                        # Mock KPI data - replace with actual database queries
                        kpi_data = {
                            "fleet_id": fleet_id,
                            "total_revenue": 125000,
                            "active_drivers": 42,
                            "active_vehicles": 38,
                            "completed_rides": 856,
                            "average_rating": 4.7,
                            "health_score": 87,
                            "updated_at": get_ist_now().isoformat(),
                        }
                        
                        await sio.emit("fleet_kpi_update", kpi_data, room=room_name)
                        await asyncio.sleep(30)  # 30-second refresh
                        
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.error(f"Error sending KPI updates: {e}")
                        await asyncio.sleep(5)
            
            # Store subscription
            if sub_key not in fleet_subscriptions:
                fleet_subscriptions[sub_key] = {"task": None}
            
            # Cancel previous task if exists
            if fleet_subscriptions[sub_key]["task"]:
                fleet_subscriptions[sub_key]["task"].cancel()
            
            # Start new task
            task = asyncio.create_task(send_kpi_updates())
            fleet_subscriptions[sub_key]["task"] = task
            
            await sio.emit("kpi_subscribed", {"fleet_id": fleet_id}, room=sid)
            logger.info(f"Client {sid} subscribed to KPI updates for fleet {fleet_id}")
            
        except Exception as e:
            logger.error(f"Error in fleet_kpi_subscribe: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.on("vehicle_location_subscribe")
    async def on_location_subscribe(sid, data):
        """
        Subscribe to vehicle location updates for a fleet (10-second interval).
        Clients should send: {"fleet_id": "..."}
        """
        try:
            fleet_id = data.get("fleet_id")
            if not fleet_id:
                await sio.emit("error", {"message": "fleet_id required"}, room=sid)
                return
            
            sub_key = f"location_{fleet_id}"
            room_name = f"fleet_{fleet_id}"
            
            # Start location update task
            async def send_location_updates():
                while True:
                    try:
                        # Mock vehicle location data - replace with actual database queries
                        vehicles = [
                            {
                                "vehicle_id": f"V{i:03d}",
                                "latitude": 12.9716 + (i * 0.001),
                                "longitude": 77.5946 + (i * 0.001),
                                "speed": 35 + (i % 20),
                                "status": "active",
                                "driver_id": f"D{i:03d}",
                            }
                            for i in range(1, 39)  # 38 vehicles
                        ]
                        
                        location_data = {
                            "fleet_id": fleet_id,
                            "vehicles": vehicles,
                            "timestamp": get_ist_now().isoformat(),
                        }
                        
                        await sio.emit("vehicle_location_update", location_data, room=room_name)
                        await asyncio.sleep(10)  # 10-second refresh
                        
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.error(f"Error sending location updates: {e}")
                        await asyncio.sleep(5)
            
            # Store subscription
            if sub_key not in fleet_subscriptions:
                fleet_subscriptions[sub_key] = {"task": None}
            
            # Cancel previous task if exists
            if fleet_subscriptions[sub_key]["task"]:
                fleet_subscriptions[sub_key]["task"].cancel()
            
            # Start new task
            task = asyncio.create_task(send_location_updates())
            fleet_subscriptions[sub_key]["task"] = task
            
            await sio.emit("location_subscribed", {"fleet_id": fleet_id}, room=sid)
            logger.info(f"Client {sid} subscribed to vehicle locations for fleet {fleet_id}")
            
        except Exception as e:
            logger.error(f"Error in vehicle_location_subscribe: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.on("heatmap_subscribe")
    async def on_heatmap_subscribe(sid, data):
        """
        Subscribe to heatmap updates for a fleet (5-minute interval).
        Clients should send: {"fleet_id": "..."}
        """
        try:
            fleet_id = data.get("fleet_id")
            if not fleet_id:
                await sio.emit("error", {"message": "fleet_id required"}, room=sid)
                return
            
            sub_key = f"heatmap_{fleet_id}"
            room_name = f"fleet_{fleet_id}"
            
            # Start heatmap update task
            async def send_heatmap_updates():
                while True:
                    try:
                        # Mock heatmap grid data - replace with actual database queries
                        grid_cells = [
                            {
                                "grid_cell_id": f"GRID_{i:03d}",
                                "demand_score": 50 + (i % 50),
                                "ride_count": 100 + (i % 200),
                                "latitude": 12.9716 + (i // 10 * 0.01),
                                "longitude": 77.5946 + (i % 10 * 0.01),
                            }
                            for i in range(100)  # 100 grid cells
                        ]
                        
                        heatmap_data = {
                            "fleet_id": fleet_id,
                            "grid_cells": grid_cells,
                            "timestamp": get_ist_now().isoformat(),
                        }
                        
                        await sio.emit("heatmap_update", heatmap_data, room=room_name)
                        await asyncio.sleep(300)  # 5-minute refresh
                        
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.error(f"Error sending heatmap updates: {e}")
                        await asyncio.sleep(5)
            
            # Store subscription
            if sub_key not in fleet_subscriptions:
                fleet_subscriptions[sub_key] = {"task": None}
            
            # Cancel previous task if exists
            if fleet_subscriptions[sub_key]["task"]:
                fleet_subscriptions[sub_key]["task"].cancel()
            
            # Start new task
            task = asyncio.create_task(send_heatmap_updates())
            fleet_subscriptions[sub_key]["task"] = task
            
            await sio.emit("heatmap_subscribed", {"fleet_id": fleet_id}, room=sid)
            logger.info(f"Client {sid} subscribed to heatmap updates for fleet {fleet_id}")
            
        except Exception as e:
            logger.error(f"Error in heatmap_subscribe: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.on("disconnect")
    async def on_disconnect(sid):
        """Clean up subscriptions when client disconnects."""
        try:
            # Clean up all subscriptions for this client
            for sub_key, sub_data in fleet_subscriptions.items():
                if sub_data.get("task"):
                    sub_data["task"].cancel()
            
            logger.info(f"Client {sid} disconnected")
        except Exception as e:
            logger.error(f"Error in disconnect: {e}")


async def emit_fleet_kpi_update(sio, fleet_id: str, kpi_data: Dict[str, Any]) -> None:
    """
    Emit KPI update to all clients in a fleet room.
    """
    try:
        room_name = f"fleet_{fleet_id}"
        await sio.emit("fleet_kpi_update", kpi_data, room=room_name)
    except Exception as e:
        logger.error(f"Error emitting KPI update: {e}")


async def emit_vehicle_location_update(sio, fleet_id: str, vehicles: list) -> None:
    """
    Emit vehicle location update to all clients in a fleet room.
    """
    try:
        room_name = f"fleet_{fleet_id}"
        location_data = {
            "fleet_id": fleet_id,
            "vehicles": vehicles,
            "timestamp": get_ist_now().isoformat(),
        }
        await sio.emit("vehicle_location_update", location_data, room=room_name)
    except Exception as e:
        logger.error(f"Error emitting location update: {e}")


async def emit_heatmap_update(sio, fleet_id: str, grid_cells: list) -> None:
    """
    Emit heatmap update to all clients in a fleet room.
    """
    try:
        room_name = f"fleet_{fleet_id}"
        heatmap_data = {
            "fleet_id": fleet_id,
            "grid_cells": grid_cells,
            "timestamp": get_ist_now().isoformat(),
        }
        await sio.emit("heatmap_update", heatmap_data, room=room_name)
    except Exception as e:
        logger.error(f"Error emitting heatmap update: {e}")
