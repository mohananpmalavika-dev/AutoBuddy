"""
AutoBuddy WebSocket (Socket.IO) Load Testing
Tests real-time connections and event propagation under load
"""

import socketio
import asyncio
import json
import time
import random
from datetime import datetime
import statistics

# ============================================================================
# CONFIGURATION
# ============================================================================

BASE_URL = "http://localhost:8000"
NUM_CONNECTIONS = 500  # Number of concurrent WebSocket connections
TEST_DURATION = 60  # Test duration in seconds
EVENT_RATE = 10  # Events per second per connection

# Test Tokens
DRIVER_TOKEN = "your_driver_token"
PASSENGER_TOKEN = "your_passenger_token"

# ============================================================================
# METRICS COLLECTION
# ============================================================================

class MetricsCollector:
    """Collect performance metrics from load test"""
    
    def __init__(self):
        self.connections_established = 0
        self.connections_failed = 0
        self.events_sent = 0
        self.events_received = 0
        self.latencies = []
        self.errors = []
        self.start_time = time.time()
    
    def add_connection_success(self):
        self.connections_established += 1
    
    def add_connection_failure(self):
        self.connections_failed += 1
    
    def add_event_sent(self):
        self.events_sent += 1
    
    def add_event_received(self, latency_ms):
        self.events_received += 1
        self.latencies.append(latency_ms)
    
    def add_error(self, error_msg):
        self.errors.append(error_msg)
    
    def get_summary(self):
        """Get metrics summary"""
        elapsed = time.time() - self.start_time
        
        return {
            "elapsed_seconds": elapsed,
            "connections_established": self.connections_established,
            "connections_failed": self.connections_failed,
            "connection_success_rate": (
                self.connections_established / 
                (self.connections_established + self.connections_failed) * 100
                if self.connections_established + self.connections_failed > 0 else 0
            ),
            "events_sent": self.events_sent,
            "events_received": self.events_received,
            "event_delivery_rate": (
                self.events_received / self.events_sent * 100
                if self.events_sent > 0 else 0
            ),
            "latency_min_ms": min(self.latencies) if self.latencies else 0,
            "latency_max_ms": max(self.latencies) if self.latencies else 0,
            "latency_avg_ms": statistics.mean(self.latencies) if self.latencies else 0,
            "latency_median_ms": statistics.median(self.latencies) if self.latencies else 0,
            "latency_p95_ms": (
                sorted(self.latencies)[int(len(self.latencies)*0.95)]
                if self.latencies else 0
            ),
            "latency_p99_ms": (
                sorted(self.latencies)[int(len(self.latencies)*0.99)]
                if self.latencies else 0
            ),
            "total_errors": len(self.errors),
        }
    
    def print_summary(self):
        """Print metrics summary"""
        summary = self.get_summary()
        
        print("\n" + "="*80)
        print("WEBSOCKET LOAD TEST RESULTS")
        print("="*80)
        print(f"\nTest Duration: {summary['elapsed_seconds']:.1f} seconds")
        print(f"\nConnection Metrics:")
        print(f"  Established: {summary['connections_established']}")
        print(f"  Failed: {summary['connections_failed']}")
        print(f"  Success Rate: {summary['connection_success_rate']:.2f}%")
        
        print(f"\nEvent Metrics:")
        print(f"  Sent: {summary['events_sent']}")
        print(f"  Received: {summary['events_received']}")
        print(f"  Delivery Rate: {summary['event_delivery_rate']:.2f}%")
        
        print(f"\nLatency Metrics (ms):")
        print(f"  Min: {summary['latency_min_ms']:.2f}")
        print(f"  Max: {summary['latency_max_ms']:.2f}")
        print(f"  Average: {summary['latency_avg_ms']:.2f}")
        print(f"  Median: {summary['latency_median_ms']:.2f}")
        print(f"  p95: {summary['latency_p95_ms']:.2f}")
        print(f"  p99: {summary['latency_p99_ms']:.2f}")
        
        print(f"\nError Summary:")
        print(f"  Total Errors: {summary['total_errors']}")
        
        print("="*80 + "\n")

# ============================================================================
# WEBSOCKET CLIENT SIMULATOR
# ============================================================================

class WebSocketClient:
    """Simulates a WebSocket client (driver or passenger)"""
    
    def __init__(self, client_id, client_type, token, metrics):
        self.client_id = client_id
        self.client_type = client_type  # 'driver' or 'passenger'
        self.token = token
        self.metrics = metrics
        self.sio = socketio.AsyncClient()
        self.connected = False
        self.pending_events = {}  # Track sent events waiting for response
        
        self._setup_handlers()
    
    def _setup_handlers(self):
        """Setup Socket.IO event handlers"""
        
        @self.sio.on('connect')
        async def on_connect():
            self.connected = True
            self.metrics.add_connection_success()
            print(f"✓ {self.client_type} {self.client_id} connected")
        
        @self.sio.on('disconnect')
        async def on_disconnect():
            self.connected = False
            print(f"✗ {self.client_type} {self.client_id} disconnected")
        
        @self.sio.on('error')
        async def on_error(error):
            self.metrics.add_error(f"Client {self.client_id}: {error}")
        
        # Driver events
        @self.sio.on('ride_request')
        async def on_ride_request(data):
            latency = self._calculate_latency(data.get('timestamp'))
            self.metrics.add_event_received(latency)
        
        @self.sio.on('ride_accepted')
        async def on_ride_accepted(data):
            latency = self._calculate_latency(data.get('timestamp'))
            self.metrics.add_event_received(latency)
        
        # Passenger events
        @self.sio.on('driver_location')
        async def on_driver_location(data):
            latency = self._calculate_latency(data.get('timestamp'))
            self.metrics.add_event_received(latency)
        
        @self.sio.on('ride_status')
        async def on_ride_status(data):
            latency = self._calculate_latency(data.get('timestamp'))
            self.metrics.add_event_received(latency)
    
    def _calculate_latency(self, sent_timestamp):
        """Calculate latency between send and receive"""
        if sent_timestamp:
            return (time.time() * 1000) - sent_timestamp
        return 0
    
    async def connect(self):
        """Connect to Socket.IO server"""
        try:
            await self.sio.connect(
                BASE_URL,
                headers={"Authorization": f"Bearer {self.token}"}
            )
        except Exception as e:
            self.metrics.add_connection_failure()
            self.metrics.add_error(f"Connection failed: {e}")
    
    async def emit_event(self, event_name, data):
        """Emit an event"""
        try:
            if self.connected:
                data['timestamp'] = time.time() * 1000  # milliseconds
                await self.sio.emit(event_name, data)
                self.metrics.add_event_sent()
        except Exception as e:
            self.metrics.add_error(f"Emit failed: {e}")
    
    async def disconnect(self):
        """Disconnect from server"""
        if self.connected:
            await self.sio.disconnect()

# ============================================================================
# LOAD TEST SCENARIOS
# ============================================================================

async def driver_workload(client, duration, event_rate):
    """Simulate driver workload"""
    end_time = time.time() + duration
    event_interval = 1.0 / event_rate
    
    while time.time() < end_time:
        # Update location
        await client.emit_event('location_update', {
            'latitude': random.uniform(8.0, 12.0),
            'longitude': random.uniform(75.0, 77.0),
        })
        
        # Accept ride (occasionally)
        if random.random() < 0.2:
            await client.emit_event('ride_accepted', {
                'ride_id': random.randint(1000, 9999),
            })
        
        # Status update (occasionally)
        if random.random() < 0.1:
            await client.emit_event('ride_status', {
                'status': random.choice(['on_way', 'arrived', 'in_trip']),
            })
        
        await asyncio.sleep(event_interval)

async def passenger_workload(client, duration, event_rate):
    """Simulate passenger workload"""
    end_time = time.time() + duration
    event_interval = 1.0 / event_rate
    
    while time.time() < end_time:
        # Request location update
        await client.emit_event('request_location', {
            'ride_id': random.randint(1000, 9999),
        })
        
        # Check ride status (occasionally)
        if random.random() < 0.3:
            await client.emit_event('get_ride_status', {
                'ride_id': random.randint(1000, 9999),
            })
        
        # Send message (occasionally)
        if random.random() < 0.1:
            await client.emit_event('send_message', {
                'message': 'Hello!',
                'ride_id': random.randint(1000, 9999),
            })
        
        await asyncio.sleep(event_interval)

# ============================================================================
# MAIN LOAD TEST
# ============================================================================

async def run_load_test():
    """Run WebSocket load test"""
    
    print("="*80)
    print("AUTOBUDDY WEBSOCKET LOAD TEST")
    print("="*80)
    print(f"Configuration:")
    print(f"  Concurrent Connections: {NUM_CONNECTIONS}")
    print(f"  Test Duration: {TEST_DURATION} seconds")
    print(f"  Event Rate: {EVENT_RATE} events/sec per connection")
    print(f"  Driver/Passenger Split: 50/50")
    print("="*80 + "\n")
    
    metrics = MetricsCollector()
    clients = []
    
    # Create clients (50% drivers, 50% passengers)
    for i in range(NUM_CONNECTIONS):
        if i % 2 == 0:
            client_type = 'driver'
            token = DRIVER_TOKEN
        else:
            client_type = 'passenger'
            token = PASSENGER_TOKEN
        
        client = WebSocketClient(i, client_type, token, metrics)
        clients.append(client)
    
    # Connect all clients
    print(f"Connecting {NUM_CONNECTIONS} clients...\n")
    connect_tasks = [client.connect() for client in clients]
    await asyncio.gather(*connect_tasks)
    
    # Wait for connections to stabilize
    await asyncio.sleep(2)
    
    # Run workloads
    print(f"Running workloads for {TEST_DURATION} seconds...\n")
    workload_tasks = []
    
    for client in clients:
        if client.client_type == 'driver':
            task = driver_workload(client, TEST_DURATION, EVENT_RATE)
        else:
            task = passenger_workload(client, TEST_DURATION, EVENT_RATE)
        workload_tasks.append(task)
    
    await asyncio.gather(*workload_tasks)
    
    # Disconnect all clients
    print("\nDisconnecting clients...\n")
    disconnect_tasks = [client.disconnect() for client in clients]
    await asyncio.gather(*disconnect_tasks)
    
    # Print results
    metrics.print_summary()

# ============================================================================
# EXECUTION
# ============================================================================

if __name__ == "__main__":
    """
    To run WebSocket load test:
    
    1. Install dependencies:
       pip install python-socketio python-engineio
    
    2. Update tokens in this file:
       - DRIVER_TOKEN
       - PASSENGER_TOKEN
    
    3. Run:
       python socket_load_test.py
    
    Expected Results (for 500 connections, 60 seconds):
    - Connection Success Rate: >99%
    - Event Delivery Rate: >99%
    - Latency p95: <200ms
    - Latency p99: <500ms
    - Total Errors: <5
    """
    
    print("\nStarting WebSocket load test...")
    print("Make sure backend is running on http://localhost:8000\n")
    
    try:
        asyncio.run(run_load_test())
        print("✓ WebSocket load test completed successfully")
    except KeyboardInterrupt:
        print("\n✗ Test interrupted by user")
    except Exception as e:
        print(f"\n✗ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
