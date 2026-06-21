"""
Calendar Booking Service - Core logic for Google Calendar integration and auto-booking
"""

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
import json
import aiohttp
from bson import ObjectId

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.exceptions import RefreshError
import googleapiclient.discovery

import re
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# Google API Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/calendar/oauth/callback")
SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email'
]


class CalendarBookingService:
    """Service for Google Calendar integration and automatic booking"""
    
    def __init__(self, db, ride_service):
        """
        Initialize calendar service
        Args:
            db: MongoDB database connection
            ride_service: Ride booking service
        """
        self.db = db
        self.ride_service = ride_service
        self.geocoding_cache = {}
    
    async def get_auth_flow(self, user_id: str) -> Flow:
        """Create OAuth flow for Google Calendar"""
        flow = Flow.from_client_secrets_file(
            'credentials.json',
            scopes=SCOPES,
            redirect_uri=GOOGLE_REDIRECT_URI,
            state=user_id
        )
        return flow
    
    async def store_calendar_credentials(
        self,
        user_id: str,
        credentials_dict: Dict[str, Any]
    ) -> bool:
        """Store Google Calendar credentials securely"""
        try:
            creds_data = {
                'user_id': user_id,
                'access_token': credentials_dict.get('access_token'),
                'refresh_token': credentials_dict.get('refresh_token'),
                'token_expiry': datetime.fromisoformat(credentials_dict.get('expiry', datetime.utcnow().isoformat())),
                'calendar_id': 'primary',
                'created_at': datetime.utcnow()
            }
            
            result = await self.db.calendar_credentials.update_one(
                {'user_id': user_id},
                {'$set': creds_data},
                upsert=True
            )
            
            logger.info(f"Calendar credentials stored for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to store calendar credentials: {e}")
            return False
    
    async def get_calendar_credentials(self, user_id: str) -> Optional[Credentials]:
        """Retrieve and refresh Google Calendar credentials"""
        try:
            cred_doc = await self.db.calendar_credentials.find_one({'user_id': user_id})
            if not cred_doc:
                return None
            
            # Check if token needs refresh
            expiry = cred_doc.get('token_expiry')
            if expiry and datetime.fromisoformat(str(expiry)) < datetime.utcnow():
                logger.info(f"Refreshing calendar credentials for user {user_id}")
                # Token refresh logic would go here
            
            return cred_doc
        except Exception as e:
            logger.error(f"Failed to retrieve calendar credentials: {e}")
            return None
    
    async def fetch_calendar_events(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Fetch calendar events from Google Calendar
        Args:
            user_id: User ID
            start_date: Start date for event fetch
            end_date: End date for event fetch
            limit: Maximum events to fetch
        Returns:
            List of calendar events
        """
        try:
            cred_doc = await self.get_calendar_credentials(user_id)
            if not cred_doc:
                logger.warning(f"No calendar credentials for user {user_id}")
                return []
            
            # In production, use actual Google API credentials
            # This is a mock implementation for now
            events = await self._mock_fetch_events(user_id, start_date, end_date, limit)
            return events
            
        except Exception as e:
            logger.error(f"Failed to fetch calendar events: {e}")
            return []
    
    async def _mock_fetch_events(
        self,
        user_id: str,
        start_date: datetime,
        end_date: datetime,
        limit: int
    ) -> List[Dict[str, Any]]:
        """Mock calendar event fetching for demo"""
        # In production, this would call Google Calendar API
        events = []
        
        # Fetch from database
        db_events = await self.db.calendar_events.find({
            'user_id': user_id,
            'start_time': {'$gte': start_date, '$lte': end_date}
        }).limit(limit).to_list(length=limit)
        
        return db_events if db_events else []
    
    async def analyze_meeting_for_transportation(
        self,
        meeting_title: str,
        meeting_location: str,
        user_home_location: Optional[str] = None
    ) -> Tuple[bool, float, str]:
        """
        Analyze if a meeting requires transportation
        Uses NLP and heuristics to determine transportation need
        
        Args:
            meeting_title: Title of the meeting
            meeting_location: Location mentioned in the meeting
            user_home_location: User's primary location
            
        Returns:
            (needs_transport, confidence_score, reason)
        """
        
        # Keywords that suggest transportation need
        travel_keywords = [
            'office', 'meeting', 'conference', 'event', 'location',
            'venue', 'address', 'building', 'center', 'park',
            'hotel', 'airport', 'station', 'mall', 'market'
        ]
        
        exclude_keywords = [
            'call', 'zoom', 'video', 'phone', 'virtual', 'online',
            'webinar', 'hangout', 'remote', 'home', 'bed'
        ]
        
        title_lower = meeting_title.lower()
        location_lower = meeting_location.lower()
        
        # Check for exclusion keywords (virtual meetings)
        for keyword in exclude_keywords:
            if keyword in title_lower or keyword in location_lower:
                return False, 0.1, f"Virtual meeting detected: {keyword}"
        
        # Check for location specificity
        has_specific_location = len(meeting_location.split()) >= 2 and meeting_location.strip() != ""
        
        # Check for travel keywords
        travel_score = 0.0
        matched_keywords = []
        for keyword in travel_keywords:
            if keyword in location_lower:
                travel_score += 0.15
                matched_keywords.append(keyword)
        
        # Boost score if location is specific (contains address-like patterns)
        if has_specific_location:
            # Check for postal code, street, building number patterns
            if re.search(r'\d+', meeting_location):  # Has numbers (postal code, building number)
                travel_score += 0.2
            travel_score += 0.1  # Generic boost for having any location
        
        # If location is very short, less likely to need transport
        if len(meeting_location) < 3:
            travel_score = max(0, travel_score - 0.2)
        
        # Check for meeting-related keywords in title
        if any(word in title_lower for word in ['meeting', 'conference', 'summit', 'meetup', 'presentation', 'event']):
            travel_score += 0.2
        
        # Normalize score
        travel_score = min(1.0, max(0.0, travel_score))
        
        reason = f"Score based on: location='{meeting_location}', keywords={matched_keywords}"
        needs_transport = travel_score >= 0.5
        
        return needs_transport, travel_score, reason
    
    async def extract_location_from_meeting(
        self,
        meeting_location: str,
        meeting_title: Optional[str] = None
    ) -> Optional[Dict[str, str]]:
        """
        Extract and geocode location from meeting details
        Args:
            meeting_location: Location string from meeting
            meeting_title: Meeting title (may contain location info)
            
        Returns:
            Location data with address and coordinates
        """
        try:
            # Normalize location
            location = meeting_location.strip()
            if not location:
                return None
            
            # Try to geocode using mock service
            geocoded = await self._mock_geocode(location)
            return geocoded
            
        except Exception as e:
            logger.error(f"Failed to extract location: {e}")
            return None
    
    async def _mock_geocode(self, location: str) -> Dict[str, str]:
        """Mock geocoding for demo"""
        # In production, use Google Maps or similar service
        return {
            'address': location,
            'city': location.split(',')[-1].strip() if ',' in location else location,
            'latitude': None,  # Would be filled with actual geocoding
            'longitude': None
        }
    
    async def sync_calendar_and_book_rides(
        self,
        user_id: str,
        preference_settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Main orchestration: Sync calendar and auto-book rides
        
        Args:
            user_id: User ID
            preference_settings: Override preferences for this sync
            
        Returns:
            Sync result with booking details
        """
        try:
            # Get user preferences
            prefs = await self.db.auto_booking_preferences.find_one({'user_id': user_id})
            if not prefs or not prefs.get('enabled', False):
                return {'error': 'Auto-booking not enabled for user'}
            
            # Override with provided settings
            if preference_settings:
                prefs.update(preference_settings)
            
            # Calculate time window: Today + next 7 days
            now = datetime.utcnow()
            start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = start_date + timedelta(days=7)
            
            # Fetch calendar events
            events = await self.fetch_calendar_events(user_id, start_date, end_date)
            
            booked_count = 0
            skipped_count = 0
            bookings = []
            errors = []
            
            # Process each event
            for event in events:
                try:
                    # Analyze transportation need
                    needs_transport, confidence, reason = await self.analyze_meeting_for_transportation(
                        event.get('title', ''),
                        event.get('location', '')
                    )
                    
                    # Check if confidence meets threshold
                    threshold = prefs.get('auto_book_threshold', 0.7)
                    if not needs_transport or confidence < threshold:
                        skipped_count += 1
                        logger.info(f"Skipped event {event.get('title')}: confidence {confidence} < {threshold}")
                        continue
                    
                    # Check daily limit
                    if booked_count >= prefs.get('max_daily_auto_bookings', 5):
                        logger.info(f"Daily auto-booking limit reached")
                        break
                    
                    # Create booking
                    booking = await self._create_auto_booking(
                        user_id, event, confidence, reason, prefs
                    )
                    
                    if booking:
                        bookings.append(booking)
                        booked_count += 1
                    else:
                        skipped_count += 1
                        
                except Exception as e:
                    logger.error(f"Error processing event {event.get('title')}: {e}")
                    errors.append({
                        'event': event.get('title'),
                        'error': str(e)
                    })
                    skipped_count += 1
            
            return {
                'synced_events': len(events),
                'auto_booked_count': booked_count,
                'bookings': bookings,
                'skipped_events': skipped_count,
                'errors': errors,
                'sync_timestamp': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Calendar sync failed: {e}")
            return {'error': str(e), 'synced_events': 0, 'auto_booked_count': 0}
    
    async def _create_auto_booking(
        self,
        user_id: str,
        event: Dict[str, Any],
        confidence: float,
        reason: str,
        preferences: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Create an automatic ride booking for a calendar event
        """
        try:
            event_start = datetime.fromisoformat(str(event.get('start_time')))
            
            # Calculate pickup time (advance booking minutes before event)
            advance_minutes = preferences.get('advance_booking_minutes', 30)
            pickup_time = event_start - timedelta(minutes=advance_minutes)
            
            # Check if pickup time is in the past
            if pickup_time < datetime.utcnow():
                logger.warning(f"Pickup time is in the past for event {event.get('title')}")
                return None
            
            # Extract location
            location_data = await self.extract_location_from_meeting(
                event.get('location', ''),
                event.get('title')
            )
            
            if not location_data:
                logger.warning(f"Could not extract location for event {event.get('title')}")
                return None
            
            # Get user's home/office location for pickup
            user = await self.db.users.find_one({'_id': ObjectId(user_id)})
            if not user:
                return None
            
            # Create ride booking request
            booking_request = {
                'passenger_id': ObjectId(user_id),
                'pickup_location': user.get('home_address', 'Current Location'),
                'dropoff_location': location_data.get('address', event.get('location')),
                'scheduled_time': pickup_time,
                'ride_type': preferences.get('preferred_ride_type', 'instant'),
                'vehicle_type': preferences.get('preferred_vehicle', 'auto'),
                'special_requirements': preferences.get('special_requirements', []),
                'notes': f"Auto-booked for: {event.get('title')}",
                'payment_method': preferences.get('payment_method', 'wallet'),
                'source': 'calendar_booking',
                'calendar_event_id': event.get('_id'),
                'calendar_event_title': event.get('title'),
                'event_location': event.get('location'),
                'event_start_time': event_start,
                'event_end_time': datetime.fromisoformat(str(event.get('end_time', event_start)))
            }
            
            # Add corporate details if applicable
            if user.get('corporate_account'):
                booking_request['corporate_id'] = user.get('corporate_id')
                booking_request['cost_center'] = preferences.get('expense_code')
            
            # Create booking in database
            booking_record = {
                'user_id': user_id,
                'calendar_event_id': str(event.get('_id', 'unknown')),
                'calendar_event_title': event.get('title'),
                'event_location': event.get('location'),
                'event_start_time': event_start,
                'event_end_time': booking_request['event_end_time'],
                'pickup_location': booking_request['pickup_location'],
                'dropoff_location': booking_request['dropoff_location'],
                'transportation_confidence': confidence,
                'detection_reason': reason,
                'ride_type': booking_request['ride_type'],
                'auto_booked': True,
                'booking_status': 'pending',
                'booking_created_at': datetime.utcnow(),
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }
            
            # Insert into database
            result = await self.db.calendar_bookings.insert_one(booking_record)
            booking_record['_id'] = result.inserted_id
            
            logger.info(f"Auto-booking created for user {user_id}: {event.get('title')}")
            
            return booking_record
            
        except Exception as e:
            logger.error(f"Failed to create auto-booking: {e}")
            return None
    
    async def get_user_bookings(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get calendar bookings for a user"""
        try:
            bookings = await self.db.calendar_bookings.find(
                {'user_id': user_id}
            ).sort('event_start_time', 1).limit(limit).to_list(length=limit)
            
            return bookings
        except Exception as e:
            logger.error(f"Failed to retrieve bookings: {e}")
            return []
    
    async def cancel_calendar_booking(self, booking_id: str, user_id: str) -> bool:
        """Cancel a calendar booking"""
        try:
            result = await self.db.calendar_bookings.update_one(
                {'_id': ObjectId(booking_id), 'user_id': user_id},
                {'$set': {
                    'booking_status': 'cancelled',
                    'updated_at': datetime.utcnow()
                }}
            )
            
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Failed to cancel booking: {e}")
            return False
    
    async def get_upcoming_meetings_reminders(self, user_id: str) -> List[Dict[str, Any]]:
        """Get reminders for upcoming meetings in next 24 hours"""
        try:
            now = datetime.utcnow()
            next_24h = now + timedelta(hours=24)
            
            bookings = await self.db.calendar_bookings.find({
                'user_id': user_id,
                'event_start_time': {'$gte': now, '$lte': next_24h},
                'booking_status': 'pending'
            }).to_list(length=50)
            
            return bookings
        except Exception as e:
            logger.error(f"Failed to get meeting reminders: {e}")
            return []
