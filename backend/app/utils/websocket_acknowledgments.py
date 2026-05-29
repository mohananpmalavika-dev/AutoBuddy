"""
WebSocket Event Acknowledgments
Reliable event delivery with acknowledgment tracking
"""

import asyncio
import time
from typing import Optional, Callable, Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import uuid

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


@dataclass
class WebSocketEvent:
    """WebSocket event with acknowledgment tracking"""
    
    event_type: str
    data: Dict[str, Any]
    recipient_id: str
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=datetime.utcnow)
    priority: int = field(default=0)  # 0=normal, 1=high, 2=critical
    
    # Acknowledgment tracking
    acknowledged: bool = field(default=False)
    ack_timestamp: Optional[datetime] = field(default=None)
    retry_count: int = field(default=0)
    max_retries: int = field(default=3)
    
    # Metadata
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
            "priority": self.priority,
            "metadata": self.metadata
        }
    
    def is_expired(self, ttl_seconds: int = 300) -> bool:
        """Check if event has expired (default 5 minutes)"""
        expiration_time = self.timestamp + timedelta(seconds=ttl_seconds)
        return datetime.utcnow() > expiration_time


class AcknowledgmentTracker:
    """Track event acknowledgments"""
    
    def __init__(self, cleanup_interval: int = 60):
        self.pending_events: Dict[str, WebSocketEvent] = {}
        self.acknowledged_events: List[str] = []
        self.cleanup_interval = cleanup_interval
        self.last_cleanup = time.time()
    
    def add_pending_event(self, event: WebSocketEvent) -> str:
        """Add event to pending acknowledgments"""
        self.pending_events[event.event_id] = event
        
        logger.log_endpoint_request(
            endpoint="event_pending",
            status="tracking",
            metadata={
                "event_id": event.event_id,
                "event_type": event.event_type,
                "recipient": event.recipient_id
            }
        )
        
        return event.event_id
    
    def acknowledge_event(self, event_id: str) -> bool:
        """Mark event as acknowledged"""
        if event_id not in self.pending_events:
            logger.log_endpoint_request(
                endpoint="event_acknowledge",
                status="warning",
                metadata={"error": "Event not found", "event_id": event_id}
            )
            return False
        
        event = self.pending_events[event_id]
        event.acknowledged = True
        event.ack_timestamp = datetime.utcnow()
        
        self.acknowledged_events.append(event_id)
        
        logger.log_endpoint_request(
            endpoint="event_acknowledged",
            status="success",
            metadata={
                "event_id": event_id,
                "event_type": event.event_type,
                "retry_count": event.retry_count
            }
        )
        
        return True
    
    def get_unacknowledged_events(self, recipient_id: str) -> List[WebSocketEvent]:
        """Get all unacknowledged events for recipient"""
        return [
            event for event in self.pending_events.values()
            if not event.acknowledged and event.recipient_id == recipient_id
        ]
    
    def get_pending_event(self, event_id: str) -> Optional[WebSocketEvent]:
        """Get pending event by ID"""
        return self.pending_events.get(event_id)
    
    def cleanup_expired_events(self):
        """Remove expired events"""
        current_time = time.time()
        if current_time - self.last_cleanup < self.cleanup_interval:
            return
        
        expired_ids = [
            event_id for event_id, event in self.pending_events.items()
            if event.is_expired()
        ]
        
        for event_id in expired_ids:
            del self.pending_events[event_id]
        
        if expired_ids:
            logger.log_endpoint_request(
                endpoint="event_cleanup",
                status="success",
                metadata={"expired_count": len(expired_ids)}
            )
        
        self.last_cleanup = current_time
    
    def get_retry_events(self) -> List[WebSocketEvent]:
        """Get events that need retry"""
        self.cleanup_expired_events()
        
        retry_events = [
            event for event in self.pending_events.values()
            if not event.acknowledged and event.retry_count < event.max_retries
        ]
        
        return retry_events


class ReliableEventEmitter:
    """Emit events with acknowledgment and retry support"""
    
    def __init__(self, tracker: AcknowledgmentTracker = None):
        self.tracker = tracker or AcknowledgmentTracker()
        self.emit_callback: Optional[Callable] = None
        self.retry_delay = 2  # seconds
        self.max_retry_delay = 30  # seconds
    
    async def emit_with_ack(
        self,
        event_type: str,
        data: Dict[str, Any],
        recipient_id: str,
        priority: int = 0,
        metadata: Optional[Dict] = None,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Emit event and wait for acknowledgment
        
        Args:
            event_type: Type of event
            data: Event data
            recipient_id: ID of recipient
            priority: Event priority (0=normal, 1=high, 2=critical)
            metadata: Additional metadata
            timeout: Acknowledgment timeout in seconds
            
        Returns:
            Result dict with status and acknowledgment info
        """
        
        event = WebSocketEvent(
            event_type=event_type,
            data=data,
            recipient_id=recipient_id,
            priority=priority,
            metadata=metadata or {}
        )
        
        # Track pending event
        event_id = self.tracker.add_pending_event(event)
        
        # Emit event
        if self.emit_callback:
            await self.emit_callback(event)
        
        # Wait for acknowledgment
        start_time = time.time()
        while time.time() - start_time < timeout:
            if self.tracker.pending_events[event_id].acknowledged:
                return {
                    "status": "acknowledged",
                    "event_id": event_id,
                    "acknowledged_at": self.tracker.pending_events[event_id].ack_timestamp.isoformat(),
                    "delivery_time_ms": (time.time() - start_time) * 1000
                }
            
            await asyncio.sleep(0.1)
        
        # Timeout - event not acknowledged
        logger.log_endpoint_request(
            endpoint="event_ack_timeout",
            status="warning",
            metadata={
                "event_id": event_id,
                "event_type": event_type,
                "recipient": recipient_id,
                "timeout": timeout
            }
        )
        
        return {
            "status": "timeout",
            "event_id": event_id,
            "event_type": event_type,
            "delivery_time_ms": (time.time() - start_time) * 1000
        }
    
    async def emit_with_retry(
        self,
        event_type: str,
        data: Dict[str, Any],
        recipient_id: str,
        priority: int = 0,
        metadata: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Emit event with automatic retry on failure
        
        Returns result dict with final status
        """
        
        event = WebSocketEvent(
            event_type=event_type,
            data=data,
            recipient_id=recipient_id,
            priority=priority,
            metadata=metadata or {}
        )
        
        event_id = self.tracker.add_pending_event(event)
        
        while event.retry_count < event.max_retries:
            try:
                # Emit event
                if self.emit_callback:
                    await self.emit_callback(event)
                
                # Wait for acknowledgment
                for _ in range(30):  # 3 second timeout
                    if self.tracker.pending_events[event_id].acknowledged:
                        return {
                            "status": "acknowledged",
                            "event_id": event_id,
                            "retry_count": event.retry_count,
                            "success": True
                        }
                    await asyncio.sleep(0.1)
                
                # Acknowledgment not received, retry
                event.retry_count += 1
                
                if event.retry_count < event.max_retries:
                    delay = min(self.retry_delay * (2 ** event.retry_count), self.max_retry_delay)
                    logger.log_endpoint_request(
                        endpoint="event_retry",
                        status="retry",
                        metadata={
                            "event_id": event_id,
                            "retry_count": event.retry_count,
                            "delay_seconds": delay
                        }
                    )
                    await asyncio.sleep(delay)
            
            except Exception as e:
                event.retry_count += 1
                logger.log_endpoint_request(
                    endpoint="event_emit_error",
                    status="error",
                    metadata={
                        "event_id": event_id,
                        "error": str(e),
                        "retry_count": event.retry_count
                    }
                )
        
        return {
            "status": "failed",
            "event_id": event_id,
            "retry_count": event.retry_count,
            "success": False
        }


class EventQueueManager:
    """Manage event queues for users"""
    
    def __init__(self):
        self.user_queues: Dict[str, List[WebSocketEvent]] = {}
        self.tracker = AcknowledgmentTracker()
    
    def queue_event(
        self,
        user_id: str,
        event: WebSocketEvent
    ):
        """Queue event for user"""
        if user_id not in self.user_queues:
            self.user_queues[user_id] = []
        
        self.user_queues[user_id].append(event)
        self.tracker.add_pending_event(event)
        
        logger.log_endpoint_request(
            endpoint="event_queued",
            status="success",
            metadata={
                "user_id": user_id,
                "event_type": event.event_type,
                "queue_size": len(self.user_queues[user_id])
            }
        )
    
    def get_user_queue(self, user_id: str) -> List[WebSocketEvent]:
        """Get all queued events for user"""
        return self.user_queues.get(user_id, [])
    
    def clear_user_queue(self, user_id: str):
        """Clear queue for user"""
        if user_id in self.user_queues:
            del self.user_queues[user_id]
    
    def acknowledge_and_dequeue(self, user_id: str, event_id: str) -> bool:
        """Acknowledge event and remove from queue"""
        acknowledged = self.tracker.acknowledge_event(event_id)
        
        if acknowledged and user_id in self.user_queues:
            self.user_queues[user_id] = [
                e for e in self.user_queues[user_id] if e.event_id != event_id
            ]
        
        return acknowledged


# Singleton instances
_tracker = None
_emitter = None
_queue_manager = None


def get_acknowledgment_tracker() -> AcknowledgmentTracker:
    """Get or create tracker"""
    global _tracker
    if _tracker is None:
        _tracker = AcknowledgmentTracker()
    return _tracker


def get_event_emitter() -> ReliableEventEmitter:
    """Get or create emitter"""
    global _emitter
    if _emitter is None:
        _emitter = ReliableEventEmitter(get_acknowledgment_tracker())
    return _emitter


def get_queue_manager() -> EventQueueManager:
    """Get or create queue manager"""
    global _queue_manager
    if _queue_manager is None:
        _queue_manager = EventQueueManager()
    return _queue_manager
