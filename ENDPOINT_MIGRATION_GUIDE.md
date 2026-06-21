# Endpoint Migration Guide: API Standardization

This guide walks through migrating backend endpoints to use standardized API responses.

## Quick Start

### 1. Import Required Utilities

```python
from app.utils.unified_responses import ResponseBuilder, ErrorCode, ErrorDetail
from app.utils.error_handler import ErrorResponse, ValidationErrorDetail
from app.utils.pagination import PaginationParams, PaginationMeta
from app.utils.versioning import get_api_version
```

### 2. Update a GET Endpoint (Single Resource)

**Before:**
```python
@router.get("/{user_id}")
async def get_user(user_id: str, request: Request):
    try:
        user = await db.users.find_one({"_id": user_id})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail="Server error")
```

**After:**
```python
@router.get("/{user_id}")
async def get_user(user_id: str, request: Request):
    try:
        user = await db.users.find_one({"_id": user_id})
        if not user:
            response, status_code = ErrorResponse.not_found("User", user_id)
            return response.to_dict(), status_code

        response, status_code = ResponseBuilder.success(
            data=user,
            message="User retrieved successfully"
        )
        return response.to_dict(), status_code
    except Exception as e:
        logger.error(f"Error retrieving user: {str(e)}")
        response, status_code = ErrorResponse.server_error()
        return response.to_dict(), status_code
```

### 3. Update a POST Endpoint (Create Resource)

**Before:**
```python
@router.post("")
async def create_user(user_data: UserCreate, request: Request):
    try:
        result = await db.users.insert_one(user_data.dict())
        created_user = await db.users.find_one({"_id": result.inserted_id})
        return created_user
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create user")
```

**After:**
```python
@router.post("")
async def create_user(user_data: UserCreate, request: Request):
    try:
        # Validate input
        errors = []
        if not user_data.email:
            errors.append(ValidationErrorDetail.field_error("email", "required", "Email is required"))
        if not user_data.name:
            errors.append(ValidationErrorDetail.field_error("name", "required", "Name is required"))

        if errors:
            response, status_code = ResponseBuilder.validation_error(errors)
            return response.to_dict(), status_code

        result = await db.users.insert_one(user_data.dict())
        created_user = await db.users.find_one({"_id": result.inserted_id})

        response, status_code = ResponseBuilder.created(
            data=created_user,
            resource_id=str(result.inserted_id),
            message="User created successfully"
        )
        return response.to_dict(), status_code

    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        response, status_code = ErrorResponse.server_error()
        return response.to_dict(), status_code
```

### 4. Update a GET Endpoint (List with Pagination)

**Before:**
```python
@router.get("")
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    request: Request = None
):
    try:
        users = await db.users.find().skip(skip).limit(limit).to_list(None)
        total = await db.users.count_documents({})
        return {
            "items": users,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to list users")
```

**After:**
```python
@router.get("")
async def list_users(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    request: Request = None
):
    try:
        users = await db.users.find().skip(offset).limit(limit).to_list(None)
        total = await db.users.count_documents({})

        response, status_code = ResponseBuilder.paginated(
            items=users,
            total=total,
            limit=limit,
            offset=offset,
            message="Users retrieved successfully"
        )
        return response.to_dict(), status_code

    except Exception as e:
        logger.error(f"Error listing users: {str(e)}")
        response, status_code = ErrorResponse.server_error()
        return response.to_dict(), status_code
```

### 5. Update a PUT Endpoint (Update Resource)

**Before:**
```python
@router.put("/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, request: Request):
    try:
        await db.users.update_one({"_id": user_id}, {"$set": user_data.dict(exclude_unset=True)})
        updated_user = await db.users.find_one({"_id": user_id})
        return updated_user
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update user")
```

**After:**
```python
@router.put("/{user_id}")
async def update_user(user_id: str, user_data: UserUpdate, request: Request):
    try:
        # Verify user exists
        existing = await db.users.find_one({"_id": user_id})
        if not existing:
            response, status_code = ErrorResponse.not_found("User", user_id)
            return response.to_dict(), status_code

        await db.users.update_one({"_id": user_id}, {"$set": user_data.dict(exclude_unset=True)})
        updated_user = await db.users.find_one({"_id": user_id})

        response, status_code = ResponseBuilder.updated(
            data=updated_user,
            message="User updated successfully"
        )
        return response.to_dict(), status_code

    except Exception as e:
        logger.error(f"Error updating user: {str(e)}")
        response, status_code = ErrorResponse.server_error()
        return response.to_dict(), status_code
```

### 6. Update a DELETE Endpoint

**Before:**
```python
@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    try:
        await db.users.delete_one({"_id": user_id})
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete user")
```

**After:**
```python
@router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request):
    try:
        result = await db.users.delete_one({"_id": user_id})
        
        if result.deleted_count == 0:
            response, status_code = ErrorResponse.not_found("User", user_id)
            return response.to_dict(), status_code

        response, status_code = ResponseBuilder.deleted(
            resource_id=user_id,
            message="User deleted successfully"
        )
        return response.to_dict(), status_code

    except Exception as e:
        logger.error(f"Error deleting user: {str(e)}")
        response, status_code = ErrorResponse.server_error()
        return response.to_dict(), status_code
```

## Common Patterns

### Pattern 1: Validation Error
```python
errors = [
    ValidationErrorDetail.field_error("email", "invalid", "Invalid email format"),
    ValidationErrorDetail.field_error("phone", "required", "Phone is required")
]
response, status_code = ResponseBuilder.validation_error(errors)
return response.to_dict(), status_code
```

### Pattern 2: Not Found
```python
response, status_code = ErrorResponse.not_found("Resource", resource_id)
return response.to_dict(), status_code
```

### Pattern 3: Unauthorized
```python
response, status_code = ErrorResponse.unauthorized("Invalid credentials")
return response.to_dict(), status_code
```

### Pattern 4: Forbidden
```python
response, status_code = ErrorResponse.forbidden("Insufficient permissions")
return response.to_dict(), status_code
```

### Pattern 5: Conflict
```python
response, status_code = ErrorResponse.conflict("duplicate_email", "Email already registered")
return response.to_dict(), status_code
```

## Migration Checklist

For each endpoint, verify:

- [ ] GET single resource returns success response with data
- [ ] GET list returns paginated response with metadata
- [ ] POST returns created response with 201 status
- [ ] PUT/PATCH returns updated response with 200 status
- [ ] DELETE returns deleted response with resource_id in metadata
- [ ] 404 errors use `ErrorResponse.not_found()`
- [ ] 401/403 errors use `ErrorResponse.unauthorized()` / `.forbidden()`
- [ ] Validation errors use `ErrorResponse.validation_failed()` with 422 status
- [ ] All errors include proper error codes and messages
- [ ] Pagination includes has_next, has_prev, page metadata
- [ ] Error logging includes context and request_id

## Testing Standardized Responses

```python
# Test success response
response = ResponseBuilder.success(data={"id": 1})
assert response.status == "success"
assert response.data == {"id": 1}

# Test error response
response, status = ResponseBuilder.not_found("User", "123")
assert response.status == "error"
assert status == 404
assert response.error["code"] == "not_found"

# Test paginated response
response, status = ResponseBuilder.paginated([1, 2, 3], total=10, limit=3, offset=0)
assert response.pagination["total"] == 10
assert response.pagination["pages"] == 4
assert response.pagination["has_next"] == True
```

## Related Files

- Response Builder: `app/utils/unified_responses.py`
- Error Handler: `app/utils/error_handler.py`
- Pagination: `app/utils/pagination.py`
- Versioning: `app/utils/versioning.py`
- API Standards: `API_STANDARDIZATION.md`
