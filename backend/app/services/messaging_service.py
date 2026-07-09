"""
Messaging Service Layer
Real-time chat and messaging operations
"""
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
import re

from app.database import get_database
from app.models.messaging import Conversation, Message, QuickReply, MessageReport


# Simple profanity filter (expand in production)
PROFANITY_WORDS = ['badword1', 'badword2', 'offensive']


class MessagingService:
    """Service for real-time messaging"""
    
    def __init__(self):
        self.db = get_database()
        self.conversations_collection = self.db["conversations"]
        self.messages_collection = self.db["messages"]
        self.quick_replies_collection = self.db["quick_replies"]
        self.reports_collection = self.db["message_reports"]
    
    async def get_or_create_conversation(
        self,
        ride_id: str,
        passenger_id: str,
        driver_id: str
    ) -> Conversation:
        """Get existing conversation or create new one for ride"""
        # Check if conversation exists
        existing = await self.conversations_collection.find_one({"ride_id": ride_id})
        
        if existing:
            existing["_id"] = str(existing["_id"])
            return Conversation(**existing)
        
        # Create new conversation
        conversation_data = {
            "ride_id": ride_id,
            "passenger_id": passenger_id,
            "driver_id": driver_id,
            "participants": [passenger_id, driver_id],
            "last_message": None,
            "last_message_at": None,
            "unread_count_passenger": 0,
            "unread_count_driver": 0,
            "status": "active",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await self.conversations_collection.insert_one(conversation_data)
        conversation_data["_id"] = str(result.inserted_id)
        
        return Conversation(**conversation_data)
    
    async def send_message(
        self,
        conversation_id: str,
        sender_id: str,
        sender_type: str,
        content: str,
        message_type: str = "text",
        location: Optional[Dict[str, float]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Message:
        """Send a message"""
        # Filter profanity
        filtered_content = self._filter_profanity(content)
        
        # Create message
        message_data = {
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "sender_type": sender_type,
            "message_type": message_type,
            "content": filtered_content,
            "location": location,
            "metadata": metadata or {},
            "is_read": False,
            "read_at": None,
            "delivered_at": None,
            "sent_at": datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        
        result = await self.messages_collection.insert_one(message_data)
        message_data["_id"] = str(result.inserted_id)
        
        # Update conversation
        await self._update_conversation(
            conversation_id,
            filtered_content,
            sender_type
        )
        
        return Message(**message_data)
    
    def _filter_profanity(self, text: str) -> str:
        """Filter profanity from message"""
        filtered = text
        for word in PROFANITY_WORDS:
            pattern = re.compile(re.escape(word), re.IGNORECASE)
            filtered = pattern.sub('*' * len(word), filtered)
        return filtered
    
    async def _update_conversation(
        self,
        conversation_id: str,
        last_message: str,
        sender_type: str
    ):
        """Update conversation with last message"""
        update_data = {
            "last_message": last_message[:100],  # Truncate
            "last_message_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        # Increment unread count for recipient
        if sender_type == "passenger":
            update_data["$inc"] = {"unread_count_driver": 1}
        else:
            update_data["$inc"] = {"unread_count_passenger": 1}
        
        await self.conversations_collection.update_one(
            {"_id": ObjectId(conversation_id)},
            {"$set": update_data} if "$inc" not in update_data else {
                "$set": {k: v for k, v in update_data.items() if k != "$inc"},
                "$inc": update_data["$inc"]
            }
        )
    
    async def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        """Get conversation by ID"""
        conversation = await self.conversations_collection.find_one(
            {"_id": ObjectId(conversation_id)}
        )
        
        if conversation:
            conversation["_id"] = str(conversation["_id"])
            return Conversation(**conversation)
        return None
    
    async def get_user_conversations(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[Conversation], int, int]:
        """Get all conversations for user"""
        query = {"participants": user_id, "status": "active"}
        
        total = await self.conversations_collection.count_documents(query)
        
        cursor = self.conversations_collection.find(query).sort(
            "last_message_at", -1
        ).skip(offset).limit(limit)
        
        conversations = []
        unread_total = 0
        
        async for conv in cursor:
            conv["_id"] = str(conv["_id"])
            conversations.append(Conversation(**conv))
            
            # Calculate unread for this user
            if conv["passenger_id"] == user_id:
                unread_total += conv.get("unread_count_passenger", 0)
            else:
                unread_total += conv.get("unread_count_driver", 0)
        
        return conversations, total, unread_total
    
    async def get_messages(
        self,
        conversation_id: str,
        limit: int = 50,
        before_message_id: Optional[str] = None
    ) -> tuple[List[Message], int, bool]:
        """Get messages in a conversation"""
        query = {"conversation_id": conversation_id}
        
        if before_message_id:
            # Pagination: get messages before this ID
            before_message = await self.messages_collection.find_one(
                {"_id": ObjectId(before_message_id)}
            )
            if before_message:
                query["created_at"] = {"$lt": before_message["created_at"]}
        
        total = await self.messages_collection.count_documents(
            {"conversation_id": conversation_id}
        )
        
        cursor = self.messages_collection.find(query).sort(
            "created_at", -1
        ).limit(limit + 1)  # Get one extra to check if more exist
        
        messages = []
        async for msg in cursor:
            if len(messages) < limit:
                msg["_id"] = str(msg["_id"])
                messages.append(Message(**msg))
        
        has_more = len(messages) == limit + 1
        if has_more:
            messages = messages[:limit]
        
        # Reverse to chronological order
        messages.reverse()
        
        return messages, total, has_more
    
    async def mark_as_read(
        self,
        message_ids: List[str],
        reader_id: str
    ):
        """Mark messages as read"""
        now = datetime.utcnow()
        
        # Update messages
        result = await self.messages_collection.update_many(
            {
                "_id": {"$in": [ObjectId(mid) for mid in message_ids]},
                "sender_id": {"$ne": reader_id},  # Don't mark own messages
                "is_read": False
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": now
                }
            }
        )
        
        # Update conversation unread count
        if result.modified_count > 0:
            # Get conversation IDs
            messages = await self.messages_collection.find(
                {"_id": {"$in": [ObjectId(mid) for mid in message_ids]}}
            ).to_list(length=None)
            
            conversation_ids = set(msg["conversation_id"] for msg in messages)
            
            for conv_id in conversation_ids:
                # Recalculate unread count
                unread_count = await self.messages_collection.count_documents({
                    "conversation_id": conv_id,
                    "sender_id": {"$ne": reader_id},
                    "is_read": False
                })
                
                # Determine which counter to update
                conversation = await self.conversations_collection.find_one(
                    {"_id": ObjectId(conv_id)}
                )
                
                if conversation:
                    if conversation["passenger_id"] == reader_id:
                        await self.conversations_collection.update_one(
                            {"_id": ObjectId(conv_id)},
                            {"$set": {"unread_count_passenger": unread_count}}
                        )
                    else:
                        await self.conversations_collection.update_one(
                            {"_id": ObjectId(conv_id)},
                            {"$set": {"unread_count_driver": unread_count}}
                        )
        
        return result.modified_count
    
    async def mark_as_delivered(self, message_id: str):
        """Mark message as delivered"""
        await self.messages_collection.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {"delivered_at": datetime.utcnow()}}
        )
    
    async def get_quick_replies(
        self,
        user_type: str = "both",
        category: Optional[str] = None
    ) -> List[QuickReply]:
        """Get quick reply templates"""
        query = {
            "is_active": True,
            "$or": [
                {"user_type": user_type},
                {"user_type": "both"}
            ]
        }
        
        if category:
            query["category"] = category
        
        cursor = self.quick_replies_collection.find(query).sort("usage_count", -1)
        
        quick_replies = []
        async for qr in cursor:
            qr["_id"] = str(qr["_id"])
            quick_replies.append(QuickReply(**qr))
        
        return quick_replies
    
    async def report_message(
        self,
        message_id: str,
        reported_by: str,
        reason: str
    ):
        """Report inappropriate message"""
        report_data = {
            "message_id": message_id,
            "reported_by": reported_by,
            "reason": reason,
            "status": "pending",
            "created_at": datetime.utcnow()
        }
        
        result = await self.reports_collection.insert_one(report_data)
        return str(result.inserted_id)
    
    async def delete_old_messages(self, days: int = 90):
        """Delete messages older than specified days (cron job)"""
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        result = await self.messages_collection.delete_many({
            "created_at": {"$lt": cutoff_date}
        })
        
        return result.deleted_count
    
    async def archive_closed_conversations(self):
        """Archive conversations for completed rides (cron job)"""
        # This would check ride status and archive conversations
        # Implementation depends on ride lifecycle
        pass
