"""
API Versioning Support
Centralized versioning strategy for AutoBuddy API
Location: backend/app/utils/versioning.py
"""

from typing import Dict, List, Optional
from enum import Enum
from datetime import datetime, timedelta

class ApiVersion(Enum):
    """Supported API versions"""
    V1 = "v1"
    V2 = "v2"  # Planned
    V3 = "v3"  # Future

class VersionStatus(Enum):
    """Version lifecycle status"""
    STABLE = "stable"
    BETA = "beta"
    DEPRECATED = "deprecated"
    SUNSET = "sunset"

class VersionInfo:
    """Information about an API version"""

    def __init__(
        self,
        version: ApiVersion,
        status: VersionStatus,
        release_date: datetime,
        deprecation_date: Optional[datetime] = None,
        sunset_date: Optional[datetime] = None,
        changelog_url: Optional[str] = None
    ):
        self.version = version
        self.status = status
        self.release_date = release_date
        self.deprecation_date = deprecation_date
        self.sunset_date = sunset_date
        self.changelog_url = changelog_url

class VersioningStrategy:
    """Central versioning management"""

    # Deprecation timelines
    DEPRECATION_PERIOD = timedelta(days=180)  # 6 months
    SUNSET_PERIOD = timedelta(days=180)  # 6 months

    VERSIONS: Dict[str, VersionInfo] = {
        "v1": VersionInfo(
            version=ApiVersion.V1,
            status=VersionStatus.STABLE,
            release_date=datetime(2024, 1, 1),
            changelog_url="/docs/changelog/v1"
        )
    }

    @staticmethod
    def get_version_info(version_str: str) -> Optional[VersionInfo]:
        """Get info for a specific version"""
        return VersioningStrategy.VERSIONS.get(version_str)

    @staticmethod
    def is_version_supported(version_str: str) -> bool:
        """Check if version is still supported"""
        info = VersioningStrategy.get_version_info(version_str)
        if not info:
            return False

        now = datetime.now()
        if info.sunset_date and now > info.sunset_date:
            return False

        return True

    @staticmethod
    def is_version_deprecated(version_str: str) -> bool:
        """Check if version is deprecated"""
        info = VersioningStrategy.get_version_info(version_str)
        if not info:
            return False

        now = datetime.now()
        if info.deprecation_date and now > info.deprecation_date:
            return True

        return info.status == VersionStatus.DEPRECATED

    @staticmethod
    def get_current_version() -> str:
        """Get current stable version"""
        return "v1"

    @staticmethod
    def get_recommended_version() -> str:
        """Get recommended version for new integrations"""
        return "v1"

    @staticmethod
    def list_versions(include_deprecated: bool = False) -> List[VersionInfo]:
        """List all available versions"""
        versions = list(VersioningStrategy.VERSIONS.values())

        if not include_deprecated:
            versions = [v for v in versions if not VersioningStrategy.is_version_deprecated(v.version.value)]

        return versions

    @staticmethod
    def get_migration_path(from_version: str, to_version: str) -> Optional[List[str]]:
        """Get migration path between versions"""
        # Simple linear migration path
        all_versions = ["v1", "v2", "v3"]

        if from_version not in all_versions or to_version not in all_versions:
            return None

        from_idx = all_versions.index(from_version)
        to_idx = all_versions.index(to_version)

        if from_idx >= to_idx:
            return None

        return all_versions[from_idx:to_idx + 1]

class VersionHeader:
    """Extract version from request"""

    @staticmethod
    def from_request(request: dict) -> Optional[str]:
        """Extract version from request headers"""
        headers = request.get("headers", {})
        return headers.get("x-api-version") or headers.get("X-API-Version")

    @staticmethod
    def from_path(path: str) -> Optional[str]:
        """Extract version from URL path"""
        parts = path.split("/")
        for part in parts:
            if part.startswith("v") and part[1:].isdigit():
                return part
        return None

    @staticmethod
    def get_version(request: dict, default: str = "v1") -> str:
        """Get API version from request (header takes precedence)"""
        # Check header first
        version = VersionHeader.from_request(request)
        if version:
            return version

        # Check path
        path = request.get("path", "")
        version = VersionHeader.from_path(path)
        if version:
            return version

        return default

class VersionMiddleware:
    """Middleware for version validation and deprecation warnings"""

    @staticmethod
    def add_version_headers(response: dict, version: str) -> dict:
        """Add versioning headers to response"""
        info = VersioningStrategy.get_version_info(version)

        headers = {
            "X-API-Version": version,
            "X-API-Version-Status": info.status.value if info else "unknown",
        }

        if info and info.deprecation_date:
            headers["Deprecation"] = "true"
            headers["Sunset"] = info.deprecation_date.isoformat()

        return headers

    @staticmethod
    def validate_version(version: str) -> Optional[dict]:
        """Validate version and return error if unsupported"""
        if not VersioningStrategy.is_version_supported(version):
            return {
                "status": "error",
                "message": f"API version {version} is no longer supported",
                "error": {
                    "code": "unsupported_version",
                    "message": f"Version {version} has reached end of life",
                    "current_version": VersioningStrategy.get_current_version(),
                    "recommended_version": VersioningStrategy.get_recommended_version()
                }
            }

        if VersioningStrategy.is_version_deprecated(version):
            return {
                "status": "warning",
                "message": f"API version {version} is deprecated",
                "recommended_version": VersioningStrategy.get_recommended_version()
            }

        return None

# Export helper
def get_api_version(request_path: str, headers: dict = None) -> str:
    """Extract API version from request"""
    # Check header first
    if headers:
        version = headers.get("X-API-Version") or headers.get("x-api-version")
        if version:
            return version

    # Check path
    version = VersionHeader.from_path(request_path)
    if version:
        return version

    return "v1"
