"""
Real-Time Messaging Models
MongoDB models for chat and messaging
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from bson import ObjectId


class Conversation(BaseModel):
    """Conversation between driver and passenger"""
    id: Optional[str] = Field(None, alias="_id")
    ride_id: str
    passenger_id: str
    driver_id: str
    participants: List[str]  # [passenger_id, driver_id]
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count_passenger: int = 0
    unread_count_driver: int = 0
    status: str = "active"  # active, archived, closed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class Message(BaseModel):
    """Individual chat message"""
    id: Optional[str] = Field(None, alias="_id")
    conversation_id: str
    sender_id: str
    sender_type: str  # passenger, driver
    message_type: str = "text"  # text, location, image, quick_reply
    content: str
    translated_content: Optional[Dict[str, str]] = None  # {lang: translated_text}
    location: Optional[Dict[str, float]] = None  # {lat, lng}
    metadata: Dict[str, Any] = Field(default_factory=dict)
    is_read: bool = False
    read_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class QuickReply(BaseModel):
    """Quick reply templates"""
    id: Optional[str] = Field(None, alias="_id")
    text: str
    translations: Dict[str, str] = Field(default_factory=dict)
    category: str  # arrival, waiting, location, general
    user_type: str  # passenger, driver, both
    usage_count: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class TypingIndicator(BaseModel):
    """Real-time typing indicator"""
    conversation_id: str
    user_id: str
    is_typing: bool
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class MessageReport(BaseModel):
    """Report inappropriate message"""
    id: Optional[str] = Field(None, alias="_id")
    message_id: str
    reported_by: str
    reason: str
    status: str = "pending"  # pending, reviewed, action_taken
    created_at: datetime = Field(default_factory=datetime.utcnow)
    reviewed_at: Optional[datetime] = None
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}
