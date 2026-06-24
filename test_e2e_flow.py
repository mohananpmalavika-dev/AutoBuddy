#!/usr/bin/env python3
"""
End-to-end test for AutoBuddy passenger flow using port 8001
Tests: Send Email OTP -> Register -> Login -> Create booking -> Get booking status
"""

import requests
import json
import sys
import random
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8001"
UNIQUE_ID = str(int(datetime.now().timestamp() * 1000000) % 10000000)
EMAIL = f"passenger.test.{UNIQUE_ID}@test.com"
PHONE = f"98765{str(random.randint(10000, 99999))}"
PASSWORD = "Test123456"  # Must contain uppercase letter

# Colors for output
GREEN = '\033[92m'
RED = '\033[91m'
YELLOW = '\033[93m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_test(message):
    print(f"{BLUE}[TEST]{RESET} {message}")

def print_success(message):
    print(f"{GREEN}[✓]{RESET} {message}")

def print_error(message):
    print(f"{RED}[✗]{RESET} {message}")

def print_warning(message):
    print(f"{YELLOW}[!]{RESET} {message}")

def test_server_health():
    """Test if server is running"""
    print_test(f"Checking server health at {BASE_URL}")
    try:
        response = requests.get(f"{BASE_URL}/api/health/live", timeout=5)
        if response.status_code == 200:
            print_success(f"Server is running: {response.json()}")
            return True
        else:
            print_error(f"Server returned {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Server not responding: {e}")
        return False

def test_send_email_otp():
    """Test sending email OTP"""
    print_test("Sending email OTP for registration")
    payload = {"email": EMAIL}
    try:
        response = requests.post(f"{BASE_URL}/api/auth/email-otp/send", json=payload, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            print_success(f"Email OTP sent successfully: {data}")
            # Extract the OTP from the response (otp_demo or otp field)
            otp = data.get("otp_demo") or data.get("otp", "123456")
            print_success(f"Using OTP: {otp}")
            return otp
        else:
            print_error(f"Failed to send OTP: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Send OTP request failed: {e}")
        return None

def test_user_signup(email_otp):
    """Test user signup with OTP"""
    print_test("Testing user signup with email OTP")
    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "name": "Test Passenger",
        "phone": PHONE,
        "gender": "other",
        "email_otp": email_otp
    }
    try:
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code in [200, 201]:
            print_success("User signup successful")
            return response.json()
        elif response.status_code == 400:
            error_detail = response.json().get("detail", "")
            if "already registered" in str(error_detail).lower():
                print_warning("User already exists (will attempt login)")
                return {"email": EMAIL}
            else:
                print_error(f"Signup failed: {error_detail}")
                return None
        else:
            print_error(f"Signup failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print_error(f"Signup request failed: {e}")
        return None

def test_user_login():
    """Test user login"""
    print_test("Testing user login")
    payload = {
        "email": EMAIL,
        "password": PASSWORD
    }
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            token = data.get("access_token")
            if token:
                print_success(f"Login successful. Token: {token[:20]}...")
                return token
            else:
                print_error("No token in response")
                return None
        else:
            print_error(f"Login failed: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Login request failed: {e}")
        return None

def test_create_booking(token):
    """Test booking creation"""
    print_test("Testing booking creation")
    
    # Create pickup and dropoff coordinates
    payload = {
        "pickup_location": "Delhi, India",
        "pickup_latitude": 28.6139,
        "pickup_longitude": 77.2090,
        "dropoff_location": "Gurgaon, India",
        "dropoff_latitude": 28.5244,
        "dropoff_longitude": 77.1855,
        "ride_type": "instant",
        "vehicle_type_id": "auto",
        "passenger_count": 1
    }
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/bookings/create",
            json=payload,
            headers=headers,
            timeout=10
        )
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code in [200, 201]:
            booking = response.json()
            # Extract booking_id from nested structure
            data = booking.get("data", {})
            booking_id = data.get("booking_id") or booking.get("booking_id") or booking.get("id")
            if booking_id:
                print_success(f"Booking created: {booking_id}")
                return booking_id
            else:
                print_error("No booking_id in response")
                return None
        else:
            print_error(f"Booking creation failed: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Booking creation request failed: {e}")
        return None

def test_get_booking_status(token, booking_id):
    """Test getting booking status"""
    print_test(f"Getting booking status for {booking_id}")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/bookings/{booking_id}",
            headers=headers,
            timeout=10
        )
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            booking = response.json()
            status = booking.get("status", "unknown")
            print_success(f"Booking status retrieved: {status}")
            return True
        else:
            print_error(f"Failed to get booking status: {response.status_code}")
            return False
    except Exception as e:
        print_error(f"Get booking request failed: {e}")
        return False

def main():
    print("\n" + "="*60)
    print("AutoBuddy E2E Test Suite (with OTP)")
    print("="*60 + "\n")
    
    # Test server health
    if not test_server_health():
        print_error("Server is not running. Please start the backend server.")
        sys.exit(1)
    
    print()
    
    # Send email OTP for registration
    email_otp = test_send_email_otp()
    if not email_otp:
        print_error("Failed to send email OTP. Cannot proceed.")
        sys.exit(1)
    
    print()
    
    # Test signup with OTP
    signup_result = test_user_signup(email_otp)
    if not signup_result:
        print_error("Signup failed. Cannot proceed.")
        sys.exit(1)
    
    print()
    
    # Test login
    token = test_user_login()
    if not token:
        print_error("Login failed. Cannot proceed with booking tests.")
        sys.exit(1)
    
    print()
    
    # Test booking creation
    booking_id = test_create_booking(token)
    if not booking_id:
        print_warning("Booking creation failed. Skipping booking status test.")
    else:
        print()
        # Test booking status
        test_get_booking_status(token, booking_id)
    
    print("\n" + "="*60)
    print("E2E Tests Completed!")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()
