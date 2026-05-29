"""
AWS S3 File Upload System
Handles file uploads, downloads, and signed URL generation
"""

import os
import logging
from typing import Optional, Tuple
from datetime import datetime, timezone
import hashlib

try:
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError
except ImportError:
    boto3 = None

    class ClientError(Exception):
        pass

    class NoCredentialsError(Exception):
        pass

from app.utils.logging_config import StructuredLogger, LogCategory

logger = logging.getLogger(__name__)
structured_logger = StructuredLogger(__name__)


class FileUploadConfig:
    """File upload configuration"""
    
    # AWS S3 Configuration
    AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
    AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "autobuddy-files")
    
    # File upload limits
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB
    MAX_DOCUMENT_SIZE = 25 * 1024 * 1024  # 25MB
    
    # Allowed file types
    ALLOWED_IMAGE_TYPES = {
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/webp': ['.webp'],
        'image/gif': ['.gif']
    }
    
    ALLOWED_DOCUMENT_TYPES = {
        'application/pdf': ['.pdf'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
    }
    
    # Upload folder structure
    UPLOAD_FOLDERS = {
        'profile_photos': 'users/profile_photos/',
        'driver_documents': 'drivers/documents/',
        'vehicle_documents': 'vehicles/documents/',
        'ride_receipts': 'rides/receipts/',
        'support_attachments': 'support/attachments/',
    }
    
    # Signed URL expiration (seconds)
    SIGNED_URL_EXPIRATION = 3600  # 1 hour


class S3Client:
    """AWS S3 client wrapper"""
    
    def __init__(self):
        self.client = None
        self.bucket = FileUploadConfig.AWS_S3_BUCKET
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize S3 client"""
        try:
            if boto3 is None:
                structured_logger.warning(
                    "boto3 is not installed; S3 uploads are disabled",
                    category=LogCategory.SYSTEM
                )
                return

            if not FileUploadConfig.AWS_ACCESS_KEY_ID:
                structured_logger.warning(
                    "AWS credentials not configured",
                    category=LogCategory.SYSTEM
                )
                return
            
            self.client = boto3.client(
                's3',
                region_name=FileUploadConfig.AWS_REGION,
                aws_access_key_id=FileUploadConfig.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=FileUploadConfig.AWS_SECRET_ACCESS_KEY
            )
            
            structured_logger.log_operation(
                "s3_client_init",
                "success",
                category=LogCategory.SYSTEM,
                metadata={"bucket": self.bucket}
            )
        
        except NoCredentialsError:
            structured_logger.error(
                "AWS credentials not found",
                category=LogCategory.SYSTEM
            )
        except Exception as e:
            structured_logger.error(
                f"S3 client initialization failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
    
    async def upload_file(
        self,
        file_content: bytes,
        file_name: str,
        folder: str,
        content_type: str,
        metadata: Optional[dict] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Upload file to S3
        Returns: (success, file_key, error_message)
        """
        try:
            if not self.client:
                return False, None, "S3 client not initialized"
            
            # Generate S3 key
            file_key = f"{folder}{file_name}"
            
            # Prepare metadata
            s3_metadata = metadata or {}
            s3_metadata['uploaded_at'] = datetime.now(timezone.utc).isoformat()
            
            # Upload to S3
            self.client.put_object(
                Bucket=self.bucket,
                Key=file_key,
                Body=file_content,
                ContentType=content_type,
                Metadata=s3_metadata,
                ServerSideEncryption='AES256'
            )
            
            structured_logger.log_operation(
                "s3_upload",
                "success",
                category=LogCategory.SYSTEM,
                metadata={
                    "file_key": file_key,
                    "size": len(file_content)
                }
            )
            
            return True, file_key, None
        
        except ClientError as e:
            error_msg = str(e)
            structured_logger.error(
                f"S3 upload failed: {error_msg}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, error_msg
        except Exception as e:
            error_msg = str(e)
            structured_logger.error(
                f"Upload error: {error_msg}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, error_msg
    
    async def delete_file(self, file_key: str) -> Tuple[bool, Optional[str]]:
        """
        Delete file from S3
        Returns: (success, error_message)
        """
        try:
            if not self.client:
                return False, "S3 client not initialized"
            
            self.client.delete_object(
                Bucket=self.bucket,
                Key=file_key
            )
            
            structured_logger.log_operation(
                "s3_delete",
                "success",
                category=LogCategory.SYSTEM,
                metadata={"file_key": file_key}
            )
            
            return True, None
        
        except Exception as e:
            error_msg = str(e)
            structured_logger.error(
                f"S3 delete failed: {error_msg}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, error_msg
    
    async def get_signed_url(
        self,
        file_key: str,
        expiration_seconds: Optional[int] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Generate signed URL for download
        Returns: (success, signed_url, error_message)
        """
        try:
            if not self.client:
                return False, None, "S3 client not initialized"
            
            expiration = expiration_seconds or FileUploadConfig.SIGNED_URL_EXPIRATION
            
            url = self.client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket, 'Key': file_key},
                ExpiresIn=expiration
            )
            
            structured_logger.log_operation(
                "s3_signed_url",
                "success",
                category=LogCategory.SYSTEM,
                metadata={"file_key": file_key}
            )
            
            return True, url, None
        
        except Exception as e:
            error_msg = str(e)
            structured_logger.error(
                f"Signed URL generation failed: {error_msg}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, error_msg


class FileValidator:
    """Validates files before upload"""
    
    @staticmethod
    def validate_size(file_content: bytes, max_size: int) -> Tuple[bool, Optional[str]]:
        """Validate file size"""
        if len(file_content) > max_size:
            return False, f"File too large. Maximum size: {max_size / 1024 / 1024:.0f}MB"
        return True, None
    
    @staticmethod
    def validate_image_file(
        file_content: bytes,
        file_name: str,
        mime_type: str
    ) -> Tuple[bool, Optional[str]]:
        """Validate image file"""
        # Check size
        valid, msg = FileValidator.validate_size(
            file_content,
            FileUploadConfig.MAX_IMAGE_SIZE
        )
        if not valid:
            return False, msg
        
        # Check MIME type
        if mime_type not in FileUploadConfig.ALLOWED_IMAGE_TYPES:
            return False, f"Image type not allowed: {mime_type}"
        
        # Check extension
        _, ext = os.path.splitext(file_name)
        if ext.lower() not in FileUploadConfig.ALLOWED_IMAGE_TYPES[mime_type]:
            return False, "File extension doesn't match MIME type"
        
        return True, None
    
    @staticmethod
    def validate_document_file(
        file_content: bytes,
        file_name: str,
        mime_type: str
    ) -> Tuple[bool, Optional[str]]:
        """Validate document file"""
        # Check size
        valid, msg = FileValidator.validate_size(
            file_content,
            FileUploadConfig.MAX_DOCUMENT_SIZE
        )
        if not valid:
            return False, msg
        
        # Check MIME type
        if mime_type not in FileUploadConfig.ALLOWED_DOCUMENT_TYPES:
            return False, f"Document type not allowed: {mime_type}"
        
        # Check extension
        _, ext = os.path.splitext(file_name)
        if ext.lower() not in FileUploadConfig.ALLOWED_DOCUMENT_TYPES[mime_type]:
            return False, "File extension doesn't match MIME type"
        
        return True, None
    
    @staticmethod
    def generate_file_name(
        original_name: str,
        prefix: str = ""
    ) -> str:
        """Generate safe file name"""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        name, ext = os.path.splitext(original_name)
        
        # Generate hash for uniqueness
        hash_suffix = hashlib.md5(original_name.encode()).hexdigest()[:8]
        
        if prefix:
            return f"{prefix}_{timestamp}_{hash_suffix}{ext}"
        return f"{timestamp}_{hash_suffix}{ext}"


class FileUploadService:
    """High-level file upload service"""
    
    def __init__(self):
        self.s3_client = S3Client()
        self.validator = FileValidator()
    
    async def upload_profile_photo(
        self,
        file_content: bytes,
        file_name: str,
        user_id: str,
        mime_type: str = "image/jpeg"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Upload user profile photo"""
        try:
            # Validate file
            valid, error = self.validator.validate_image_file(
                file_content,
                file_name,
                mime_type
            )
            if not valid:
                return False, None, error
            
            # Generate file name
            safe_name = self.validator.generate_file_name(
                file_name,
                prefix=user_id
            )
            
            # Upload to S3
            success, file_key, error = await self.s3_client.upload_file(
                file_content=file_content,
                file_name=safe_name,
                folder=FileUploadConfig.UPLOAD_FOLDERS['profile_photos'],
                content_type=mime_type,
                metadata={"user_id": user_id}
            )
            
            if not success:
                return False, None, error
            
            # Generate signed URL
            success, url, error = await self.s3_client.get_signed_url(file_key)
            
            return success, url or file_key, error
        
        except Exception as e:
            structured_logger.error(
                f"Profile photo upload failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, str(e)
    
    async def upload_driver_document(
        self,
        file_content: bytes,
        file_name: str,
        driver_id: str,
        document_type: str,
        mime_type: str = "application/pdf"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Upload driver verification document"""
        try:
            # Validate file
            valid, error = self.validator.validate_document_file(
                file_content,
                file_name,
                mime_type
            )
            if not valid:
                return False, None, error
            
            # Generate file name
            safe_name = self.validator.generate_file_name(
                file_name,
                prefix=f"{driver_id}_{document_type}"
            )
            
            # Upload to S3
            success, file_key, error = await self.s3_client.upload_file(
                file_content=file_content,
                file_name=safe_name,
                folder=FileUploadConfig.UPLOAD_FOLDERS['driver_documents'],
                content_type=mime_type,
                metadata={
                    "driver_id": driver_id,
                    "document_type": document_type
                }
            )
            
            return success, file_key, error
        
        except Exception as e:
            structured_logger.error(
                f"Driver document upload failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, str(e)

    async def upload_vehicle_document(
        self,
        file_content: bytes,
        file_name: str,
        vehicle_id: str,
        driver_id: str,
        document_type: str,
        mime_type: str = "application/pdf"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Upload vehicle verification document"""
        try:
            if document_type == "badge_photo":
                valid, error = self.validator.validate_image_file(
                    file_content,
                    file_name,
                    mime_type
                )
            else:
                valid, error = self.validator.validate_document_file(
                    file_content,
                    file_name,
                    mime_type
                )
            if not valid:
                return False, None, error

            safe_name = self.validator.generate_file_name(
                file_name,
                prefix=f"{driver_id}_{vehicle_id}_{document_type}"
            )

            success, file_key, error = await self.s3_client.upload_file(
                file_content=file_content,
                file_name=safe_name,
                folder=FileUploadConfig.UPLOAD_FOLDERS['vehicle_documents'],
                content_type=mime_type,
                metadata={
                    "driver_id": driver_id,
                    "vehicle_id": vehicle_id,
                    "document_type": document_type
                }
            )

            return success, file_key, error

        except Exception as e:
            structured_logger.error(
                f"Vehicle document upload failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, str(e)
    
    async def upload_ride_receipt(
        self,
        file_content: bytes,
        file_name: str,
        ride_id: str,
        mime_type: str = "application/pdf"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Upload ride receipt"""
        try:
            # Generate file name
            safe_name = self.validator.generate_file_name(
                file_name,
                prefix=ride_id
            )
            
            # Upload to S3
            success, file_key, error = await self.s3_client.upload_file(
                file_content=file_content,
                file_name=safe_name,
                folder=FileUploadConfig.UPLOAD_FOLDERS['ride_receipts'],
                content_type=mime_type,
                metadata={"ride_id": ride_id}
            )
            
            return success, file_key, error
        
        except Exception as e:
            structured_logger.error(
                f"Receipt upload failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, str(e)
    
    async def upload_support_attachment(
        self,
        file_content: bytes,
        file_name: str,
        ticket_id: str,
        user_id: str,
        mime_type: str = "application/pdf"
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Upload support ticket attachment"""
        try:
            # Generate file name
            safe_name = self.validator.generate_file_name(
                file_name,
                prefix=f"{ticket_id}_{user_id}"
            )
            
            # Upload to S3
            success, file_key, error = await self.s3_client.upload_file(
                file_content=file_content,
                file_name=safe_name,
                folder=FileUploadConfig.UPLOAD_FOLDERS['support_attachments'],
                content_type=mime_type,
                metadata={
                    "ticket_id": ticket_id,
                    "user_id": user_id
                }
            )
            
            return success, file_key, error
        
        except Exception as e:
            structured_logger.error(
                f"Support attachment upload failed: {str(e)}",
                category=LogCategory.SYSTEM,
                exception=e
            )
            return False, None, str(e)
    
    async def delete_file(self, file_key: str) -> Tuple[bool, Optional[str]]:
        """Delete file from S3"""
        return await self.s3_client.delete_file(file_key)
    
    async def get_download_url(
        self,
        file_key: str,
        expiration_seconds: Optional[int] = None
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """Generate signed download URL"""
        return await self.s3_client.get_signed_url(file_key, expiration_seconds)


# Global file upload service instance
file_upload_service = FileUploadService()
