"""
Messaging Router
Real-time chat API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from typing import List, Optional, Dict
import json

from app.schemas.messaging import (
    SendMessageRequest,
    MessageResponse,
    ConversationResponse,
    ConversationListResponse,
    MessageListResponse,
    MarkAsReadRequest,
    TypingStatusRequest,
    QuickRepliesListResponse,
    ReportMessageRequest,
    WebSocketEvent
)
from app.services.messaging_service import MessagingService
from app.middleware.auth import get_current_user

router = APIRouter(prefix="/api/v1/messages", tags=["messaging"])
messaging_service = MessagingService()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
    
    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
    
    async def send_personal_message(self, user_id: str, message: dict):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except Exception:
                self.disconnect(user_id)

manager = ConnectionManager()


# REST API Endpoints

@router.post("/send", response_model=MessageResponse)
async def send_message(
    message: SendMessageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Send a message in a conversation"""
    # Get conversation to verify participant
    conversation = await messaging_service.get_conversation(message.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if current_user["id"] not in conversation.participants:
        raise HTTPException(status_code=403, detail="Not a participant")
    
    # Determine sender type
    sender_type = "passenger" if current_user["id"] == conversation.passenger_id else "driver"
    
    # Send message
    new_message = await messaging_service.send_message(
        conversation_id=message.conversation_id,
        sender_id=current_user["id"],
        sender_type=sender_type,
        content=message.content,
        message_type=message.message_type.value,
        location=message.location,
        metadata=message.metadata
    )
    
    # Broadcast via WebSocket
    recipient_id = conversation.driver_id if sender_type == "passenger" else conversation.passenger_id
    await manager.send_personal_message(recipient_id, {
        "event": "message",
        "data": {
            "message_id": new_message.id,
            "conversation_id": new_message.conversation_id,
            "sender_id": new_message.sender_id,
            "content": new_message.content,
            "message_type": new_message.message_type,
            "sent_at": new_message.sent_at.isoformat()
        }
    })
    
    return MessageResponse(**new_message.model_dump())


@router.get("/conversations", response_model=ConversationListResponse)
async def get_conversations(
    limit: int = 20,
    offset: int = 0,
    current_user: dict = Depends(get_current_user)
):
    """Get all conversations for current user"""
    conversations, total, unread_total = await messaging_service.get_user_conversations(
        user_id=current_user["id"],
        limit=limit,
        offset=offset
    )
    
    conversation_responses = [
        ConversationResponse(**conv.model_dump()) for conv in conversations
    ]
    
    return ConversationListResponse(
        conversations=conversation_responses,
        total=total,
        unread_total=unread_total
    )


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific conversation"""
    conversation = await messaging_service.get_conversation(conversation_id)
    
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if current_user["id"] not in conversation.participants:
        raise HTTPException(status_code=403, detail="Not a participant")
    
    return ConversationResponse(**conversation.model_dump())


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
async def get_messages(
    conversation_id: str,
    limit: int = 50,
    before: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages in a conversation"""
    # Verify participant
    conversation = await messaging_service.get_conversation(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    if current_user["id"] not in conversation.participants:
        raise HTTPException(status_code=403, detail="Not a participant")
    
    messages, total, has_more = await messaging_service.get_messages(
        conversation_id=conversation_id,
        limit=limit,
        before_message_id=before
    )
    
    message_responses = [MessageResponse(**msg.model_dump()) for msg in messages]
    
    return MessageListResponse(
        messages=message_responses,
        total=total,
        conversation_id=conversation_id,
        has_more=has_more
    )


@router.post("/mark-read")
async def mark_messages_as_read(
    request: MarkAsReadRequest,
    current_user: dict = Depends(get_current_user)
):
    """Mark messages as read"""
    count = await messaging_service.mark_as_read(
        message_ids=request.message_ids,
        reader_id=current_user["id"]
    )
    
    return {"marked_read": count}


@router.get("/quick-replies", response_model=QuickRepliesListResponse)
async def get_quick_replies(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get quick reply templates"""
    # Determine user type from context (passenger/driver)
    user_type = current_user.get("role", "passenger")
    
    quick_replies = await messaging_service.get_quick_replies(
        user_type=user_type,
        category=category
    )
    
    return QuickRepliesListResponse(
        quick_replies=quick_replies,
        total=len(quick_replies)
    )


@router.post("/report")
async def report_message(
    request: ReportMessageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Report an inappropriate message"""
    report_id = await messaging_service.report_message(
        message_id=request.message_id,
        reported_by=current_user["id"],
        reason=request.reason
    )
    
    return {"report_id": report_id, "status": "submitted"}


# WebSocket Endpoint

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket connection for real-time messaging
    
    Connect: ws://localhost:8000/api/v1/messages/ws?token=JWT_TOKEN
    
    Events:
    - message: New message received
    - typing: User is typing
    - read: Message was read
    - delivered: Message was delivered
    """
    # Verify token (simplified - use proper auth in production)
    try:
        # This should validate JWT and extract user_id
        # For now, using simplified approach
        user_id = token  # Replace with actual JWT validation
        
        await manager.connect(user_id, websocket)
        
        try:
            while True:
                # Receive data from client
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                event_type = message_data.get("event")
                event_data = message_data.get("data", {})
                
                if event_type == "typing":
                    # Broadcast typing indicator
                    conversation_id = event_data.get("conversation_id")
                    is_typing = event_data.get("is_typing", False)
                    
                    # Get recipient
                    conversation = await messaging_service.get_conversation(conversation_id)
                    if conversation:
                        recipient_id = (
                            conversation.driver_id if user_id == conversation.passenger_id
                            else conversation.passenger_id
                        )
                        
                        await manager.send_personal_message(recipient_id, {
                            "event": "typing",
                            "data": {
                                "conversation_id": conversation_id,
                                "user_id": user_id,
                                "is_typing": is_typing
                            }
                        })
                
                elif event_type == "ping":
                    # Keep-alive ping
                    await websocket.send_json({"event": "pong"})
        
        except WebSocketDisconnect:
            manager.disconnect(user_id)
    
    except Exception as e:
        await websocket.close(code=1008, reason=str(e))
