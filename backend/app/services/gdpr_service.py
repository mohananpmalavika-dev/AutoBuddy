"""
GDPR Service Layer
Data privacy compliance operations
"""
import os
import json
import zipfile
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from bson import ObjectId
import asyncio

from app.database import get_database
from app.models.gdpr import DataExport, AccountDeletion, UserConsent, DataAccessAuditLog
from app.schemas.gdpr import DataExportStatus, ConsentType


class GDPRService:
    """Service for GDPR compliance operations"""
    
    def __init__(self):
        self.db = get_database()
        self.exports_collection = self.db["data_exports"]
        self.deletions_collection = self.db["account_deletions"]
        self.consents_collection = self.db["user_consents"]
        self.audit_logs_collection = self.db["data_access_audit_logs"]
        self.users_collection = self.db["users"]
        self.rides_collection = self.db["rides"]
        self.payments_collection = self.db["payments"]
    
    async def request_data_export(
        self,
        user_id: str,
        export_format: str = "zip",
        include_rides: bool = True,
        include_payments: bool = True,
        include_messages: bool = True
    ) -> DataExport:
        """Create data export request"""
        export_data = {
            "user_id": user_id,
            "status": DataExportStatus.PENDING.value,
            "format": export_format,
            "requested_at": datetime.utcnow(),
            "include_rides": include_rides,
            "include_payments": include_payments,
            "include_messages": include_messages
        }
        
        result = await self.exports_collection.insert_one(export_data)
        export_data["_id"] = str(result.inserted_id)
        
        # Log action
        await self.log_access("export", user_id, "data_export", str(result.inserted_id))
        
        # Start async processing
        asyncio.create_task(self._process_export(str(result.inserted_id)))
        
        return DataExport(**export_data)
    
    async def _process_export(self, export_id: str):
        """Process data export (background task)"""
        try:
            # Update status to processing
            await self.exports_collection.update_one(
                {"_id": ObjectId(export_id)},
                {"$set": {"status": DataExportStatus.PROCESSING.value}}
            )
            
            export = await self.exports_collection.find_one({"_id": ObjectId(export_id)})
            if not export:
                return
            
            user_id = export["user_id"]
            
            # Collect all user data
            user_data = await self._collect_user_data(
                user_id,
                export.get("include_rides", True),
                export.get("include_payments", True),
                export.get("include_messages", True)
            )
            
            # Generate export file
            file_path = f"/tmp/export_{export_id}.zip"
            self._create_export_file(user_data, file_path)
            
            # Calculate expiry (7 days)
            expires_at = datetime.utcnow() + timedelta(days=7)
            
            # Update export record
            file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
            
            await self.exports_collection.update_one(
                {"_id": ObjectId(export_id)},
                {"$set": {
                    "status": DataExportStatus.COMPLETED.value,
                    "completed_at": datetime.utcnow(),
                    "file_path": file_path,
                    "download_url": f"/api/v1/privacy/download/{export_id}",
                    "expires_at": expires_at,
                    "file_size_bytes": file_size
                }}
            )
            
        except Exception as e:
            await self.exports_collection.update_one(
                {"_id": ObjectId(export_id)},
                {"$set": {
                    "status": DataExportStatus.FAILED.value,
                    "error_message": str(e)
                }}
            )
    
    async def _collect_user_data(
        self,
        user_id: str,
        include_rides: bool,
        include_payments: bool,
        include_messages: bool
    ) -> Dict[str, Any]:
        """Collect all user data for export"""
        data = {}
        
        # User profile
        user = await self.users_collection.find_one({"_id": ObjectId(user_id)})
        if user:
            user["_id"] = str(user["_id"])
            data["profile"] = user
        
        # Rides
        if include_rides:
            rides = await self.rides_collection.find({"user_id": user_id}).to_list(length=None)
            for ride in rides:
                ride["_id"] = str(ride["_id"])
            data["rides"] = rides
        
        # Payments
        if include_payments:
            payments = await self.payments_collection.find({"user_id": user_id}).to_list(length=None)
            for payment in payments:
                payment["_id"] = str(payment["_id"])
            data["payments"] = payments
        
        # Consents
        consents = await self.consents_collection.find({"user_id": user_id}).to_list(length=None)
        for consent in consents:
            consent["_id"] = str(consent["_id"])
        data["consents"] = consents
        
        # Access logs
        logs = await self.audit_logs_collection.find({"user_id": user_id}).to_list(length=100)
        for log in logs:
            log["_id"] = str(log["_id"])
        data["access_logs"] = logs
        
        return data
    
    def _create_export_file(self, data: Dict[str, Any], file_path: str):
        """Create ZIP file with all data"""
        with zipfile.ZipFile(file_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add profile
            if "profile" in data:
                zipf.writestr("profile.json", json.dumps(data["profile"], indent=2, default=str))
            
            # Add rides
            if "rides" in data:
                zipf.writestr("rides.json", json.dumps(data["rides"], indent=2, default=str))
            
            # Add payments
            if "payments" in data:
                zipf.writestr("payments.json", json.dumps(data["payments"], indent=2, default=str))
            
            # Add consents
            if "consents" in data:
                zipf.writestr("consents.json", json.dumps(data["consents"], indent=2, default=str))
            
            # Add access logs
            if "access_logs" in data:
                zipf.writestr("access_logs.json", json.dumps(data["access_logs"], indent=2, default=str))
            
            # Add README
            readme = """AutoBuddy Data Export
            
This archive contains all personal data we have stored about you.

Files:
- profile.json: Your user profile information
- rides.json: Your ride history
- payments.json: Your payment transactions
- consents.json: Your consent preferences
- access_logs.json: Recent access to your data

For questions, contact privacy@autobuddy.com
"""
            zipf.writestr("README.txt", readme)
    
    async def request_account_deletion(
        self,
        user_id: str,
        reason: Optional[str] = None,
        delete_immediately: bool = False
    ) -> AccountDeletion:
        """Request account deletion"""
        now = datetime.utcnow()
        
        # Schedule deletion (30 days grace period or immediate)
        if delete_immediately:
            scheduled_date = now
            can_recover_until = None
        else:
            scheduled_date = now + timedelta(days=30)
            can_recover_until = scheduled_date
        
        deletion_data = {
            "user_id": user_id,
            "requested_at": now,
            "scheduled_deletion_date": scheduled_date,
            "can_recover_until": can_recover_until,
            "deletion_reason": reason,
            "delete_immediately": delete_immediately,
            "status": "pending"
        }
        
        result = await self.deletions_collection.insert_one(deletion_data)
        deletion_data["_id"] = str(result.inserted_id)
        
        # Log action
        await self.log_access("delete_request", user_id, "account", user_id)
        
        # If immediate, start deletion
        if delete_immediately:
            asyncio.create_task(self._execute_deletion(str(result.inserted_id)))
        
        return AccountDeletion(**deletion_data)
    
    async def _execute_deletion(self, deletion_id: str):
        """Execute account deletion (anonymize data)"""
        try:
            deletion = await self.deletions_collection.find_one({"_id": ObjectId(deletion_id)})
            if not deletion:
                return
            
            user_id = deletion["user_id"]
            
            # Anonymize user data
            anonymized_email = f"deleted_{user_id}@anonymized.local"
            anonymized_phone = "0000000000"
            
            await self.users_collection.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {
                    "email": anonymized_email,
                    "phone": anonymized_phone,
                    "name": "Deleted User",
                    "is_deleted": True,
                    "deleted_at": datetime.utcnow()
                }}
            )
            
            # Keep ride/payment records for legal compliance but anonymize
            await self.rides_collection.update_many(
                {"user_id": user_id},
                {"$set": {"user_anonymized": True}}
            )
            
            # Mark deletion complete
            await self.deletions_collection.update_one(
                {"_id": ObjectId(deletion_id)},
                {"$set": {
                    "status": "completed",
                    "deleted_at": datetime.utcnow()
                }}
            )
            
        except Exception as e:
            print(f"Deletion error: {e}")
    
    async def update_consent(
        self,
        user_id: str,
        consent_type: str,
        granted: bool,
        consent_text: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> UserConsent:
        """Update user consent"""
        now = datetime.utcnow()
        
        # Find existing consent
        existing = await self.consents_collection.find_one({
            "user_id": user_id,
            "consent_type": consent_type
        })
        
        consent_data = {
            "user_id": user_id,
            "consent_type": consent_type,
            "granted": granted,
            "granted_at": now if granted else existing.get("granted_at") if existing else None,
            "revoked_at": now if not granted else None,
            "consent_version": "1.0",
            "consent_text": consent_text,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "updated_at": now
        }
        
        if existing:
            await self.consents_collection.update_one(
                {"_id": existing["_id"]},
                {"$set": consent_data}
            )
            consent_data["_id"] = str(existing["_id"])
        else:
            result = await self.consents_collection.insert_one(consent_data)
            consent_data["_id"] = str(result.inserted_id)
        
        # Log consent change
        await self.log_access("consent_change", user_id, "consent", consent_type, {
            "granted": granted,
            "consent_type": consent_type
        })
        
        return UserConsent(**consent_data)
    
    async def get_user_consents(self, user_id: str) -> List[UserConsent]:
        """Get all user consents"""
        consents = await self.consents_collection.find({"user_id": user_id}).to_list(length=None)
        result = []
        for consent in consents:
            consent["_id"] = str(consent["_id"])
            result.append(UserConsent(**consent))
        return result
    
    async def log_access(
        self,
        action: str,
        user_id: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ):
        """Log data access for audit trail"""
        log_data = {
            "user_id": user_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "timestamp": datetime.utcnow(),
            "details": details or {}
        }
        
        await self.audit_logs_collection.insert_one(log_data)
    
    async def get_export_status(self, export_id: str) -> Optional[DataExport]:
        """Get data export status"""
        export = await self.exports_collection.find_one({"_id": ObjectId(export_id)})
        if export:
            export["_id"] = str(export["_id"])
            return DataExport(**export)
        return None
    
    async def cleanup_expired_exports(self):
        """Clean up expired exports (cron job)"""
        now = datetime.utcnow()
        
        # Find expired exports
        expired = await self.exports_collection.find({
            "status": DataExportStatus.COMPLETED.value,
            "expires_at": {"$lte": now}
        }).to_list(length=None)
        
        for export in expired:
            # Delete file
            if export.get("file_path") and os.path.exists(export["file_path"]):
                try:
                    os.remove(export["file_path"])
                except Exception as e:
                    print(f"Failed to delete export file: {e}")
            
            # Update status
            await self.exports_collection.update_one(
                {"_id": export["_id"]},
                {"$set": {"status": DataExportStatus.EXPIRED.value}}
            )
    
    async def process_scheduled_deletions(self):
        """Process scheduled account deletions (cron job)"""
        now = datetime.utcnow()
        
        # Find deletions due
        due_deletions = await self.deletions_collection.find({
            "status": "pending",
            "scheduled_deletion_date": {"$lte": now}
        }).to_list(length=None)
        
        for deletion in due_deletions:
            await self._execute_deletion(str(deletion["_id"]))
