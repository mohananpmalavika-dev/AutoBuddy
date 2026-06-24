#!/usr/bin/env python3
"""
End-to-end test for AutoBuddy passenger flow
Tests: Login -> Create booking -> Get booking status
"""

import requests
import json
import sys
from datetime import datetime, timedelta

BASE_URL = "http://localhost:8000"
EMAIL = "passenger@test.com"
PASSWORD = "test123"

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

def test_user_signup():
    """Test user signup"""
    print_test("Testing user signup")
    payload = {
        "email": EMAIL,
        "password": "Autobuddy@123",  # At least 8 chars
        "name": "Test Passenger",  # Changed from full_name to name
        "phone": "9876543210",  # Valid 10-digit Indian mobile number
        "gender": "other"  # Must be 'male', 'female', or 'other'
    }
    try:
        response = requests.post(f"{BASE_URL}/api/auth/register", json=payload, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code in [200, 201]:
            print_success("User signup successful")
            return response.json()
        elif response.status_code == 400:
            print_warning("User may already exist (400)")
            return {"email": EMAIL}
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
        "password": "Autobuddy@123"  # Use the password we just set
    }
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json=payload, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")  # Print first 200 chars
        
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

def test_get_user_profile(token):
    """Test getting user profile"""
    print_test("Testing get user profile")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.get(f"{BASE_URL}/api/users/me", headers=headers, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            user = response.json()
            print_success(f"Profile retrieved: {user.get('email')}")
            return user
        else:
            print_error(f"Failed to get profile: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Profile request failed: {e}")
        return None

def test_create_ride_booking(token):
    """Test creating a ride booking"""
    print_test("Testing create ride booking")
    
    # Sample pickup and dropoff locations
    payload = {
        "pickup_location": {
            "latitude": 40.7128,
            "longitude": -74.0060,
            "address": "Times Square, New York, NY"
        },
        "dropoff_location": {
            "latitude": 40.7580,
            "longitude": -73.9855,
            "address": "Central Park, New York, NY"
        },
        "ride_type": "economy",
        "scheduled_time": (datetime.now() + timedelta(hours=1)).isoformat()
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(f"{BASE_URL}/api/rides", json=payload, headers=headers, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code in [200, 201]:
            booking = response.json()
            print_success(f"Booking created: {booking.get('id')}")
            return booking
        else:
            print_error(f"Booking failed: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Booking request failed: {e}")
        return None

def test_get_bookings(token):
    """Test getting user bookings"""
    print_test("Testing get user bookings")
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.get(f"{BASE_URL}/api/rides/bookings", headers=headers, timeout=10)
        print(f"Response Status: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            bookings = response.json()
            print_success(f"Retrieved {len(bookings)} bookings")
            return bookings
        else:
            print_error(f"Failed to get bookings: {response.status_code}")
            return None
    except Exception as e:
        print_error(f"Get bookings request failed: {e}")
        return None

def run_e2e_tests():
    """Run all E2E tests"""
    print(f"\n{BLUE}{'='*60}")
    print("AutoBuddy E2E Test Suite")
    print(f"{'='*60}{RESET}\n")
    
    # Test 1: Server Health
    if not test_server_health():
        print_error("Server is not running. Please start the backend server.")
        return False
    
    print()
    
    # Test 2: User Signup
    signup_result = test_user_signup()
    
    print()
    
    # Test 3: User Login
    token = test_user_login()
    if not token:
        print_error("Login failed. Cannot proceed with authenticated tests.")
        return False
    
    print()
    
    # Test 4: Get User Profile
    profile = test_get_user_profile(token)
    
    print()
    
    # Test 5: Create Ride Booking
    booking = test_create_ride_booking(token)
    
    print()
    
    # Test 6: Get Bookings
    bookings = test_get_bookings(token)
    
    print(f"\n{BLUE}{'='*60}")
    print("E2E Test Summary")
    print(f"{'='*60}{RESET}\n")
    
    if profile and booking:
        print_success("Core E2E flow completed successfully!")
        return True
    else:
        print_warning("Some tests failed. Check output above for details.")
        return False

if __name__ == "__main__":
    success = run_e2e_tests()
    sys.exit(0 if success else 1)
