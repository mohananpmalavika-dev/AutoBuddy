"""
Standardized Pagination Helper
Implements consistent pagination across all endpoints
Location: backend/app/utils/pagination.py
"""

from typing import Any, List, Optional, Tuple
from fastapi import Query

class PaginationParams:
    """Extract and validate pagination parameters"""

    @staticmethod
    def from_query(
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0)
    ) -> Tuple[int, int]:
        """Extract pagination parameters from query"""
        return limit, offset

    @staticmethod
    def from_page_based(
        page: int = Query(1, ge=1),
        per_page: int = Query(20, ge=1, le=100)
    ) -> Tuple[int, int]:
        """Convert page-based pagination to offset-based"""
        offset = (page - 1) * per_page
        return per_page, offset

class PaginationMeta:
    """Build pagination metadata for responses"""

    @staticmethod
    def build(
        total: int,
        limit: int,
        offset: int
    ) -> dict:
        """Build pagination metadata"""
        page = (offset // limit) + 1 if limit > 0 else 1
        pages = (total + limit - 1) // limit if limit > 0 else 1

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "page": page,
            "pages": pages,
            "has_next": offset + limit < total,
            "has_prev": offset > 0,
        }

    @staticmethod
    def build_cursor(
        items: List[Any],
        has_more: bool,
        cursor: Optional[str] = None
    ) -> dict:
        """Build cursor-based pagination metadata"""
        next_cursor = None
        if has_more and items:
            # Extract last item's ID as next cursor
            last_item = items[-1]
            next_cursor = str(last_item.get("id") or last_item.get("_id"))

        return {
            "has_more": has_more,
            "cursor": cursor,
            "next_cursor": next_cursor,
            "count": len(items),
        }

class PaginationValidator:
    """Validate pagination parameters"""

    MIN_LIMIT = 1
    MAX_LIMIT = 100
    DEFAULT_LIMIT = 20
    DEFAULT_OFFSET = 0

    @staticmethod
    def validate_limit(limit: int) -> int:
        """Validate and clamp limit"""
        if limit < PaginationValidator.MIN_LIMIT:
            return PaginationValidator.MIN_LIMIT
        if limit > PaginationValidator.MAX_LIMIT:
            return PaginationValidator.MAX_LIMIT
        return limit

    @staticmethod
    def validate_offset(offset: int) -> int:
        """Validate and clamp offset"""
        if offset < 0:
            return PaginationValidator.DEFAULT_OFFSET
        return offset

    @staticmethod
    def validate_page(page: int, per_page: int) -> Tuple[int, int]:
        """Validate page-based pagination"""
        page = max(1, page)
        per_page = PaginationValidator.validate_limit(per_page)
        return page, per_page

# Export helpers
def get_pagination_params(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0)
) -> Tuple[int, int]:
    """FastAPI dependency for pagination parameters"""
    return limit, offset

def get_page_params(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100)
) -> Tuple[int, int]:
    """FastAPI dependency for page-based parameters"""
    return page, per_page
