"""
Family Assistant Service Layer
Handles business logic for family member management, appointment tracking, and notifications
"""

from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import asyncio
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorCollection

from app.db.family_assistant_models import (
    FamilyMember, FamilyAppointment, FamilyNotification, 
    FamilyQuickAction, QuickActionExecution, AppointmentType
)

logger = logging.getLogger(__name__)


class FamilyAssistantService:
    """Core service for family assistant operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.family_members_col = db.get_collection("family_members")
        self.family_appointments_col = db.get_collection("family_appointments")
        self.family_notifications_col = db.get_collection("family_notifications")
        self.quick_actions_col = db.get_collection("family_quick_actions")
        self.quick_action_executions_col = db.get_collection("family_quick_action_executions")
    
    # ========================================================================
    # Family Member Management
    # ========================================================================
    
    async def add_family_member(self, member_data: Dict) -> Dict:
        """Add a new family member"""
        try:
            member = FamilyMember(**member_data)
            member_dict = member.model_dump(exclude_unset=True)
            member_dict["_id"] = f"FM-{datetime.utcnow().timestamp()}"
            member_dict["created_at"] = datetime.utcnow()
            member_dict["updated_at"] = datetime.utcnow()
            
            result = await self.family_members_col.insert_one(member_dict)
            return {
                "success": True,
                "member_id": str(result.inserted_id),
                "member": member_dict
            }
        except Exception as e:
            logger.error(f"Error adding family member: {str(e)}")
            raise
    
    async def get_family_members(self, user_id: str) -> List[Dict]:
        """Get all family members for a user"""
        try:
            members = await self.family_members_col.find(
                {"primary_user_id": user_id}
            ).to_list(length=None)
            return members
        except Exception as e:
            logger.error(f"Error fetching family members: {str(e)}")
            raise
    
    async def get_family_member(self, member_id: str) -> Optional[Dict]:
        """Get a specific family member"""
        try:
            member = await self.family_members_col.find_one({"_id": member_id})
            return member
        except Exception as e:
            logger.error(f"Error fetching family member {member_id}: {str(e)}")
            raise
    
    async def update_family_member(self, member_id: str, update_data: Dict) -> Dict:
        """Update family member details"""
        try:
            update_data["updated_at"] = datetime.utcnow()
            result = await self.family_members_col.update_one(
                {"_id": member_id},
                {"$set": update_data}
            )
            return {
                "success": result.modified_count > 0,
                "matched": result.matched_count,
                "modified": result.modified_count
            }
        except Exception as e:
            logger.error(f"Error updating family member {member_id}: {str(e)}")
            raise
    
    # ========================================================================
    # Appointment Management
    # ========================================================================
    
    async def create_appointment(self, appointment_data: Dict) -> Dict:
        """Create a new appointment for family member"""
        try:
            appointment = FamilyAppointment(**appointment_data)
            appointment_dict = appointment.model_dump(exclude_unset=True)
            appointment_dict["_id"] = f"APT-{datetime.utcnow().timestamp()}"
            appointment_dict["created_at"] = datetime.utcnow()
            appointment_dict["updated_at"] = datetime.utcnow()
            
            result = await self.family_appointments_col.insert_one(appointment_dict)
            
            # Generate notification for main user
            if appointment_data.get("notify_main_user"):
                await self.create_appointment_notification(appointment_dict)
            
            return {
                "success": True,
                "appointment_id": str(result.inserted_id),
                "appointment": appointment_dict
            }
        except Exception as e:
            logger.error(f"Error creating appointment: {str(e)}")
            raise
    
    async def get_upcoming_appointments(
        self,
        member_id: str,
        days_ahead: int = 7
    ) -> List[Dict]:
        """Get upcoming appointments for a family member"""
        try:
            now = datetime.utcnow()
            future_date = now + timedelta(days=days_ahead)
            
            appointments = await self.family_appointments_col.find({
                "family_member_id": member_id,
                "start_time": {"$gte": now, "$lte": future_date}
            }).sort("start_time", 1).to_list(length=None)
            
            return appointments
        except Exception as e:
            logger.error(f"Error fetching appointments for {member_id}: {str(e)}")
            raise
    
    async def get_appointments_needing_rides(
        self,
        user_id: str,
        hours_ahead: int = 24
    ) -> List[Dict]:
        """Get appointments that need ride bookings"""
        try:
            now = datetime.utcnow()
            future_time = now + timedelta(hours=hours_ahead)
            
            appointments = await self.family_appointments_col.find({
                "primary_user_id": user_id,
                "transportation_needed": True,
                "ride_booked": False,
                "start_time": {"$gte": now, "$lte": future_time}
            }).sort("start_time", 1).to_list(length=None)
            
            return appointments
        except Exception as e:
            logger.error(f"Error fetching appointments needing rides: {str(e)}")
            raise
    
    # ========================================================================
    # Notification Management
    # ========================================================================
    
    async def create_appointment_notification(self, appointment: Dict) -> Dict:
        """Create notification for appointment"""
        try:
            # Get family member details
            member = await self.get_family_member(appointment["family_member_id"])
            
            notification = FamilyNotification(
                primary_user_id=appointment["primary_user_id"],
                family_member_id=appointment["family_member_id"],
                family_member_name=member.get("member_name", "Family Member"),
                title=f"{member.get('member_name')} has {appointment['appointment_type']} appointment",
                message=f"{member.get('member_name')} has appointment: {appointment['title']} at {appointment['location']}",
                action_type="book_ride",
                related_appointment_id=appointment["_id"],
                quick_action_data={
                    "family_member_id": appointment["family_member_id"],
                    "pickup_location": member.get("preferred_pickup_location", "Home"),
                    "destination": appointment["location"],
                    "destination_coordinates": appointment.get("location_coordinates"),
                    "scheduled_time": appointment["start_time"].isoformat(),
                    "round_trip": appointment.get("round_trip", False),
                    "vehicle_type": member.get("preferred_vehicle_type", "economy")
                }
            )
            
            notification_dict = notification.model_dump(exclude_unset=True)
            notification_dict["_id"] = f"NOTIF-{datetime.utcnow().timestamp()}"
            notification_dict["created_at"] = datetime.utcnow()
            
            result = await self.family_notifications_col.insert_one(notification_dict)
            return {"success": True, "notification_id": str(result.inserted_id)}
        except Exception as e:
            logger.error(f"Error creating notification: {str(e)}")
            raise
    
    async def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False
    ) -> List[Dict]:
        """Get notifications for a user"""
        try:
            query = {"primary_user_id": user_id}
            if unread_only:
                query["read"] = False
            
            notifications = await self.family_notifications_col.find(query).sort(
                "created_at", -1
            ).to_list(length=None)
            
            return notifications
        except Exception as e:
            logger.error(f"Error fetching notifications: {str(e)}")
            raise
    
    async def mark_notification_read(self, notification_id: str) -> Dict:
        """Mark notification as read"""
        try:
            result = await self.family_notifications_col.update_one(
                {"_id": notification_id},
                {"$set": {"read": True}}
            )
            return {"success": result.modified_count > 0}
        except Exception as e:
            logger.error(f"Error marking notification as read: {str(e)}")
            raise
    
    # ========================================================================
    # Quick Actions
    # ========================================================================
    
    async def create_quick_action(self, action_data: Dict) -> Dict:
        """Create a quick action template"""
        try:
            action = FamilyQuickAction(**action_data)
            action_dict = action.model_dump(exclude_unset=True)
            action_dict["_id"] = f"QA-{datetime.utcnow().timestamp()}"
            action_dict["created_at"] = datetime.utcnow()
            
            result = await self.quick_actions_col.insert_one(action_dict)
            return {
                "success": True,
                "action_id": str(result.inserted_id),
                "action": action_dict
            }
        except Exception as e:
            logger.error(f"Error creating quick action: {str(e)}")
            raise
    
    async def execute_quick_action(
        self,
        user_id: str,
        action_data: Dict
    ) -> Dict:
        """Execute a quick action (e.g., book ride)"""
        try:
            execution = QuickActionExecution(
                primary_user_id=user_id,
                family_member_id=action_data.get("family_member_id"),
                quick_action_id=action_data.get("action_id", "manual"),
                action_type=action_data.get("action_type", "book_ride"),
                status="pending",
                initiated_from=action_data.get("initiated_from", "manual")
            )
            
            execution_dict = execution.model_dump(exclude_unset=True)
            execution_dict["_id"] = f"QAE-{datetime.utcnow().timestamp()}"
            execution_dict["execution_time"] = datetime.utcnow()
            
            result = await self.quick_action_executions_col.insert_one(execution_dict)
            
            return {
                "success": True,
                "execution_id": str(result.inserted_id),
                "status": "pending"
            }
        except Exception as e:
            logger.error(f"Error executing quick action: {str(e)}")
            raise
    
    # ========================================================================
    # Analytics & Dashboard
    # ========================================================================
    
    async def get_family_dashboard(self, user_id: str) -> Dict:
        """Get comprehensive family dashboard summary"""
        try:
            members = await self.get_family_members(user_id)
            
            # Get today's appointments
            today_appointments = await self.family_appointments_col.find({
                "primary_user_id": user_id,
                "start_time": {
                    "$gte": datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0),
                    "$lt": datetime.utcnow().replace(hour=23, minute=59, second=59, microsecond=999999)
                }
            }).to_list(length=None)
            
            # Get unread notifications
            unread_notifications = await self.family_notifications_col.find({
                "primary_user_id": user_id,
                "read": False
            }).to_list(length=None)
            
            # Get pending ride bookings
            pending_rides = await self.get_appointments_needing_rides(user_id, hours_ahead=48)
            
            # Get this week's stats
            week_ago = datetime.utcnow() - timedelta(days=7)
            week_appointments = await self.family_appointments_col.find({
                "primary_user_id": user_id,
                "start_time": {"$gte": week_ago}
            }).to_list(length=None)
            
            booked_rides = len([apt for apt in week_appointments if apt.get("ride_booked")])
            
            return {
                "total_family_members": len(members),
                "today_appointments": len(today_appointments),
                "pending_notifications": len(unread_notifications),
                "upcoming_rides_needed": len(pending_rides),
                "this_week_appointments": len(week_appointments),
                "this_week_rides_booked": booked_rides,
                "recent_appointments": today_appointments[:5],
                "recent_notifications": unread_notifications[:5],
                "upcoming_rides": pending_rides[:5]
            }
        except Exception as e:
            logger.error(f"Error getting family dashboard: {str(e)}")
            raise
    
    async def get_family_analytics(
        self,
        user_id: str,
        period_days: int = 30
    ) -> Dict:
        """Get family transportation and health analytics"""
        try:
            start_date = datetime.utcnow() - timedelta(days=period_days)
            
            appointments = await self.family_appointments_col.find({
                "primary_user_id": user_id,
                "created_at": {"$gte": start_date}
            }).to_list(length=None)
            
            # Calculate metrics
            total_appointments = len(appointments)
            rides_booked = len([apt for apt in appointments if apt.get("ride_booked")])
            appointment_types = {}
            total_cost = 0.0
            
            for apt in appointments:
                apt_type = apt.get("appointment_type", "other")
                appointment_types[apt_type] = appointment_types.get(apt_type, 0) + 1
            
            return {
                "period_days": period_days,
                "total_appointments": total_appointments,
                "rides_booked": rides_booked,
                "appointment_types": appointment_types,
                "average_rides_per_week": rides_booked / (period_days / 7),
                "total_transportation_cost": total_cost,
                "most_common_appointment": max(
                    appointment_types.items(),
                    key=lambda x: x[1]
                )[0] if appointment_types else "none"
            }
        except Exception as e:
            logger.error(f"Error getting family analytics: {str(e)}")
            raise


class AppointmentSyncService:
    """Handles calendar syncing and appointment detection"""
    
    def __init__(self, db: AsyncIOMotorDatabase, family_service: FamilyAssistantService):
        self.db = db
        self.family_service = family_service
        self.calendar_syncs_col = db.get_collection("calendar_sync_configs")
    
    async def sync_family_member_calendar(
        self,
        member_id: str,
        calendar_source: str = "google"
    ) -> Dict:
        """Sync calendar from external source"""
        try:
            # In production, integrate with Google Calendar or Outlook APIs
            logger.info(f"Starting calendar sync for member {member_id} from {calendar_source}")
            
            # Simulated calendar events
            events = await self._fetch_calendar_events(member_id, calendar_source)
            
            # Process each event
            for event in events:
                appointment_data = await self._analyze_event_for_transportation(
                    member_id,
                    event
                )
                if appointment_data:
                    await self.family_service.create_appointment(appointment_data)
            
            return {
                "success": True,
                "member_id": member_id,
                "events_synced": len(events),
                "appointments_created": len(events)
            }
        except Exception as e:
            logger.error(f"Error syncing calendar for {member_id}: {str(e)}")
            raise
    
    async def _fetch_calendar_events(self, member_id: str, source: str) -> List[Dict]:
        """Fetch events from calendar source"""
        # In production, integrate with real APIs
        return []
    
    async def _analyze_event_for_transportation(
        self,
        member_id: str,
        event: Dict
    ) -> Optional[Dict]:
        """Analyze calendar event to determine if transportation is needed"""
        # In production, use AI/ML to determine transportation needs
        appointment_type = self._detect_appointment_type(event.get("title", ""))
        
        if appointment_type in ["medical", "work"]:
            return {
                "family_member_id": member_id,
                "title": event.get("title"),
                "description": event.get("description"),
                "appointment_type": appointment_type,
                "start_time": event.get("start_time"),
                "end_time": event.get("end_time"),
                "location": event.get("location"),
                "transportation_needed": True,
                "calendar_event_id": event.get("id"),
                "synced_from_calendar": True
            }
        return None
    
    def _detect_appointment_type(self, title: str) -> str:
        """Detect appointment type from title"""
        title_lower = title.lower()
        if any(word in title_lower for word in ["doctor", "hospital", "clinic", "appointment"]):
            return "medical"
        elif any(word in title_lower for word in ["meeting", "work", "conference", "presentation"]):
            return "work"
        elif any(word in title_lower for word in ["school", "class", "university", "college"]):
            return "education"
        else:
            return "other"


# Initialization helper
async def get_family_assistant_service(db: AsyncIOMotorDatabase) -> FamilyAssistantService:
    """Factory function to create FamilyAssistantService"""
    return FamilyAssistantService(db)
