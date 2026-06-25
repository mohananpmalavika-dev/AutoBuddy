"""
File Upload Routes
API endpoints for file upload operations
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status
import logging

from app.services.file_upload import file_upload_service
from app.utils.rbac import require_roles
from app.utils.logging_config import StructuredLogger, LogCategory
from app.utils.api_responses import StandardResponse

logger = logging.getLogger(__name__)
structured_logger = StructuredLogger(__name__)

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


def _upload_failure_status(error: str | None) -> int:
    error_text = str(error or "").lower()
    if "s3 client" in error_text or "credentials" in error_text:
        return status.HTTP_503_SERVICE_UNAVAILABLE
    return status.HTTP_400_BAD_REQUEST


@router.post("/profile-photo")
async def upload_profile_photo(
    file: UploadFile = File(...),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """Upload profile photo"""
    try:
        structured_logger.log_operation(
            "upload_profile_photo",
            "started",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"filename": file.filename}
        )
        
        # Read file content
        file_content = await file.read()
        
        # Validate file
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        # Upload to S3
        success, file_url, error = await file_upload_service.upload_profile_photo(
            file_content=file_content,
            file_name=file.filename,
            user_id=user.get("id"),
            mime_type=file.content_type
        )
        
        if not success:
            raise HTTPException(
                status_code=_upload_failure_status(error),
                detail=error
            )
        
        structured_logger.log_operation(
            "upload_profile_photo",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"file_url": file_url}
        )
        
        return StandardResponse.created(
            data={
                "file_url": file_url,
                "filename": file.filename,
                "size": len(file_content)
            },
            resource_id=file_url,
            message="Profile photo uploaded successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Profile photo upload failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File upload failed"
        )


@router.post("/driver-document")
async def upload_driver_document(
    file: UploadFile = File(...),
    document_type: str = "license",
    user=Depends(require_roles("driver", "admin"))
):
    """Upload driver verification document"""
    try:
        structured_logger.log_operation(
            "upload_driver_document",
            "started",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={
                "filename": file.filename,
                "document_type": document_type
            }
        )
        
        # Validate document type
        valid_types = ["license", "registration", "insurance", "background_check"]
        if document_type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid document type. Must be one of: {valid_types}"
            )
        
        # Read file content
        file_content = await file.read()
        
        # Validate file
        if not file.content_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content type required"
            )
        
        # Upload to S3
        success, file_key, error = await file_upload_service.upload_driver_document(
            file_content=file_content,
            file_name=file.filename,
            driver_id=user.get("id"),
            document_type=document_type,
            mime_type=file.content_type
        )
        
        if not success:
            raise HTTPException(
                status_code=_upload_failure_status(error),
                detail=error
            )
        
        structured_logger.log_operation(
            "upload_driver_document",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={
                "document_type": document_type,
                "file_key": file_key
            }
        )
        
        return StandardResponse.created(
            data={
                "file_key": file_key,
                "filename": file.filename,
                "document_type": document_type,
                "size": len(file_content)
            },
            resource_id=file_key,
            message="Driver document uploaded successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Driver document upload failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Document upload failed"
        )


@router.post("/ride-receipt/{ride_id}")
async def upload_ride_receipt(
    ride_id: str,
    file: UploadFile = File(...),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """Upload ride receipt"""
    try:
        structured_logger.log_operation(
            "upload_ride_receipt",
            "started",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"ride_id": ride_id}
        )
        
        # Read file content
        file_content = await file.read()
        
        # Upload to S3
        success, file_key, error = await file_upload_service.upload_ride_receipt(
            file_content=file_content,
            file_name=file.filename,
            ride_id=ride_id,
            mime_type=file.content_type
        )
        
        if not success:
            raise HTTPException(
                status_code=_upload_failure_status(error),
                detail=error
            )
        
        structured_logger.log_operation(
            "upload_ride_receipt",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"file_key": file_key}
        )
        
        return StandardResponse.created(
            data={
                "file_key": file_key,
                "filename": file.filename,
                "size": len(file_content)
            },
            resource_id=file_key,
            message="Receipt uploaded successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Receipt upload failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Receipt upload failed"
        )


@router.post("/support-attachment/{ticket_id}")
async def upload_support_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    user=Depends(require_roles("passenger", "driver", "admin", "support"))
):
    """Upload support ticket attachment"""
    try:
        structured_logger.log_operation(
            "upload_support_attachment",
            "started",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"ticket_id": ticket_id}
        )
        
        # Read file content
        file_content = await file.read()
        
        # Upload to S3
        success, file_key, error = await file_upload_service.upload_support_attachment(
            file_content=file_content,
            file_name=file.filename,
            ticket_id=ticket_id,
            user_id=user.get("id"),
            mime_type=file.content_type
        )
        
        if not success:
            raise HTTPException(
                status_code=_upload_failure_status(error),
                detail=error
            )
        
        structured_logger.log_operation(
            "upload_support_attachment",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"file_key": file_key}
        )
        
        return StandardResponse.created(
            data={
                "file_key": file_key,
                "filename": file.filename,
                "size": len(file_content)
            },
            resource_id=file_key,
            message="Attachment uploaded successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Attachment upload failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Attachment upload failed"
        )


@router.post("/hazard-evidence")
async def upload_hazard_evidence(
    file: UploadFile = File(...),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """Upload hazard evidence photo"""
    try:
        structured_logger.log_operation(
            "upload_hazard_evidence",
            "started",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"filename": file.filename}
        )

        file_content = await file.read()

        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )

        success, file_url, error = await file_upload_service.upload_hazard_evidence(
            file_content=file_content,
            file_name=file.filename,
            user_id=user.get("id"),
            mime_type=file.content_type
        )

        if not success:
            raise HTTPException(
                status_code=_upload_failure_status(error),
                detail=error
            )

        structured_logger.log_operation(
            "upload_hazard_evidence",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"file_url": file_url}
        )

        return StandardResponse.created(
            data={
                "file_url": file_url,
                "filename": file.filename,
                "size": len(file_content)
            },
            resource_id=file_url,
            message="Hazard evidence uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Hazard evidence upload failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Hazard evidence upload failed"
        )


@router.get("/download/{file_key:path}")
async def download_file(
    file_key: str,
    user=Depends(require_roles("passenger", "driver", "admin", "support"))
):
    """Get signed download URL for file"""
    try:
        success, signed_url, error = await file_upload_service.get_download_url(file_key)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error
            )
        
        return StandardResponse.success(
            data={"download_url": signed_url},
            message="Download URL generated successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Download URL generation failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Download URL generation failed"
        )


@router.delete("/delete/{file_key:path}")
async def delete_file(
    file_key: str,
    user=Depends(require_roles("admin"))
):
    """Delete file from S3"""
    try:
        success, error = await file_upload_service.delete_file(file_key)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        structured_logger.log_operation(
            "delete_file",
            "success",
            category=LogCategory.SYSTEM,
            resource_id=user.get("id"),
            metadata={"file_key": file_key}
        )
        
        return StandardResponse.deleted(file_key)
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"File deletion failed: {str(e)}",
            category=LogCategory.SYSTEM,
            exception=e
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File deletion failed"
        )
