"""Compatibility schemas for legacy booking tests and imports."""

from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class BookingCreate(BaseModel):
    passenger_id: Optional[str] = None
    pickup_location: Dict[str, Any] = Field(default_factory=dict)
    dropoff_location: Dict[str, Any] = Field(default_factory=dict)
    vehicle_type_id: Optional[str] = None
    vehicle_subtype_id: Optional[str] = None
    ride_type: str = "normal"
    estimated_fare: Optional[float] = None


__all__ = ["BookingCreate"]
