"""
WebSocket Event Handlers for Real-time Feature Updates
Emits events for all 10 features to connected clients
"""

from socketio import AsyncServer, ASGIApp
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

# Initialize Socket.IO server
sio = AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=False
)

# Track connected passengers
connected_passengers: Dict[str, List[str]] = {}  # passenger_id -> [socket_ids]


# ============================================================================
# Connection Management
# ============================================================================

@sio.event
async def connect(sid, environ):
    """Handle client connection"""
    logger.info(f"Client connected: {sid}")
    return True


@sio.event
async def disconnect(sid):
    """Handle client disconnection"""
    # Remove from all passenger lists
    for passenger_id in list(connected_passengers.keys()):
        if sid in connected_passengers[passenger_id]:
            connected_passengers[passenger_id].remove(sid)
            if not connected_passengers[passenger_id]:
                del connected_passengers[passenger_id]
    
    logger.info(f"Client disconnected: {sid}")


@sio.event
async def register_passenger(sid, data):
    """Register socket with passenger ID"""
    passenger_id = data.get("passenger_id")
    
    if passenger_id:
        if passenger_id not in connected_passengers:
            connected_passengers[passenger_id] = []
        
        if sid not in connected_passengers[passenger_id]:
            connected_passengers[passenger_id].append(sid)
        
        logger.info(f"Passenger {passenger_id} registered with socket {sid}")
        return {"status": "registered", "passenger_id": passenger_id}
    
    return {"status": "error", "message": "Missing passenger_id"}


# ============================================================================
# Feature #2: Ratings Events
# ============================================================================

async def emit_rating_submitted(passenger_id: str, rating_data: dict):
    """Emit when a rating is submitted"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'rating_submitted',
            {
                'rating_id': rating_data.get('id'),
                'driver_id': rating_data.get('driver_id'),
                'score': rating_data.get('score'),
                'feedback': rating_data.get('feedback'),
                'timestamp': rating_data.get('timestamp')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted rating_submitted to passenger {passenger_id}")


async def emit_rating_received(driver_id: str, rating_data: dict):
    """Emit when driver receives a rating"""
    # Emit to all passengers following this driver
    for passenger_id, sockets in connected_passengers.items():
        await sio.emit(
            'rating_received',
            {
                'driver_id': driver_id,
                'new_rating': rating_data.get('score'),
                'review_count': rating_data.get('total_ratings', 0)
            },
            to=sockets
        )


# ============================================================================
# Feature #3: Saved Places Events
# ============================================================================

async def emit_saved_place_created(passenger_id: str, place_data: dict):
    """Emit when a saved place is created"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'saved_place_created',
            {
                'place_id': place_data.get('id'),
                'name': place_data.get('name'),
                'address': place_data.get('address'),
                'place_type': place_data.get('place_type'),
                'is_favorite': place_data.get('is_favorite')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted saved_place_created to passenger {passenger_id}")


async def emit_saved_place_removed(passenger_id: str, place_id: str):
    """Emit when a saved place is removed"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'saved_place_removed',
            {'place_id': place_id},
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #4: Preferences Events
# ============================================================================

async def emit_preferences_updated(passenger_id: str, preferences: dict):
    """Emit when preferences are updated"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'preferences_updated',
            {
                'language': preferences.get('language'),
                'push_notifications': preferences.get('push_notifications'),
                'default_payment_method': preferences.get('default_payment_method'),
                'updated_at': preferences.get('updated_at')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted preferences_updated to passenger {passenger_id}")


# ============================================================================
# Feature #5: Scheduled Rides Events
# ============================================================================

async def emit_scheduled_ride_created(passenger_id: str, ride_data: dict):
    """Emit when a ride is scheduled"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'scheduled_ride_created',
            {
                'ride_id': ride_data.get('id'),
                'pickup_location': ride_data.get('pickup_location'),
                'dropoff_location': ride_data.get('dropoff_location'),
                'scheduled_time': ride_data.get('scheduled_time'),
                'ride_type': ride_data.get('ride_type'),
                'estimated_fare': ride_data.get('estimated_fare')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted scheduled_ride_created to passenger {passenger_id}")


async def emit_scheduled_ride_confirmed(passenger_id: str, ride_id: str, driver_info: dict):
    """Emit when a scheduled ride is matched with driver"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'scheduled_ride_confirmed',
            {
                'ride_id': ride_id,
                'driver_id': driver_info.get('driver_id'),
                'driver_name': driver_info.get('name'),
                'driver_rating': driver_info.get('rating'),
                'vehicle_info': driver_info.get('vehicle_info'),
                'eta': driver_info.get('eta')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted scheduled_ride_confirmed to passenger {passenger_id}")


async def emit_scheduled_ride_cancelled(passenger_id: str, ride_id: str, reason: str = ""):
    """Emit when a scheduled ride is cancelled"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'scheduled_ride_cancelled',
            {
                'ride_id': ride_id,
                'reason': reason,
                'cancelled_at': datetime.utcnow().isoformat()
            },
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #6: Payment Events
# ============================================================================

async def emit_payment_method_added(passenger_id: str, method_data: dict):
    """Emit when a payment method is added"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'payment_method_added',
            {
                'method_id': method_data.get('id'),
                'method_type': method_data.get('method_type'),
                'card_brand': method_data.get('card_brand'),
                'is_default': method_data.get('is_default')
            },
            to=connected_passengers[passenger_id]
        )


async def emit_wallet_credited(passenger_id: str, transaction_data: dict):
    """Emit when wallet is credited"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'wallet_credited',
            {
                'amount': transaction_data.get('amount'),
                'description': transaction_data.get('description'),
                'new_balance': transaction_data.get('balance_after'),
                'transaction_id': transaction_data.get('id'),
                'timestamp': transaction_data.get('created_at')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted wallet_credited to passenger {passenger_id}")


async def emit_wallet_debited(passenger_id: str, transaction_data: dict):
    """Emit when wallet is debited (ride completed)"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'wallet_debited',
            {
                'amount': transaction_data.get('amount'),
                'description': transaction_data.get('description'),
                'new_balance': transaction_data.get('balance_after'),
                'booking_id': transaction_data.get('booking_id'),
                'timestamp': transaction_data.get('created_at')
            },
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #7: Favorites Events
# ============================================================================

async def emit_favorite_driver_added(passenger_id: str, driver_id: str, driver_name: str):
    """Emit when a driver is added to favorites"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'favorite_driver_added',
            {
                'driver_id': driver_id,
                'driver_name': driver_name
            },
            to=connected_passengers[passenger_id]
        )


async def emit_emergency_contact_added(passenger_id: str, contact_data: dict):
    """Emit when emergency contact is added"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'emergency_contact_added',
            {
                'contact_id': contact_data.get('id'),
                'contact_name': contact_data.get('contact_name'),
                'relation': contact_data.get('relation'),
                'is_primary': contact_data.get('is_primary')
            },
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #8: Promo Codes Events
# ============================================================================

async def emit_promo_code_applied(passenger_id: str, promo_data: dict):
    """Emit when a promo code is applied"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'promo_code_applied',
            {
                'code': promo_data.get('code'),
                'discount_amount': promo_data.get('discount_amount'),
                'discount_type': promo_data.get('discount_type'),
                'booking_id': promo_data.get('booking_id')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted promo_code_applied to passenger {passenger_id}")


async def emit_new_promo_available(passenger_id: str, promo_data: dict):
    """Emit when a new promotional offer becomes available"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'new_promo_available',
            {
                'code': promo_data.get('code'),
                'discount_value': promo_data.get('discount_value'),
                'description': promo_data.get('description'),
                'valid_until': promo_data.get('valid_until')
            },
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #9: Support Tickets Events
# ============================================================================

async def emit_support_ticket_created(passenger_id: str, ticket_data: dict):
    """Emit when support ticket is created"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'support_ticket_created',
            {
                'ticket_id': ticket_data.get('id'),
                'subject': ticket_data.get('subject'),
                'category': ticket_data.get('category'),
                'status': ticket_data.get('status'),
                'priority': ticket_data.get('priority')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted support_ticket_created to passenger {passenger_id}")


async def emit_support_ticket_message(passenger_id: str, ticket_id: str, message_data: dict):
    """Emit when support agent responds to ticket"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'support_ticket_message',
            {
                'ticket_id': ticket_id,
                'sender_type': message_data.get('sender_type'),
                'sender_name': message_data.get('sender_name'),
                'message_text': message_data.get('message_text'),
                'created_at': message_data.get('created_at')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted support_ticket_message to passenger {passenger_id}")


async def emit_support_ticket_resolved(passenger_id: str, ticket_id: str):
    """Emit when support ticket is resolved"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'support_ticket_resolved',
            {
                'ticket_id': ticket_id,
                'resolved_at': datetime.utcnow().isoformat()
            },
            to=connected_passengers[passenger_id]
        )


# ============================================================================
# Feature #10: Accessibility Events
# ============================================================================

async def emit_accessibility_settings_updated(passenger_id: str, settings: dict):
    """Emit when accessibility settings are updated"""
    if passenger_id in connected_passengers:
        await sio.emit(
            'accessibility_settings_updated',
            {
                'text_size': settings.get('text_size'),
                'high_contrast': settings.get('high_contrast'),
                'screen_reader_enabled': settings.get('screen_reader_enabled'),
                'voice_guidance': settings.get('voice_guidance'),
                'updated_at': settings.get('updated_at')
            },
            to=connected_passengers[passenger_id]
        )
        logger.info(f"Emitted accessibility_settings_updated to passenger {passenger_id}")


# ============================================================================
# Broadcast Events (for admin/system notifications)
# ============================================================================

async def broadcast_system_maintenance(message: str):
    """Broadcast system maintenance notice to all passengers"""
    await sio.emit(
        'system_maintenance',
        {
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
    )


async def broadcast_service_alert(alert_type: str, message: str):
    """Broadcast service alert to all passengers"""
    await sio.emit(
        'service_alert',
        {
            'alert_type': alert_type,  # "warning", "info", "error"
            'message': message,
            'timestamp': datetime.utcnow().isoformat()
        }
    )


# ============================================================================
# Health Check & Diagnostics
# ============================================================================

async def get_connection_stats():
    """Get connection statistics"""
    total_passengers = len(connected_passengers)
    total_connections = sum(len(sockets) for sockets in connected_passengers.values())
    
    return {
        'total_passengers_connected': total_passengers,
        'total_socket_connections': total_connections,
        'timestamp': datetime.utcnow().isoformat()
    }


# Import at the end to avoid circular imports
from datetime import datetime
