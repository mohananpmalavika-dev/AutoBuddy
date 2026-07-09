"""
Messaging Schemas
Pydantic models for chat API
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Message types"""
    TEXT = "text"
    LOCATION = "location"
    IMAGE = "image"
    QUICK_REPLY = "quick_reply"


class SenderType(str, Enum):
    """Sender types"""
    PASSENGER = "passenger"
    DRIVER = "driver"


class ConversationStatus(str, Enum):
    """Conversation status"""
    ACTIVE = "active"
    ARCHIVED = "archived"
    CLOSED = "closed"


class SendMessageRequest(BaseModel):
    """Request to send a message"""
    conversation_id: str
    content: str
    message_type: MessageType = MessageType.TEXT
    location: Optional[Dict[str, float]] = Field(None, description="Location {lat, lng}")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class MessageResponse(BaseModel):
    """Message response"""
    id: str
    conversation_id: str
    sender_id: str
    sender_type: SenderType
    message_type: MessageType
    content: str
    translated_content: Optional[Dict[str, str]] = None
    location: Optional[Dict[str, float]] = None
    is_read: bool
    read_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    sent_at: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    """Conversation response"""
    id: str
    ride_id: str
    passenger_id: str
    driver_id: str
    participants: List[str]
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    status: ConversationStatus
    created_at: datetime
    updated_at: datetime


class ConversationListResponse(BaseModel):
    """List of conversations"""
    conversations: List[ConversationResponse]
    total: int
    unread_total: int


class MessageListResponse(BaseModel):
    """List of messages"""
    messages: List[MessageResponse]
    total: int
    conversation_id: str
    has_more: bool


class MarkAsReadRequest(BaseModel):
    """Mark messages as read"""
    message_ids: List[str]


class TypingStatusRequest(BaseModel):
    """Update typing status"""
    conversation_id: str
    is_typing: bool


class QuickReplyResponse(BaseModel):
    """Quick reply template"""
    id: str
    text: str
    translations: Dict[str, str]
    category: str
    
    class Config:
        from_attributes = True


class QuickRepliesListResponse(BaseModel):
    """List of quick replies"""
    quick_replies: List[QuickReplyResponse]
    total: int


class ReportMessageRequest(BaseModel):
    """Report a message"""
    message_id: str
    reason: str = Field(..., min_length=10, max_length=500)


class WebSocketEvent(BaseModel):
    """WebSocket event structure"""
    event: str  # message, typing, read, delivered
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
