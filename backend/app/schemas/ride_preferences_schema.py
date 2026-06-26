"""
Ride Preferences Schema - Request/Response validation for passenger ride preferences
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional


class RidePreferencesRequest(BaseModel):
    """Request model for updating ride preferences"""
    ac_preference: str = Field(default="cool", description="AC temperature: cold, cool, warm, or hot")
    communication_level: str = Field(default="normal", description="Communication level: quiet, normal, or chatty")
    vehicle_type_preference: Optional[List[str]] = Field(default=None, description="Preferred vehicle types: auto, taxi, xl, etc.")

    @field_validator('ac_preference')
    @classmethod
    def validate_ac_preference(cls, v):
        allowed = ['cold', 'cool', 'warm', 'hot']
        if v not in allowed:
            raise ValueError(f'ac_preference must be one of {allowed}')
        return v

    @field_validator('communication_level')
    @classmethod
    def validate_communication_level(cls, v):
        allowed = ['quiet', 'normal', 'chatty']
        if v not in allowed:
            raise ValueError(f'communication_level must be one of {allowed}')
        return v

    @field_validator('vehicle_type_preference')
    @classmethod
    def validate_vehicle_types(cls, v):
        if v is None:
            return v
        allowed_types = ['auto', 'taxi', 'xl', 'sedan', 'suv', 'traveller']
        for vehicle_type in v:
            if vehicle_type not in allowed_types:
                raise ValueError(f'{vehicle_type} is not a valid vehicle type. Allowed: {allowed_types}')
        return v


class RidePreferencesResponse(BaseModel):
    """Response model for ride preferences"""
    passenger_id: str
    ac_preference: str
    communication_level: str
    vehicle_type_preference: Optional[List[str]]

    class Config:
        from_attributes = True


class RidePreferenceSummary(BaseModel):
    """Quick summary of active ride preferences for display"""
    music: str
    temperature: str
    communication: str
    vehicles: Optional[List[str]]
