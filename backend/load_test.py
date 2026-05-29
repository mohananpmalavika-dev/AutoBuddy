"""
AutoBuddy Load Testing Suite
Using Locust for distributed load testing
"""

from locust import HttpUser, task, between, events, TaskSet
from locust.contrib.fasthttp import FastHttpUser
import random
import json
import time
from datetime import datetime

# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_URL = "http://localhost:8000"
ADMIN_TOKEN = "your_admin_token_here"
DRIVER_TOKEN = "your_driver_token_here"
PASSENGER_TOKEN = "your_passenger_token_here"

# Test Data
CITIES = ["Kochi", "Thiruvananthapuram", "Kozhikode", "Kannur", "Thrissur"]
LOCATIONS = [
    {"lat": 9.9312, "lng": 76.2673, "name": "Kochi"},
    {"lat": 8.5241, "lng": 76.9366, "name": "Thiruvananthapuram"},
    {"lat": 11.2588, "lng": 75.7804, "name": "Kozhikode"},
]

RIDE_PRODUCTS = ["economy", "premium", "xl", "bike"]

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

def get_random_location():
    """Get random location for testing"""
    loc = random.choice(LOCATIONS)
    return {
        "lat": loc["lat"] + random.uniform(-0.1, 0.1),
        "lng": loc["lng"] + random.uniform(-0.1, 0.1),
    }

def get_headers(token):
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

# ============================================================================
# PASSENGER USER SCENARIOS
# ============================================================================

class PassengerTasks(TaskSet):
    """Passenger user tasks"""
    
    def on_start(self):
        """Called when user starts"""
        self.user_id = random.randint(1000, 9999)
        self.active_ride = None
    
    @task(5)
    def search_rides(self):
        """Search available rides"""
        pickup = get_random_location()
        dropoff = get_random_location()
        
        response = self.client.post(
            "/passenger/ride/search",
            json={
                "pickup": pickup,
                "dropoff": dropoff,
                "ride_type": random.choice(RIDE_PRODUCTS),
            },
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/ride/search"
        )
        
        if response.status_code == 200:
            rides = response.json().get("data", [])
            if rides:
                self.active_ride = rides[0].get("id")
    
    @task(3)
    def book_ride(self):
        """Book a ride"""
        pickup = get_random_location()
        dropoff = get_random_location()
        
        response = self.client.post(
            "/passenger/ride/book",
            json={
                "pickup": pickup,
                "dropoff": dropoff,
                "ride_type": random.choice(RIDE_PRODUCTS),
                "scheduled_time": None,
            },
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/ride/book"
        )
    
    @task(2)
    def get_ride_status(self):
        """Get current ride status"""
        if self.active_ride:
            self.client.get(
                f"/passenger/ride/{self.active_ride}/status",
                headers=get_headers(PASSENGER_TOKEN),
                name="/passenger/ride/{id}/status"
            )
    
    @task(2)
    def list_rides(self):
        """List past rides"""
        self.client.get(
            "/passenger/ride/history",
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/ride/history"
        )
    
    @task(1)
    def get_wallet(self):
        """Get wallet balance"""
        self.client.get(
            "/passenger/wallet/balance",
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/wallet/balance"
        )
    
    @task(1)
    def get_profile(self):
        """Get user profile"""
        self.client.get(
            "/passenger/profile",
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/profile"
        )
    
    @task(1)
    def get_notifications(self):
        """Get notifications"""
        self.client.get(
            "/passenger/notifications",
            headers=get_headers(PASSENGER_TOKEN),
            name="/passenger/notifications"
        )

class PassengerUser(FastHttpUser):
    """Passenger load test user"""
    tasks = [PassengerTasks]
    wait_time = between(2, 5)

# ============================================================================
# DRIVER USER SCENARIOS
# ============================================================================

class DriverTasks(TaskSet):
    """Driver user tasks"""
    
    def on_start(self):
        """Called when user starts"""
        self.driver_id = random.randint(1000, 9999)
        self.active_request = None
        self.location = get_random_location()
    
    @task(5)
    def get_ride_requests(self):
        """Get available ride requests"""
        response = self.client.get(
            "/driver/ride/requests",
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/ride/requests"
        )
        
        if response.status_code == 200:
            requests = response.json().get("data", [])
            if requests:
                self.active_request = requests[0].get("id")
    
    @task(3)
    def accept_ride(self):
        """Accept a ride request"""
        if self.active_request:
            self.client.post(
                f"/driver/ride/{self.active_request}/accept",
                json={},
                headers=get_headers(DRIVER_TOKEN),
                name="/driver/ride/{id}/accept"
            )
    
    @task(2)
    def update_location(self):
        """Update driver location"""
        self.location = get_random_location()
        
        self.client.post(
            "/driver/location/update",
            json={
                "latitude": self.location["lat"],
                "longitude": self.location["lng"],
            },
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/location/update"
        )
    
    @task(2)
    def get_earnings(self):
        """Get driver earnings"""
        self.client.get(
            "/driver/earnings/today",
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/earnings/today"
        )
    
    @task(1)
    def get_trip_history(self):
        """Get trip history"""
        self.client.get(
            "/driver/trip/history?limit=10",
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/trip/history"
        )
    
    @task(1)
    def get_profile(self):
        """Get driver profile"""
        self.client.get(
            "/driver/profile",
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/profile"
        )
    
    @task(1)
    def get_documents(self):
        """Get document status"""
        self.client.get(
            "/driver/documents/status",
            headers=get_headers(DRIVER_TOKEN),
            name="/driver/documents/status"
        )

class DriverUser(FastHttpUser):
    """Driver load test user"""
    tasks = [DriverTasks]
    wait_time = between(3, 6)

# ============================================================================
# ADMIN USER SCENARIOS
# ============================================================================

class AdminTasks(TaskSet):
    """Admin user tasks"""
    
    def on_start(self):
        """Called when user starts"""
        self.admin_id = random.randint(1000, 9999)
    
    @task(3)
    def get_analytics(self):
        """Get platform analytics"""
        self.client.get(
            "/admin/analytics/overview",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/analytics/overview"
        )
    
    @task(2)
    def list_trips(self):
        """List active trips"""
        self.client.get(
            "/admin/trips?status=active&limit=50",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/trips"
        )
    
    @task(2)
    def list_users(self):
        """List users"""
        self.client.get(
            "/admin/passengers?limit=50",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/passengers"
        )
    
    @task(2)
    def list_drivers(self):
        """List drivers"""
        self.client.get(
            "/admin/drivers?limit=50",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/drivers"
        )
    
    @task(1)
    def get_kyc_pending(self):
        """Get pending KYC"""
        self.client.get(
            "/admin/kyc/pending?limit=20",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/kyc/pending"
        )
    
    @task(1)
    def get_financial_overview(self):
        """Get financial overview"""
        self.client.get(
            "/admin/financial/overview",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/financial/overview"
        )
    
    @task(1)
    def get_subscriptions(self):
        """Get subscription stats"""
        self.client.get(
            "/admin/subscriptions/stats",
            headers=get_headers(ADMIN_TOKEN),
            name="/admin/subscriptions/stats"
        )

class AdminUser(FastHttpUser):
    """Admin load test user"""
    tasks = [AdminTasks]
    wait_time = between(1, 3)

# ============================================================================
# EVENT HANDLERS FOR REPORTING
# ============================================================================

@events.quitting.add_listener
def _(environment, **kw):
    """Print results when quitting"""
    print("\n" + "="*80)
    print("LOAD TEST COMPLETED")
    print("="*80)

# ============================================================================
# CUSTOM STATISTICS
# ============================================================================

class LoadTestStats:
    """Custom statistics collector"""
    
    def __init__(self):
        self.start_time = time.time()
        self.requests = {}
    
    def add_request(self, name, status_code, response_time):
        """Add request to statistics"""
        if name not in self.requests:
            self.requests[name] = {
                "count": 0,
                "total_time": 0,
                "min_time": float('inf'),
                "max_time": 0,
                "errors": 0,
            }
        
        stats = self.requests[name]
        stats["count"] += 1
        stats["total_time"] += response_time
        stats["min_time"] = min(stats["min_time"], response_time)
        stats["max_time"] = max(stats["max_time"], response_time)
        
        if status_code >= 400:
            stats["errors"] += 1
    
    def print_summary(self):
        """Print summary statistics"""
        print("\nREQUEST SUMMARY:")
        print("-" * 100)
        print(f"{'Endpoint':<40} {'Requests':<10} {'Avg(ms)':<10} {'Min(ms)':<10} {'Max(ms)':<10} {'Errors':<10}")
        print("-" * 100)
        
        for name, stats in sorted(self.requests.items()):
            avg_time = stats["total_time"] / stats["count"] if stats["count"] > 0 else 0
            print(
                f"{name:<40} {stats['count']:<10} {avg_time:<10.1f} "
                f"{stats['min_time']:<10.1f} {stats['max_time']:<10.1f} {stats['errors']:<10}"
            )
        
        print("-" * 100)

# ============================================================================
# NOTES FOR RUNNING LOAD TESTS
# ============================================================================

"""
LOAD TEST SCENARIOS:

1. Scenario: Ramp-up Test (Gradual Increase)
   Command: locust -f load_test.py --users=1000 --spawn-rate=50 --run-time=5m
   Expected: Linear increase in requests, observe when system struggles
   
2. Scenario: Spike Test (Sudden Surge)
   Command: locust -f load_test.py --users=5000 --spawn-rate=500 --run-time=2m
   Expected: Observe how system handles sudden spike, recovery time
   
3. Scenario: Sustained Load Test
   Command: locust -f load_test.py --users=500 --spawn-rate=50 --run-time=30m
   Expected: Observe system stability over extended period, memory leaks
   
4. Scenario: Stress Test (Until Failure)
   Command: locust -f load_test.py --users=10000 --spawn-rate=100
   Expected: Identify breaking point, error rates, resource limits
   
5. Scenario: Soak Test (Long Running)
   Command: locust -f load_test.py --users=100 --spawn-rate=10 --run-time=8h
   Expected: Identify long-term stability, memory leaks, connection issues

SETUP REQUIREMENTS:
1. pip install locust
2. pip install locust[modern-ui]  (for web UI)
3. Update tokens: ADMIN_TOKEN, DRIVER_TOKEN, PASSENGER_TOKEN
4. Update BASE_URL if not localhost:8000
5. Ensure backend is running and accessible

RUNNING:
1. Command line: locust -f load_test.py
2. Web UI: http://localhost:8089
3. Configure users, spawn rate, and runtime in UI
4. Monitor metrics in real-time

KEY METRICS TO MONITOR:
- Request Rate (req/sec)
- Response Time (avg, min, max, p95, p99)
- Error Rate (% of failed requests)
- Throughput (total requests completed)
- CPU Usage
- Memory Usage
- Database Connections
- Active WebSocket Connections
"""
