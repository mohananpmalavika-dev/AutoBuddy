"""
Calendar Booking Router - REST API endpoints for Google Calendar integration
"""

import logging
import os
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from datetime import datetime, timedelta
from typing import Optional, List

from app.models.calendar_booking_models import (
    AutoBookingPreference,
    CalendarBooking,
    CalendarSyncResponse,
    MeetingAnalysisRequest,
    GoogleCalendarCredential
)
from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar_booking"])

# Dependencies
db = None
calendar_service = None


def set_dependencies(database, service):
    """Initialize router dependencies"""
    global db, calendar_service
    db = database
    calendar_service = service


@router.post("/oauth/authorize")
async def initiate_calendar_auth(request: Request):
    """
    Start Google Calendar OAuth flow
    Returns authorization URL for user to visit
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        flow = await calendar_service.get_auth_flow(user_id)
        auth_url, state = flow.authorization_url(
            access_type='offline',
            include_granted_scopes='true',
            state=user_id
        )
        
        # Store state for verification
        await db.oauth_states.insert_one({
            'user_id': user_id,
            'state': state,
            'created_at': datetime.utcnow(),
            'expires_at': datetime.utcnow() + timedelta(hours=1)
        })
        
        return {
            'authorization_url': auth_url,
            'state': state,
            'message': 'Please visit the authorization URL to connect your Google Calendar'
        }
    except Exception as e:
        logger.error(f"Failed to initiate calendar auth: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate authentication")


@router.get("/oauth/callback")
async def oauth_callback(code: str, state: str):
    """
    Handle Google OAuth callback
    Store credentials and redirect to success page
    """
    try:
        # Verify state
        state_doc = await db.oauth_states.find_one({'state': state})
        if not state_doc:
            raise HTTPException(status_code=400, detail="Invalid state parameter")
        
        user_id = state_doc['user_id']
        
        # In production, exchange code for credentials using google-auth library
        # This is simplified for demo
        credentials_dict = {
            'access_token': code,  # In production: exchange code for token
            'refresh_token': code,
            'expiry': (datetime.utcnow() + timedelta(hours=1)).isoformat()
        }
        
        # Store credentials
        success = await calendar_service.store_calendar_credentials(user_id, credentials_dict)
        
        if success:
            # Clean up state
            await db.oauth_states.delete_one({'state': state})
            
            return {
                'status': 'success',
                'message': 'Google Calendar successfully connected',
                'user_id': user_id
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to store credentials")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback failed: {e}")
        raise HTTPException(status_code=500, detail="OAuth callback failed")


@router.post("/preferences")
async def set_auto_booking_preferences(
    preferences: AutoBookingPreference,
    request: Request
):
    """
    Set or update auto-booking preferences for user
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        pref_dict = preferences.dict()
        pref_dict['user_id'] = user_id
        pref_dict['updated_at'] = datetime.utcnow()
        
        result = await db.auto_booking_preferences.update_one(
            {'user_id': user_id},
            {'$set': pref_dict},
            upsert=True
        )
        
        return {
            'status': 'success',
            'message': 'Preferences updated',
            'preferences': pref_dict
        }
    except Exception as e:
        logger.error(f"Failed to set preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to set preferences")


@router.get("/preferences")
async def get_auto_booking_preferences(request: Request):
    """
    Get current auto-booking preferences
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        prefs = await db.auto_booking_preferences.find_one({'user_id': user_id})
        
        if not prefs:
            # Return defaults
            return {
                'user_id': user_id,
                'enabled': False,
                'auto_book_threshold': 0.7,
                'preferred_ride_type': 'instant',
                'advance_booking_minutes': 30
            }
        
        return prefs
        
    except Exception as e:
        logger.error(f"Failed to get preferences: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve preferences")


@router.post("/sync-and-book")
async def sync_calendar_and_auto_book(request: Request):
    """
    Sync Google Calendar and auto-book rides based on preferences
    This is the main endpoint for calendar booking
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        # Get calendar credentials
        creds = await calendar_service.get_calendar_credentials(user_id)
        if not creds:
            raise HTTPException(
                status_code=400,
                detail="Google Calendar not connected. Please authorize first."
            )
        
        # Sync and book
        result = await calendar_service.sync_calendar_and_book_rides(user_id)
        
        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])
        
        return {
            'status': 'success',
            'synced_events': result.get('synced_events', 0),
            'auto_booked_count': result.get('auto_booked_count', 0),
            'skipped_events': result.get('skipped_events', 0),
            'bookings': result.get('bookings', []),
            'errors': result.get('errors', []),
            'sync_timestamp': result.get('sync_timestamp')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Calendar sync failed: {e}")
        raise HTTPException(status_code=500, detail="Calendar sync failed")


@router.get("/bookings")
async def get_calendar_bookings(
    request: Request,
    limit: int = Query(50, ge=1, le=100),
    status: Optional[str] = Query(None)
):
    """
    Get calendar bookings for user
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        query = {'user_id': user_id}
        if status:
            query['booking_status'] = status
        
        bookings = await db.calendar_bookings.find(query).sort(
            'event_start_time', -1
        ).limit(limit).to_list(length=limit)
        
        # Convert ObjectId to string
        for booking in bookings:
            booking['_id'] = str(booking['_id'])
            booking['user_id'] = str(booking['user_id'])
        
        return {
            'status': 'success',
            'count': len(bookings),
            'bookings': bookings
        }
        
    except Exception as e:
        logger.error(f"Failed to get bookings: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve bookings")


@router.get("/bookings/{booking_id}")
async def get_calendar_booking(booking_id: str, request: Request):
    """
    Get specific calendar booking details
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        from bson import ObjectId
        booking = await db.calendar_bookings.find_one({
            '_id': ObjectId(booking_id),
            'user_id': user_id
        })
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking['_id'] = str(booking['_id'])
        booking['user_id'] = str(booking['user_id'])
        
        return booking
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get booking: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve booking")


@router.delete("/bookings/{booking_id}")
async def cancel_calendar_booking(booking_id: str, request: Request):
    """
    Cancel a calendar booking (will also cancel the associated ride)
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        from bson import ObjectId
        # Check ownership
        booking = await db.calendar_bookings.find_one({
            '_id': ObjectId(booking_id),
            'user_id': user_id
        })
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Cancel the booking
        success = await calendar_service.cancel_calendar_booking(booking_id, user_id)
        
        if success:
            return {
                'status': 'success',
                'message': 'Booking cancelled',
                'booking_id': booking_id
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to cancel booking")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel booking: {e}")
        raise HTTPException(status_code=500, detail="Failed to cancel booking")


@router.post("/analyze-meeting")
async def analyze_meeting_for_transportation(
    request_data: MeetingAnalysisRequest,
    request: Request
):
    """
    Analyze a meeting to determine if transportation is needed
    Returns confidence score and recommendation
    """
    try:
        user_data = await get_current_user_from_request(request)
        
        # Analyze transportation need
        needs_transport, confidence, reason = await calendar_service.analyze_meeting_for_transportation(
            request_data.meeting_title,
            request_data.meeting_location
        )
        
        return {
            'meeting_title': request_data.meeting_title,
            'meeting_location': request_data.meeting_location,
            'needs_transportation': needs_transport,
            'confidence_score': confidence,
            'reason': reason,
            'recommendation': 'Book a ride' if needs_transport else 'No ride needed'
        }
        
    except Exception as e:
        logger.error(f"Failed to analyze meeting: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze meeting")


@router.get("/reminders")
async def get_meeting_reminders(request: Request):
    """
    Get reminders for upcoming meetings with booking status
    Shows meetings in next 24 hours
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        reminders = await calendar_service.get_upcoming_meetings_reminders(user_id)
        
        # Convert ObjectId to string
        for reminder in reminders:
            reminder['_id'] = str(reminder['_id'])
            reminder['user_id'] = str(reminder['user_id'])
        
        return {
            'status': 'success',
            'count': len(reminders),
            'reminders': reminders
        }
        
    except Exception as e:
        logger.error(f"Failed to get reminders: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve reminders")


@router.post("/check-calendar-connected")
async def check_calendar_connection(request: Request):
    """
    Check if user has connected Google Calendar
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        creds = await calendar_service.get_calendar_credentials(user_id)
        connected = creds is not None
        
        return {
            'connected': connected,
            'message': 'Google Calendar connected' if connected else 'Google Calendar not connected'
        }
        
    except Exception as e:
        logger.error(f"Failed to check connection: {e}")
        raise HTTPException(status_code=500, detail="Failed to check connection")


@router.post("/disconnect-calendar")
async def disconnect_calendar(request: Request):
    """
    Disconnect Google Calendar (revoke credentials)
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        # Delete credentials
        result = await db.calendar_credentials.delete_one({'user_id': user_id})
        
        # Disable auto-booking
        await db.auto_booking_preferences.update_one(
            {'user_id': user_id},
            {'$set': {'enabled': False}}
        )
        
        return {
            'status': 'success',
            'message': 'Google Calendar disconnected'
        }
        
    except Exception as e:
        logger.error(f"Failed to disconnect calendar: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect calendar")


@router.get("/stats")
async def get_calendar_booking_stats(request: Request):
    """
    Get calendar booking statistics for user
    """
    try:
        user_data = await get_current_user_from_request(request)
        user_id = str(user_data.get('_id'))
        
        from bson import ObjectId
        
        # Count bookings by status
        pipeline = [
            {'$match': {'user_id': user_id}},
            {'$group': {
                '_id': '$booking_status',
                'count': {'$sum': 1}
            }}
        ]
        
        status_counts = {}
        async for doc in db.calendar_bookings.aggregate(pipeline):
            status_counts[doc['_id']] = doc['count']
        
        total_bookings = sum(status_counts.values())
        
        return {
            'total_calendar_bookings': total_bookings,
            'bookings_by_status': status_counts,
            'auto_booking_enabled': bool(await db.auto_booking_preferences.find_one(
                {'user_id': user_id, 'enabled': True}
            ))
        }
        
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")
