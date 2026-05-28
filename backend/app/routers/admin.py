"""
Admin Dashboard API Endpoints

Provides endpoints for AdminDashboard.js to manage:
- Audit logging for all admin actions
- Phone change request reviews
- Account deletion request reviews  
- Wallet top-up verifications
- Subscription management
"""

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import logging

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# ============================================================================
# MODELS
# ============================================================================

class AuditLogEntry(BaseModel):
    """Audit log entry for admin actions"""
    action_type: str
    data: Dict[str, Any]
    admin_id: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AuditLogResponse(BaseModel):
    """Response for retrieving audit logs"""
    id: str
    action_type: str
    data: Dict[str, Any]
    admin_id: Optional[str]
    timestamp: str
    created_at: str


class PhoneChangeReview(BaseModel):
    """Phone change request review"""
    user_id: str
    status: str  # 'approved' or 'rejected'
    reason: Optional[str] = None


class AccountDeletionReview(BaseModel):
    """Account deletion request review"""
    request_id: str
    status: str  # 'approved' or 'rejected'
    reason: Optional[str] = None


class WalletTopupReview(BaseModel):
    """Wallet top-up verification"""
    order_id: str
    status: str  # 'verified' or 'rejected'
    reason: Optional[str] = None


class SubscriptionReview(BaseModel):
    """Subscription management review"""
    subscription_id: str
    status: str  # 'approved' or 'rejected'
    reason: Optional[str] = None


# ============================================================================
# AUDIT LOGGING
# ============================================================================

@router.post("/audit-log")
async def create_audit_log(entry: AuditLogEntry):
    """
    Log an admin action for audit trail
    
    **Action Types:**
    - TRIP_CANCELLED
    - KYC_APPROVED
    - KYC_REJECTED
    - PHONE_CHANGE_APPROVED
    - ACCOUNT_DELETION_APPROVED
    - WALLET_TOP_UP_APPROVED
    - SUBSCRIPTION_UPDATED
    - PRICING_UPDATED
    - etc.
    
    **Request Body:**
    ```json
    {
      "action_type": "PHONE_CHANGE_APPROVED",
      "data": {
        "user_id": "user_123",
        "user_name": "John Doe",
        "old_phone": "+919876543210",
        "new_phone": "+919876543211",
        "status": "approved",
        "approved_at": "2026-05-29T10:30:00Z"
      }
    }
    ```
    
    **Response:**
    ```json
    {
      "id": "log_789",
      "action_type": "PHONE_CHANGE_APPROVED",
      "data": {...},
      "admin_id": null,
      "timestamp": "2026-05-29T10:30:00Z",
      "created_at": "2026-05-29T10:30:00Z"
    }
    ```
    """
    try:
        # In a real implementation, save to MongoDB audit collection
        log_id = f"log_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
        
        response = {
            "id": log_id,
            "action_type": entry.action_type,
            "data": entry.data,
            "admin_id": entry.admin_id,
            "timestamp": entry.timestamp,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        logger.info(f"Audit log created: {entry.action_type} by {entry.admin_id}")
        return response
        
    except Exception as e:
        logger.error(f"Failed to create audit log: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create audit log: {str(e)}"
        )


@router.get("/audit-log")
async def get_audit_logs(
    action_type: Optional[str] = None,
    limit: int = 100,
    skip: int = 0
):
    """
    Retrieve audit logs with optional filtering
    
    **Query Parameters:**
    - `action_type`: Filter by specific action type (optional)
    - `limit`: Maximum number of logs to return (default: 100)
    - `skip`: Number of logs to skip for pagination (default: 0)
    
    **Response:**
    ```json
    {
      "logs": [
        {
          "id": "log_123",
          "action_type": "PHONE_CHANGE_APPROVED",
          "data": {...},
          "admin_id": "admin_456",
          "timestamp": "2026-05-29T10:30:00Z",
          "created_at": "2026-05-29T10:30:00Z"
        }
      ],
      "total": 42,
      "limit": 100,
      "skip": 0
    }
    ```
    """
    try:
        # In a real implementation, query MongoDB audit collection
        # For now, return empty list
        return {
            "logs": [],
            "total": 0,
            "limit": limit,
            "skip": skip
        }
        
    except Exception as e:
        logger.error(f"Failed to retrieve audit logs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve audit logs: {str(e)}"
        )


# ============================================================================
# PHONE CHANGE REQUESTS
# ============================================================================

@router.put("/phone-changes/{user_id}")
async def review_phone_change(user_id: str, review: PhoneChangeReview):
    """
    Review and approve/reject phone change requests
    
    **Path Parameters:**
    - `user_id`: User ID requesting phone change
    
    **Request Body:**
    ```json
    {
      "status": "approved",
      "reason": null
    }
    ```
    
    **Response:**
    ```json
    {
      "user_id": "user_123",
      "status": "approved",
      "message": "Phone change approved successfully",
      "updated_at": "2026-05-29T10:35:00Z"
    }
    ```
    """
    try:
        if review.status not in ["approved", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'approved' or 'rejected'"
            )
        
        # In a real implementation, update phone_change_request in database
        logger.info(f"Phone change reviewed for user {user_id}: {review.status}")
        
        return {
            "user_id": user_id,
            "status": review.status,
            "message": f"Phone change {review.status} successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to review phone change: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to review phone change: {str(e)}"
        )


# ============================================================================
# ACCOUNT DELETION REQUESTS
# ============================================================================

@router.put("/account-deletions/{request_id}")
async def review_account_deletion(request_id: str, review: AccountDeletionReview):
    """
    Review and approve/reject account deletion requests
    
    **Path Parameters:**
    - `request_id`: Account deletion request ID
    
    **Request Body:**
    ```json
    {
      "status": "approved",
      "reason": null
    }
    ```
    
    **Response:**
    ```json
    {
      "request_id": "del_req_123",
      "status": "approved",
      "message": "Account deletion approved successfully",
      "updated_at": "2026-05-29T10:40:00Z"
    }
    ```
    """
    try:
        if review.status not in ["approved", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'approved' or 'rejected'"
            )
        
        # In a real implementation, update account_deletion_request in database
        logger.info(f"Account deletion reviewed for request {request_id}: {review.status}")
        
        return {
            "request_id": request_id,
            "status": review.status,
            "message": f"Account deletion {review.status} successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to review account deletion: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to review account deletion: {str(e)}"
        )


# ============================================================================
# WALLET TOP-UP VERIFICATIONS
# ============================================================================

@router.put("/wallet/topups/{order_id}")
async def review_wallet_topup(order_id: str, review: WalletTopupReview):
    """
    Verify wallet top-up transactions
    
    **Path Parameters:**
    - `order_id`: Wallet top-up order ID
    
    **Request Body:**
    ```json
    {
      "status": "verified",
      "reason": null
    }
    ```
    
    **Response:**
    ```json
    {
      "order_id": "order_123",
      "status": "verified",
      "message": "Wallet top-up verified and credited successfully",
      "updated_at": "2026-05-29T10:45:00Z"
    }
    ```
    """
    try:
        if review.status not in ["verified", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'verified' or 'rejected'"
            )
        
        # In a real implementation:
        # 1. Update wallet_topup status in database
        # 2. If verified, credit user's wallet
        # 3. If rejected, mark for refund
        logger.info(f"Wallet top-up reviewed for order {order_id}: {review.status}")
        
        return {
            "order_id": order_id,
            "status": review.status,
            "message": f"Wallet top-up {review.status} and {'credited' if review.status == 'verified' else 'marked for refund'} successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to review wallet top-up: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to review wallet top-up: {str(e)}"
        )


# ============================================================================
# SUBSCRIPTION MANAGEMENT
# ============================================================================

@router.put("/subscriptions/{subscription_id}")
async def review_subscription(subscription_id: str, review: SubscriptionReview):
    """
    Manage subscription approvals
    
    **Path Parameters:**
    - `subscription_id`: Subscription ID
    
    **Request Body:**
    ```json
    {
      "status": "approved",
      "reason": null
    }
    ```
    
    **Response:**
    ```json
    {
      "subscription_id": "sub_123",
      "status": "approved",
      "message": "Subscription approved successfully",
      "updated_at": "2026-05-29T10:50:00Z"
    }
    ```
    """
    try:
        if review.status not in ["approved", "rejected"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status must be 'approved' or 'rejected'"
            )
        
        # In a real implementation, update subscription status in database
        logger.info(f"Subscription reviewed for ID {subscription_id}: {review.status}")
        
        return {
            "subscription_id": subscription_id,
            "status": review.status,
            "message": f"Subscription {review.status} successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to review subscription: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to review subscription: {str(e)}"
        )


# ============================================================================
# KYC ENDPOINTS (Phase 1 - Already required)
# ============================================================================

@router.post("/kyc/approve")
async def approve_kyc(kyc_id: str):
    """
    Approve KYC document verification
    
    **Query Parameters:**
    - `kyc_id`: KYC request ID
    
    **Response:**
    ```json
    {
      "kyc_id": "kyc_123",
      "status": "approved",
      "message": "KYC approved successfully",
      "updated_at": "2026-05-29T11:00:00Z"
    }
    ```
    """
    try:
        logger.info(f"KYC approved: {kyc_id}")
        
        return {
            "kyc_id": kyc_id,
            "status": "approved",
            "message": "KYC approved successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to approve KYC: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve KYC: {str(e)}"
        )


@router.post("/kyc/reject")
async def reject_kyc(kyc_id: str, reason: str = ""):
    """
    Reject KYC document verification
    
    **Query Parameters:**
    - `kyc_id`: KYC request ID
    - `reason`: Reason for rejection (optional)
    
    **Response:**
    ```json
    {
      "kyc_id": "kyc_123",
      "status": "rejected",
      "reason": "Document quality too low",
      "message": "KYC rejected successfully",
      "updated_at": "2026-05-29T11:05:00Z"
    }
    ```
    """
    try:
        logger.info(f"KYC rejected: {kyc_id} - {reason}")
        
        return {
            "kyc_id": kyc_id,
            "status": "rejected",
            "reason": reason or "No reason provided",
            "message": "KYC rejected successfully",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        
    except Exception as e:
        logger.error(f"Failed to reject KYC: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject KYC: {str(e)}"
        )
