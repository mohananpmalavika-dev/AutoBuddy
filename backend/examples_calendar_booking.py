"""
Calendar Booking - Example Usage & Test Cases
Demonstrates how to use the Calendar Booking API
"""

import requests
import json
from datetime import datetime, timedelta

# Configuration
API_BASE_URL = "http://localhost:8000"
USER_TOKEN = "your_bearer_token_here"  # Replace with actual token

headers = {
    "Authorization": f"Bearer {USER_TOKEN}",
    "Content-Type": "application/json"
}


def example_1_check_connection():
    """Example 1: Check if Google Calendar is connected"""
    print("\n=== Example 1: Check Calendar Connection ===")
    
    response = requests.post(
        f"{API_BASE_URL}/api/calendar/check-calendar-connected",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json()


def example_2_connect_calendar():
    """Example 2: Get authorization URL to connect Google Calendar"""
    print("\n=== Example 2: Connect Google Calendar ===")
    
    response = requests.post(
        f"{API_BASE_URL}/api/calendar/oauth/authorize",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Authorization URL: {result.get('authorization_url')}")
    print(f"State: {result.get('state')}")
    print("\nVisit the authorization URL in your browser to connect your Google Calendar")
    
    return result


def example_3_set_preferences():
    """Example 3: Set auto-booking preferences"""
    print("\n=== Example 3: Set Auto-Booking Preferences ===")
    
    preferences = {
        "enabled": True,
        "auto_book_threshold": 0.7,
        "preferred_ride_type": "instant",
        "advance_booking_minutes": 30,
        "include_return_trip": False,
        "max_daily_auto_bookings": 5,
        "preferred_vehicle": "auto",
        "payment_method": "wallet",
        "special_requirements": []
    }
    
    response = requests.post(
        f"{API_BASE_URL}/api/calendar/preferences",
        json=preferences,
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json()


def example_4_get_preferences():
    """Example 4: Get current preferences"""
    print("\n=== Example 4: Get Current Preferences ===")
    
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/preferences",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    return response.json()


def example_5_analyze_meeting():
    """Example 5: Analyze a meeting for transportation needs"""
    print("\n=== Example 5: Analyze Meeting for Transportation ===")
    
    test_cases = [
        {
            "meeting_title": "KSUM Meeting",
            "meeting_location": "Technopark, Trivandrum",
            "meeting_time": (datetime.now() + timedelta(days=1)).isoformat()
        },
        {
            "meeting_title": "Team Zoom Call",
            "meeting_location": "Zoom",
            "meeting_time": (datetime.now() + timedelta(hours=2)).isoformat()
        },
        {
            "meeting_title": "Client Conference",
            "meeting_location": "Bangalore Convention Center, MG Road",
            "meeting_time": (datetime.now() + timedelta(days=3)).isoformat()
        }
    ]
    
    for test in test_cases:
        response = requests.post(
            f"{API_BASE_URL}/api/calendar/analyze-meeting",
            json=test,
            headers=headers
        )
        
        print(f"\nMeeting: {test['meeting_title']}")
        print(f"Location: {test['meeting_location']}")
        print(f"Status: {response.status_code}")
        result = response.json()
        print(f"Needs Transportation: {result.get('needs_transportation')}")
        print(f"Confidence Score: {result.get('confidence_score', 0) * 100:.0f}%")
        print(f"Reason: {result.get('reason')}")


def example_6_sync_and_book():
    """Example 6: Sync calendar and auto-book rides"""
    print("\n=== Example 6: Sync Calendar and Auto-Book Rides ===")
    
    response = requests.post(
        f"{API_BASE_URL}/api/calendar/sync-and-book",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2, default=str))
    
    return result


def example_7_get_bookings():
    """Example 7: Get all calendar bookings"""
    print("\n=== Example 7: Get Calendar Bookings ===")
    
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/bookings?limit=10&status=pending",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Total Bookings: {result.get('count')}")
    
    if result.get('bookings'):
        for booking in result['bookings'][:3]:  # Show first 3
            print(f"\n  - {booking.get('calendar_event_title')}")
            print(f"    Location: {booking.get('event_location')}")
            print(f"    Status: {booking.get('booking_status')}")
            print(f"    Time: {booking.get('event_start_time')}")
            print(f"    Confidence: {booking.get('transportation_confidence', 0) * 100:.0f}%")
    
    return result


def example_8_get_booking_details():
    """Example 8: Get specific booking details"""
    print("\n=== Example 8: Get Booking Details ===")
    
    # First get bookings to get an ID
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/bookings?limit=1",
        headers=headers
    )
    
    bookings = response.json().get('bookings', [])
    if not bookings:
        print("No bookings found. Please sync calendar first.")
        return
    
    booking_id = bookings[0]['_id']
    
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/bookings/{booking_id}",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2, default=str))


def example_9_get_reminders():
    """Example 9: Get upcoming meeting reminders (next 24h)"""
    print("\n=== Example 9: Get Meeting Reminders ===")
    
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/reminders",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Total Reminders: {result.get('count')}")
    
    if result.get('reminders'):
        for reminder in result['reminders']:
            print(f"\n  - {reminder.get('title')}")
            print(f"    Location: {reminder.get('location')}")
            print(f"    Time: {reminder.get('start_time')}")
            print(f"    Ride Booked: {'Yes' if reminder.get('ride_booked') else 'No'}")
            if reminder.get('pickup_time'):
                print(f"    Pickup Time: {reminder.get('pickup_time')}")
    
    return result


def example_10_get_stats():
    """Example 10: Get calendar booking statistics"""
    print("\n=== Example 10: Calendar Booking Statistics ===")
    
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/stats",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    result = response.json()
    print(json.dumps(result, indent=2))
    
    return result


def example_11_cancel_booking():
    """Example 11: Cancel a booking"""
    print("\n=== Example 11: Cancel Booking ===")
    
    # First get a booking to cancel
    response = requests.get(
        f"{API_BASE_URL}/api/calendar/bookings?limit=1&status=pending",
        headers=headers
    )
    
    bookings = response.json().get('bookings', [])
    if not bookings:
        print("No pending bookings to cancel")
        return
    
    booking_id = bookings[0]['_id']
    
    response = requests.delete(
        f"{API_BASE_URL}/api/calendar/bookings/{booking_id}",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2))


def example_12_disconnect_calendar():
    """Example 12: Disconnect Google Calendar"""
    print("\n=== Example 12: Disconnect Google Calendar ===")
    
    response = requests.post(
        f"{API_BASE_URL}/api/calendar/disconnect-calendar",
        headers=headers
    )
    
    print(f"Status: {response.status_code}")
    print(json.dumps(response.json(), indent=2))


# Test Cases for Transportation Detection
def test_transportation_detection():
    """Test the transportation detection algorithm"""
    print("\n" + "="*60)
    print("TRANSPORTATION DETECTION TEST CASES")
    print("="*60)
    
    test_cases = [
        # (meeting_title, location, expected_needs_transport, min_confidence)
        ("KSUM Meeting", "Technopark, Trivandrum", True, 0.6),
        ("Team Call", "Zoom", False, 0.1),
        ("Conference", "Convention Center, New York", True, 0.7),
        ("Webinar", "Online", False, 0.1),
        ("Client Meeting", "123 Business Park, Boston", True, 0.65),
        ("Video Chat", "Video Call", False, 0.1),
        ("Summit 2024", "Mumbai Convention Center, Navi Mumbai", True, 0.75),
        ("Lunch", "Office", True, 0.5),
        ("Home Standup", "Remote", False, 0.1),
        ("Airport Pickup", "Mumbai International Airport Terminal 2", True, 0.85),
    ]
    
    passed = 0
    failed = 0
    
    for title, location, expected_transport, min_confidence in test_cases:
        response = requests.post(
            f"{API_BASE_URL}/api/calendar/analyze-meeting",
            json={
                "meeting_title": title,
                "meeting_location": location,
                "meeting_time": datetime.now().isoformat()
            },
            headers=headers
        )
        
        result = response.json()
        needs = result.get('needs_transportation', False)
        confidence = result.get('confidence_score', 0)
        
        passed_test = (needs == expected_transport) and (confidence >= min_confidence - 0.1)
        status = "✓ PASS" if passed_test else "✗ FAIL"
        
        print(f"\n{status}: {title}")
        print(f"  Location: {location}")
        print(f"  Expected Transport: {expected_transport}, Got: {needs}")
        print(f"  Expected Confidence >= {min_confidence:.0%}, Got: {confidence:.0%}")
        
        if passed_test:
            passed += 1
        else:
            failed += 1
    
    print(f"\n{'='*60}")
    print(f"Tests Passed: {passed}/{len(test_cases)}")
    print(f"Tests Failed: {failed}/{len(test_cases)}")
    print(f"{'='*60}\n")


def run_all_examples():
    """Run all examples in sequence"""
    print("\n" + "="*60)
    print("CALENDAR BOOKING - COMPLETE WORKFLOW EXAMPLE")
    print("="*60)
    
    try:
        # Check connection
        result = example_1_check_connection()
        
        if not result.get('connected'):
            print("\n⚠️  Calendar not connected. Run example 2 to authorize.")
            # example_2_connect_calendar()
        else:
            print("\n✓ Calendar is connected, proceeding with examples...")
            
            # Set preferences
            example_3_set_preferences()
            
            # Get preferences
            example_4_get_preferences()
            
            # Analyze meetings
            example_5_analyze_meeting()
            
            # Sync and book
            example_6_sync_and_book()
            
            # Get bookings
            example_7_get_bookings()
            
            # Get reminders
            example_9_get_reminders()
            
            # Get stats
            example_10_get_stats()
        
        # Test transportation detection
        test_transportation_detection()
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to API server")
        print(f"   Make sure the server is running at {API_BASE_URL}")
    except Exception as e:
        print(f"❌ Error: {str(e)}")


if __name__ == "__main__":
    print("\n📅 AutoBuddy Calendar Booking - Examples & Tests")
    print("=" * 60)
    print("\nUsage:")
    print("  python examples.py              # Run all examples")
    print("  python examples.py --test       # Run transportation detection tests")
    print("\nNote: Update USER_TOKEN with your actual bearer token before running")
    print("=" * 60)
    
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        test_transportation_detection()
    else:
        run_all_examples()
