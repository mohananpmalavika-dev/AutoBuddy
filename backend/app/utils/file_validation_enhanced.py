"""
Enhanced File Upload Validation
Advanced security and validation checks for file uploads
"""

import os
import hashlib
import mimetypes
from typing import Optional, Tuple, Dict, List
from datetime import datetime, timezone
import io
import struct

try:
    from PIL import Image
except ImportError:
    Image = None

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


class FileSignatureValidator:
    """Validate files by magic numbers (file signatures)"""
    
    # Magic numbers for file types
    MAGIC_NUMBERS = {
        # Images
        b'\xFF\xD8\xFF': 'jpeg',           # JPEG
        b'\x89PNG\r\n\x1a\n': 'png',       # PNG
        b'GIF87a': 'gif',                  # GIF 87a
        b'GIF89a': 'gif',                  # GIF 89a
        b'RIFF': 'webp',                   # WebP/WAV/AVI
        # Documents
        b'%PDF': 'pdf',                    # PDF
    }
    
    @staticmethod
    def get_file_signature(file_content: bytes, max_bytes: int = 32) -> bytes:
        """Extract file signature (magic number)"""
        return file_content[:max_bytes]
    
    @staticmethod
    def detect_file_type(file_content: bytes) -> Optional[str]:
        """Detect actual file type from magic numbers"""
        signature = FileSignatureValidator.get_file_signature(file_content)
        
        # Check WebP specifically (RIFF + WEBP format)
        if signature.startswith(b'RIFF') and b'WEBP' in file_content[:12]:
            return 'webp'
        
        # Check other magic numbers
        for magic, file_type in FileSignatureValidator.MAGIC_NUMBERS.items():
            if signature.startswith(magic):
                return file_type
        
        return None
    
    @staticmethod
    def validate_file_signature(
        file_content: bytes,
        declared_type: str
    ) -> Tuple[bool, Optional[str]]:
        """Verify file signature matches declared type"""
        detected_type = FileSignatureValidator.detect_file_type(file_content)
        
        if not detected_type:
            return False, "File type not recognized or corrupted"
        
        # Map MIME type to detected type
        type_map = {
            'image/jpeg': 'jpeg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf'
        }
        
        expected_type = type_map.get(declared_type, declared_type.split('/')[-1])
        
        if detected_type != expected_type:
            return False, f"File signature doesn't match. Detected: {detected_type}, Expected: {expected_type}"
        
        return True, None


class ImageValidator:
    """Advanced image validation"""
    
    @staticmethod
    def validate_image_dimensions(
        file_content: bytes,
        min_width: int = 100,
        min_height: int = 100,
        max_width: int = 4000,
        max_height: int = 4000
    ) -> Tuple[bool, Optional[str], Optional[Dict]]:
        """Validate image dimensions"""
        if not Image:
            return True, None, None
        
        try:
            image = Image.open(io.BytesIO(file_content))
            width, height = image.size
            
            if width < min_width or height < min_height:
                return False, f"Image too small. Minimum: {min_width}x{min_height}", None
            
            if width > max_width or height > max_height:
                return False, f"Image too large. Maximum: {max_width}x{max_height}", None
            
            # Return image info
            info = {
                "width": width,
                "height": height,
                "format": image.format,
                "mode": image.mode
            }
            
            return True, None, info
        
        except Exception as e:
            return False, f"Invalid image file: {str(e)}", None
    
    @staticmethod
    def strip_exif_data(file_content: bytes) -> Tuple[bytes, bool]:
        """Remove EXIF/metadata from images"""
        if not Image:
            return file_content, False
        
        try:
            image = Image.open(io.BytesIO(file_content))
            
            # Remove EXIF data
            data = list(image.getdata())
            image_without_exif = Image.new(image.mode, image.size)
            image_without_exif.putdata(data)
            
            # Convert back to bytes
            output = io.BytesIO()
            image_without_exif.save(output, format=image.format, quality=95)
            
            return output.getvalue(), True
        
        except Exception as e:
            logger.log_endpoint_request(
                endpoint="strip_exif",
                status="warning",
                metadata={"error": str(e)}
            )
            return file_content, False


class DuplicateDetector:
    """Detect duplicate file uploads"""
    
    @staticmethod
    def calculate_file_hash(file_content: bytes) -> str:
        """Calculate SHA256 hash of file"""
        return hashlib.sha256(file_content).hexdigest()
    
    @staticmethod
    def generate_content_hash(file_content: bytes) -> str:
        """Generate hash for duplicate detection"""
        # For images, hash first 1MB to detect similar files
        sample = file_content[:1024 * 1024]
        return hashlib.md5(sample).hexdigest()


class StorageQuotaManager:
    """Manage user storage quotas"""
    
    # Default quotas (in bytes)
    DEFAULT_QUOTAS = {
        "free": 100 * 1024 * 1024,        # 100MB
        "premium": 1024 * 1024 * 1024,    # 1GB
        "vip": 5 * 1024 * 1024 * 1024     # 5GB
    }
    
    @staticmethod
    async def check_storage_quota(
        user_id: str,
        file_size: int,
        user_tier: str = "free",
        storage_service = None
    ) -> Tuple[bool, Optional[str], Dict]:
        """Check if user has storage quota for this file"""
        
        quota = StorageQuotaManager.DEFAULT_QUOTAS.get(user_tier, 100 * 1024 * 1024)
        
        # Get current usage (placeholder - would query from database)
        current_usage = 0
        if storage_service:
            try:
                current_usage = await storage_service.get_user_storage_usage(user_id)
            except Exception as e:
                logger.log_endpoint_request(
                    endpoint="check_quota",
                    status="warning",
                    metadata={"error": str(e)}
                )
        
        available = quota - current_usage
        
        if file_size > available:
            return False, f"Storage quota exceeded. Available: {available / 1024 / 1024:.1f}MB", {
                "quota": quota,
                "current_usage": current_usage,
                "available": available
            }
        
        stats = {
            "quota": quota,
            "current_usage": current_usage,
            "after_upload": current_usage + file_size,
            "available_after": available - file_size
        }
        
        return True, None, stats


class EnhancedFileValidator:
    """Enhanced file validation with security checks"""
    
    def __init__(self):
        self.signature_validator = FileSignatureValidator()
        self.image_validator = ImageValidator()
        self.duplicate_detector = DuplicateDetector()
        self.quota_manager = StorageQuotaManager()
    
    async def validate_file_upload(
        self,
        file_content: bytes,
        file_name: str,
        declared_mime_type: str,
        user_id: str,
        user_tier: str = "free",
        check_quota: bool = True,
        strip_metadata: bool = True
    ) -> Dict:
        """
        Comprehensive file validation
        
        Returns dict with:
        {
            "valid": bool,
            "errors": [list of error messages],
            "warnings": [list of warnings],
            "file_info": {metadata about the file},
            "cleaned_content": bytes (if metadata was stripped),
            "actions_taken": [list of actions performed]
        }
        """
        
        result = {
            "valid": True,
            "errors": [],
            "warnings": [],
            "file_info": {},
            "cleaned_content": file_content,
            "actions_taken": []
        }
        
        # 1. Check file size
        if len(file_content) == 0:
            result["errors"].append("File is empty")
            result["valid"] = False
            return result
        
        if len(file_content) > 50 * 1024 * 1024:  # 50MB
            result["errors"].append("File too large (max 50MB)")
            result["valid"] = False
            return result
        
        result["file_info"]["size"] = len(file_content)
        
        # 2. Validate file signature
        valid, error = self.signature_validator.validate_file_signature(
            file_content,
            declared_mime_type
        )
        
        if not valid:
            result["errors"].append(error)
            result["valid"] = False
            return result
        
        detected_type = self.signature_validator.detect_file_type(file_content)
        result["file_info"]["detected_type"] = detected_type
        result["actions_taken"].append("Signature validated")
        
        # 3. For images: validate dimensions and strip metadata
        if detected_type in ['jpeg', 'png', 'gif', 'webp']:
            valid, error, image_info = self.image_validator.validate_image_dimensions(
                file_content
            )
            
            if not valid:
                result["errors"].append(error)
                result["valid"] = False
                return result
            
            result["file_info"]["image"] = image_info
            result["actions_taken"].append("Image dimensions validated")
            
            # Strip EXIF/metadata from images
            if strip_metadata:
                cleaned, was_stripped = self.image_validator.strip_exif_data(file_content)
                if was_stripped:
                    result["cleaned_content"] = cleaned
                    result["actions_taken"].append("EXIF/metadata stripped")
                    result["file_info"]["size_after_cleaning"] = len(cleaned)
        
        # 4. Check storage quota
        if check_quota:
            valid, error, quota_info = await self.quota_manager.check_storage_quota(
                user_id,
                len(result["cleaned_content"]),
                user_tier
            )
            
            if not valid:
                result["errors"].append(error)
                result["valid"] = False
            
            result["file_info"]["quota"] = quota_info
            result["actions_taken"].append("Storage quota checked")
        
        # 5. Calculate file hash for duplicate detection
        file_hash = self.duplicate_detector.calculate_file_hash(result["cleaned_content"])
        result["file_info"]["sha256"] = file_hash
        result["actions_taken"].append("File hash calculated")
        
        # 6. Generate safe filename
        safe_name = self._generate_safe_filename(file_name)
        result["file_info"]["original_name"] = file_name
        result["file_info"]["safe_name"] = safe_name
        
        return result
    
    @staticmethod
    def _generate_safe_filename(filename: str) -> str:
        """Generate safe filename without special characters"""
        import re
        
        # Remove special characters
        safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
        
        # Limit length
        if len(safe_name) > 255:
            name, ext = os.path.splitext(safe_name)
            safe_name = name[:250] + ext
        
        return safe_name


# Singleton instance
_validator = None

def get_file_validator() -> EnhancedFileValidator:
    """Get or create file validator instance"""
    global _validator
    if _validator is None:
        _validator = EnhancedFileValidator()
    return _validator
