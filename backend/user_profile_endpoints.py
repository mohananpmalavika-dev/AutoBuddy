# User Profile Endpoints

@api_router.get("/users/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Get user profile information including account details."""
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "role": user.get("role"),
        "created_at": user.get("created_at"),
    }


@api_router.put("/users/change-password")
async def change_password(
    body: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """Change user password with current password verification."""
    current_password = body.get("current_password", "").strip()
    new_password = body.get("new_password", "").strip()
    
    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Current and new passwords are required")
    
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    stored_password_hash = user.get("password_hash", "")
    if not bcrypt.checkpw(current_password.encode(), stored_password_hash.encode()):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    
    # Hash new password
    new_password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
    
    # Update password in database
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"password_hash": new_password_hash, "updated_at": datetime.now(timezone.utc)}}
    )
    
    return {"success": True, "message": "Password changed successfully"}


@api_router.post("/users/request-phone-change")
async def request_phone_change(
    body: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """Request phone number change by sending OTP to new phone."""
    new_phone = str(body.get("new_phone", "")).strip()
    
    if not new_phone or not re.match(r"^[0-9]{10}$", new_phone):
        raise HTTPException(status_code=400, detail="Valid 10-digit phone number required")
    
    if new_phone == current_user.get("phone"):
        raise HTTPException(status_code=400, detail="New phone must be different from current phone")
    
    # Check if phone is already in use
    existing_user = await db.users.find_one({"phone": new_phone, "id": {"$ne": current_user["id"]}})
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    
    # Generate OTP
    otp = str(random.randint(100000, 999999))
    otp_expiry = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
    
    # Store OTP request
    await db.phone_change_requests.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "new_phone": new_phone,
                "otp": bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode(),
                "otp_expiry": otp_expiry,
                "verified": False,
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True
    )
    
    # TODO: Send OTP to new_phone via SMS/notification
    # For now, log it
    logger.info(f"Phone change OTP for user {current_user['id']}: {otp} (expires at {otp_expiry})")
    
    return {"success": True, "message": f"OTP sent to {new_phone}"}


@api_router.post("/users/verify-phone-change")
async def verify_phone_change(
    body: dict = {},
    current_user: dict = Depends(get_current_user)
):
    """Verify phone change with OTP and submit for admin approval."""
    new_phone = str(body.get("new_phone", "")).strip()
    otp = str(body.get("otp", "")).strip()
    
    if not new_phone or not otp:
        raise HTTPException(status_code=400, detail="Phone and OTP required")
    
    # Find phone change request
    request = await db.phone_change_requests.find_one({"user_id": current_user["id"]})
    if not request:
        raise HTTPException(status_code=400, detail="No phone change request found")
    
    if request.get("new_phone") != new_phone:
        raise HTTPException(status_code=400, detail="Phone mismatch")
    
    # Check OTP expiry
    if request.get("otp_expiry") < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Verify OTP
    stored_otp_hash = request.get("otp", "")
    if not bcrypt.checkpw(otp.encode(), stored_otp_hash.encode()):
        raise HTTPException(status_code=401, detail="Invalid OTP")
    
    # Mark as verified and pending admin approval
    await db.phone_change_requests.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "verified": True,
                "verified_at": datetime.now(timezone.utc),
                "status": "pending_admin_approval",
            }
        }
    )
    
    # TODO: Notify admin about pending phone change
    logger.info(f"User {current_user['id']} verified phone change to {new_phone}, pending admin approval")
    
    return {
        "success": True,
        "message": f"Phone change to {new_phone} submitted for admin approval",
        "pending_phone": new_phone,
    }


@api_router.get("/drivers/profile")
async def get_driver_profile(current_user: dict = Depends(get_current_user)):
    """Get driver profile including auto and owner details."""
    if current_user.get("role") != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this endpoint")
    
    driver = await db.drivers.find_one({"user_id": current_user["id"]})
    if not driver:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    
    return {
        "id": current_user["id"],
        "email": current_user.get("email"),
        "name": current_user.get("name"),
        "phone": current_user.get("phone"),
        "auto_details": {
            "auto_number": driver.get("auto_number"),
            "auto_stand_licence_number": driver.get("auto_stand_licence_number"),
            "auto_model": driver.get("auto_model"),
            "auto_color": driver.get("auto_color"),
            "auto_registration_number": driver.get("auto_registration_number"),
            "auto_ownership_type": driver.get("auto_ownership_type"),  # 'owned' or 'rented'
        },
        "owner_details": {
            "owner_name": driver.get("owner_name") if driver.get("auto_ownership_type") == "rented" else current_user.get("name"),
            "owner_phone": driver.get("owner_phone") if driver.get("auto_ownership_type") == "rented" else current_user.get("phone"),
            "owner_email": driver.get("owner_email") if driver.get("auto_ownership_type") == "rented" else current_user.get("email"),
            "owner_address": driver.get("owner_address") if driver.get("auto_ownership_type") == "rented" else None,
        },
    }
