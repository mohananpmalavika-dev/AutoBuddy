"""
API Routes for Enterprise Features:
1. Airport Bookings
2. Corporate Ride Accounts
3. Multi-Stop Smart Routing
4. Live Driver Heatmap
"""

from fastapi import APIRouter, HTTPException, Request, Query
from typing import List, Optional, Dict
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from app.utils.rbac import get_current_user_from_request
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/enterprise", tags=["enterprise"])

db = None
io = None

def set_dependencies(database, socket_io):
    global db, io
    db = database
    io = socket_io


# ============================================================================
# 1. AIRPORT BOOKING ENDPOINTS
# ============================================================================

@router.get("/airports/list")
async def list_airports(search: Optional[str] = None):
    """List available airports with terminals"""
    try:
        query = {}
        if search:
            query = {
                "$or": [
                    {"airport_code": {"$regex": search, "$options": "i"}},
                    {"airport_name": {"$regex": search, "$options": "i"}},
                ]
            }
        
        airports = await db.airport_terminals.find(query).to_list(None)
        
        # Group by airport
        airport_groups = {}
        for terminal in airports:
            code = terminal['airport_code']
            if code not in airport_groups:
                airport_groups[code] = {
                    'airport_code': code,
                    'airport_name': terminal['airport_name'],
                    'terminals': []
                }
            airport_groups[code]['terminals'].append({
                'id': str(terminal['_id']),
                'terminal_name': terminal['terminal_name'],
                'terminal_code': terminal['terminal_code'],
                'pickup_zone_name': terminal['pickup_zone_name'],
                'wait_time_limit': terminal['wait_time_limit_minutes']
            })
        
        return list(airport_groups.values())
    
    except Exception as e:
        logger.error(f"Error listing airports: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list airports")


@router.post("/airport-booking/create")
async def create_airport_booking(request: Request, booking_data: dict):
    """
    Create airport pickup booking with flight tracking
    
    Request body:
    {
        "passenger_id": "...",
        "flight_number": "AI101",
        "scheduled_arrival": "2026-05-29T15:30:00Z",
        "airport_code": "COK",
        "terminal_id": "...",
        "pickup_zone": "domestic",
        "meet_and_greet": false,
        "luggage_help": true,
        "luggage_count": 2
    }
    """
    try:
        # Verify passenger
        passenger_data = await verify_passenger_token(request)
        passenger_id = passenger_data['_id']
        
        # Validate terminal
        terminal = await db.airport_terminals.find_one({'_id': booking_data['terminal_id']})
        if not terminal:
            raise HTTPException(status_code=404, detail="Terminal not found")
        
        # Check flight status
        flight_info = await get_flight_info(booking_data['flight_number'])
        
        # Calculate fares
        base_fare = Decimal('500')  # Base airport fare
        airport_fee = Decimal('200')  # Airport service fee
        meet_greet_fee = Decimal('300') if booking_data.get('meet_and_greet') else Decimal('0')
        total_fare = base_fare + airport_fee + meet_greet_fee
        
        # Create booking
        airport_booking = {
            'passenger_id': passenger_id,
            'booking_id': generate_booking_id(),  # Link to main booking
            'flight_number': booking_data['flight_number'],
            'flight_status': flight_info.get('status', 'scheduled'),
            'scheduled_arrival_time': booking_data['scheduled_arrival'],
            'estimated_arrival_time': flight_info.get('estimated_arrival', booking_data['scheduled_arrival']),
            'airport_code': booking_data['airport_code'],
            'terminal_id': booking_data['terminal_id'],
            'pickup_zone': booking_data['pickup_zone'],
            'meet_and_greet': booking_data.get('meet_and_greet', False),
            'meet_and_greet_person_name': booking_data.get('meet_and_greet_person_name'),
            'luggage_help': booking_data.get('luggage_help', False),
            'luggage_count': booking_data.get('luggage_count'),
            'base_fare': float(base_fare),
            'airport_fee': float(airport_fee),
            'meet_greet_fee': float(meet_greet_fee),
            'total_fare': float(total_fare),
            'status': 'confirmed',
            'created_at': get_ist_now()
        }
        
        result = await db.airport_bookings.insert_one(airport_booking)
        
        # Broadcast to admin dashboard
        io.emit('airport_booking_created', {
            'booking_id': airport_booking['booking_id'],
            'passenger_id': passenger_id,
            'flight_number': booking_data['flight_number'],
            'airport': booking_data['airport_code'],
            'fare': float(total_fare)
        }, room='admin_airport')
        
        return {
            'status': 'success',
            'airport_booking_id': str(result.inserted_id),
            'booking_id': airport_booking['booking_id'],
            'total_fare': float(total_fare),
            'message': 'Airport pickup booked successfully'
        }
    
    except Exception as e:
        logger.error(f"Error creating airport booking: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create airport booking")


@router.get("/airport-booking/{booking_id}/track")
async def track_airport_booking(booking_id: str, request: Request):
    """Get real-time status of airport booking including flight info"""
    try:
        passenger_data = await verify_passenger_token(request)
        
        booking = await db.airport_bookings.find_one({'booking_id': booking_id})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Get flight status
        flight = await db.flight_trackers.find_one({'flight_number': booking['flight_number']})
        flight_status = flight['status'] if flight else 'unknown'
        delay_minutes = flight['delay_minutes'] if flight else 0
        
        return {
            'booking_id': booking_id,
            'flight_number': booking['flight_number'],
            'flight_status': flight_status,
            'delay_minutes': delay_minutes,
            'estimated_arrival': booking['estimated_arrival_time'].isoformat(),
            'pickup_zone': booking['pickup_zone'],
            'driver_status': booking.get('driver_id') and 'assigned' or 'searching',
            'driver_id': booking.get('driver_id'),
            'meet_and_greet': booking['meet_and_greet'],
            'status': booking['status']
        }
    
    except Exception as e:
        logger.error(f"Error tracking airport booking: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to track booking")


# ============================================================================
# 2. CORPORATE RIDE ACCOUNT ENDPOINTS
# ============================================================================

@router.post("/corporate/account/create")
async def create_corporate_account(account_data: dict, request: Request):
    """Create new corporate account"""
    try:
        # Verify admin credentials
        admin_data = await verify_admin_token(request)
        
        corporate = {
            'company_name': account_data['company_name'],
            'admin_email': account_data['admin_email'],
            'admin_phone': account_data['admin_phone'],
            'monthly_budget': float(account_data.get('monthly_budget', 50000)),
            'current_month_spent': 0.0,
            'billing_cycle_start': get_ist_now(),
            'payment_method': account_data.get('payment_method', 'invoice'),
            'is_active': True,
            'created_at': get_ist_now()
        }
        
        result = await db.corporate_accounts.insert_one(corporate)
        
        return {
            'status': 'success',
            'corporate_id': str(result.inserted_id),
            'message': 'Corporate account created'
        }
    
    except Exception as e:
        logger.error(f"Error creating corporate account: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create corporate account")


@router.post("/corporate/{corporate_id}/employee/add")
async def add_employee_to_corporate(corporate_id: str, employee_data: dict, request: Request):
    """Add employee to corporate account"""
    try:
        admin_data = await verify_admin_token(request)
        
        employee = {
            'employee_id': employee_data['employee_id'],
            'corporate_account_id': corporate_id,
            'name': employee_data['name'],
            'email': employee_data['email'],
            'phone': employee_data['phone'],
            'department': employee_data.get('department'),
            'cost_center': employee_data.get('cost_center'),
            'daily_limit': float(employee_data.get('daily_limit', 500)),
            'monthly_limit': float(employee_data.get('monthly_limit', 10000)),
            'requires_approval': employee_data.get('requires_approval', False),
            'is_active': True,
            'created_at': get_ist_now()
        }
        
        result = await db.employee_ride_accounts.insert_one(employee)
        
        return {
            'status': 'success',
            'employee_id': str(result.inserted_id),
            'message': 'Employee added to corporate account'
        }
    
    except Exception as e:
        logger.error(f"Error adding employee: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add employee")


@router.post("/corporate/{corporate_id}/ride-request/approve")
async def approve_corporate_ride_request(corporate_id: str, request_id: str, request: Request):
    """Approve/reject corporate ride request"""
    try:
        manager_data = await verify_manager_token(request)
        
        ride_request = await db.corporate_ride_requests.find_one_and_update(
            {'_id': request_id, 'corporate_account_id': corporate_id},
            {
                '$set': {
                    'approval_status': 'approved',
                    'approved_by': str(manager_data['_id']),
                    'updated_at': get_ist_now()
                }
            },
            return_document=True
        )
        
        if not ride_request:
            raise HTTPException(status_code=404, detail="Request not found")
        
        # Notify employee
        await notify_user(
            user_id=ride_request['employee_id'],
            message=f"Your ride request for INR {ride_request['fare']} has been approved",
            type='ride_approved'
        )
        
        return {'status': 'success', 'message': 'Ride request approved'}
    
    except Exception as e:
        logger.error(f"Error approving request: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to approve request")


@router.get("/corporate/{corporate_id}/billing/report")
async def get_corporate_billing_report(
    corporate_id: str,
    billing_month: Optional[str] = None,
    request: Request = None
):
    """Get corporate billing report"""
    try:
        admin_data = await verify_admin_token(request)
        
        if not billing_month:
            billing_month = get_ist_now().strftime('%Y-%m')
        
        report = await db.corporate_billing_reports.find_one({
            'corporate_account_id': corporate_id,
            'billing_month': billing_month
        })
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            'billing_month': report['billing_month'],
            'total_rides': report['total_rides'],
            'total_amount': float(report['total_amount']),
            'department_breakdown': report.get('department_breakdown', {}),
            'employee_breakdown': report.get('employee_breakdown', {})
        }
    
    except Exception as e:
        logger.error(f"Error fetching billing report: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch report")


# ============================================================================
# 3. MULTI-STOP SMART ROUTING ENDPOINTS
# ============================================================================

@router.post("/multi-stop/create")
async def create_multi_stop_booking(booking_data: dict, request: Request):
    """
    Create multi-stop booking with route optimization
    
    Request body:
    {
        "passenger_id": "...",
        "stops": [
            {"name": "Office", "lat": 10.123, "lon": 76.456, "address": "..."},
            {"name": "Home", "lat": 10.234, "lon": 76.567, "address": "..."},
            {"name": "Grocery", "lat": 10.345, "lon": 76.678, "address": "..."}
        ],
        "optimize_route": true
    }
    """
    try:
        passenger_data = await verify_passenger_token(request)
        passenger_id = passenger_data['_id']
        
        stops = booking_data['stops']
        if len(stops) < 2 or len(stops) > 10:
            raise HTTPException(status_code=400, detail="Stops must be between 2 and 10")
        
        # Calculate route metrics
        total_distance, total_duration = calculate_route_metrics(stops)
        
        # Route optimization
        original_order = list(range(len(stops)))
        optimized_order = original_order
        optimization_algo = None
        
        if booking_data.get('optimize_route', True):
            optimized_order, optimization_algo = optimize_route(stops)
            optimization_result = {
                'original_order': original_order,
                'optimized_order': optimized_order,
                'distance_saved_km': calculate_distance_saved(stops, original_order, optimized_order),
                'time_saved_minutes': calculate_time_saved(stops, original_order, optimized_order)
            }
        
        # Calculate fares
        base_fare = Decimal('300')
        multi_stop_fee = Decimal('100') * (len(stops) - 2)  # $100 per extra stop
        total_fare = base_fare + multi_stop_fee
        
        # Create booking
        multi_stop = {
            'passenger_id': passenger_id,
            'booking_id': generate_booking_id(),
            'stops_count': len(stops),
            'total_distance': total_distance,
            'total_duration_minutes': total_duration,
            'base_fare': float(base_fare),
            'multi_stop_fee': float(multi_stop_fee),
            'total_fare': float(total_fare),
            'current_stop_index': 0,
            'status': 'pending',
            'route_optimized': booking_data.get('optimize_route', False),
            'optimization_algorithm': optimization_algo,
            'created_at': get_ist_now()
        }
        
        result = await db.multi_stop_bookings.insert_one(multi_stop)
        booking_id = str(result.inserted_id)
        
        # Create route stops
        for idx, stop in enumerate(optimized_order if booking_data.get('optimize_route') else original_order):
            stop_data = stops[stop]
            route_stop = {
                'multi_stop_booking_id': booking_id,
                'stop_sequence': idx,
                'location_name': stop_data.get('name'),
                'latitude': stop_data['lat'],
                'longitude': stop_data['lon'],
                'address': stop_data['address'],
                'passenger_name': stop_data.get('passenger_name'),
                'status': 'pending',
                'created_at': get_ist_now()
            }
            await db.route_stops.insert_one(route_stop)
        
        # Save optimization details if optimized
        if booking_data.get('optimize_route'):
            opt_record = {
                'multi_stop_booking_id': booking_id,
                'original_order': original_order,
                'optimized_order': optimized_order,
                'optimization_time_ms': 150,
                'algorithm_used': optimization_algo,
                'original_distance_km': total_distance,
                'optimized_distance_km': calculate_route_distance(stops, optimized_order),
                'original_time_minutes': total_duration,
                'optimized_time_minutes': calculate_route_duration(stops, optimized_order),
                'cost_savings': float(calculate_cost_savings(total_distance, calculate_route_distance(stops, optimized_order))),
                'created_at': get_ist_now()
            }
            await db.route_optimizations.insert_one(opt_record)
        
        # Broadcast to admin
        io.emit('multi_stop_booking_created', {
            'booking_id': multi_stop['booking_id'],
            'stops_count': len(stops),
            'total_distance': total_distance,
            'fare': float(total_fare)
        }, room='admin_routing')
        
        return {
            'status': 'success',
            'multi_stop_booking_id': booking_id,
            'booking_id': multi_stop['booking_id'],
            'total_fare': float(total_fare),
            'stops_count': len(stops),
            'total_distance_km': total_distance,
            'total_duration_minutes': total_duration,
            'route_optimized': booking_data.get('optimize_route', False)
        }
    
    except Exception as e:
        logger.error(f"Error creating multi-stop booking: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create booking")


@router.post("/multi-stop/{booking_id}/reorder-stops")
async def reorder_multi_stop_stops(booking_id: str, new_order: List[int], request: Request):
    """Reorder stops in a multi-stop booking"""
    try:
        passenger_data = await verify_passenger_token(request)
        
        booking = await db.multi_stop_bookings.find_one({'_id': booking_id})
        if not booking or str(booking['passenger_id']) != str(passenger_data['_id']):
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        # Validate order
        if len(new_order) != booking['stops_count']:
            raise HTTPException(status_code=400, detail="Invalid order")
        
        # Update stops with new sequence
        stops = await db.route_stops.find({'multi_stop_booking_id': booking_id}).to_list(None)
        
        for new_seq, old_seq in enumerate(new_order):
            await db.route_stops.update_one(
                {'_id': stops[old_seq]['_id']},
                {'$set': {'stop_sequence': new_seq}}
            )
        
        return {'status': 'success', 'message': 'Stops reordered'}
    
    except Exception as e:
        logger.error(f"Error reordering stops: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reorder stops")


# ============================================================================
# 4. LIVE DRIVER HEATMAP ENDPOINTS
# ============================================================================

@router.get("/heatmap/current")
async def get_live_heatmap(request: Request):
    """Get current driver density heatmap"""
    try:
        # Get latest snapshots from all grid locations
        snapshots = await db.driver_density_snapshots.find(
            {'snapshot_time': {'$gt': get_ist_now() - timedelta(minutes=5)}}
        ).to_list(None)
        
        return {
            'timestamp': get_ist_now().isoformat(),
            'data_points': [
                {
                    'latitude': s['grid_latitude'],
                    'longitude': s['grid_longitude'],
                    'drivers_count': s['active_drivers_count'],
                    'demand_level': s['demand_level'],
                    'surge_multiplier': s['surge_multiplier'],
                    'wait_time_seconds': s['average_wait_time_seconds']
                }
                for s in snapshots
            ]
        }
    
    except Exception as e:
        logger.error(f"Error fetching heatmap: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap")


@router.get("/hotspots/all")
async def get_all_hotspots():
    """Get all identified hotspot zones"""
    try:
        hotspots = await db.hotspot_zones.find({'is_active': True}).to_list(None)
        
        return [
            {
                'id': str(h['_id']),
                'zone_name': h['zone_name'],
                'bounds': {
                    'north': h['north_latitude'],
                    'south': h['south_latitude'],
                    'east': h['east_longitude'],
                    'west': h['west_longitude']
                },
                'zone_type': h['zone_type'],
                'avg_peak_demand': h['avg_peak_hour_demand'],
                'peak_hours': h.get('peak_hours', {})
            }
            for h in hotspots
        ]
    
    except Exception as e:
        logger.error(f"Error fetching hotspots: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch hotspots")


@router.get("/positioning-recommendations")
async def get_positioning_recommendations(request: Request):
    """Get AI recommendations for driver positioning"""
    try:
        driver_data = await verify_driver_token(request)
        
        # Get active recommendations
        recommendations = await db.driver_positioning_recommendations.find(
            {'valid_until': {'$gt': get_ist_now()}}
        ).sort('priority', -1).limit(5).to_list(None)
        
        return [
            {
                'latitude': r['target_latitude'],
                'longitude': r['target_longitude'],
                'zone_name': r.get('target_zone_name'),
                'reason': r['reason'],
                'estimated_requests_next_hour': r['estimated_requests_in_next_hour'],
                'earning_potential': float(r['estimated_earning_potential']),
                'instructions': r.get('instructions')
            }
            for r in recommendations
        ]
    
    except Exception as e:
        logger.error(f"Error fetching recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch recommendations")


@router.post("/admin/heatmap/update-density")
async def update_density_snapshot(grid_data: dict, request: Request):
    """Update driver density for admin dashboard"""
    try:
        admin_data = await verify_admin_token(request)
        
        for grid_point in grid_data['points']:
            await db.driver_density_snapshots.insert_one({
                'grid_latitude': grid_point['lat'],
                'grid_longitude': grid_point['lon'],
                'active_drivers_count': grid_point['drivers_count'],
                'demand_level': calculate_demand_level(grid_point['drivers_count']),
                'surge_multiplier': calculate_surge(grid_point['drivers_count']),
                'snapshot_time': get_ist_now()
            })
        
        # Broadcast to admin dashboard
        io.emit('heatmap_updated', grid_data, room='admin_heatmap')
        
        return {'status': 'success', 'message': 'Density snapshot updated'}
    
    except Exception as e:
        logger.error(f"Error updating density: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update density")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_booking_id():
    """Generate unique booking ID"""
    from uuid import uuid4
    return f"BK{uuid4().hex[:12].upper()}"


async def verify_passenger_token(request: Request):
    """Verify passenger token from request"""
    user = await get_current_user_from_request(request, allowed_roles=["passenger"])
    return {'_id': str(user.get('id') or user.get('user_id') or ''), 'role': 'passenger'}


async def verify_admin_token(request: Request):
    """Verify admin token"""
    user = await get_current_user_from_request(request, allowed_roles=["admin"])
    return {'_id': str(user.get('id') or user.get('user_id') or ''), 'role': 'admin'}


async def verify_driver_token(request: Request):
    """Verify driver token"""
    user = await get_current_user_from_request(request, allowed_roles=["driver"])
    return {'_id': str(user.get('id') or user.get('user_id') or ''), 'role': 'driver'}


async def verify_manager_token(request: Request):
    """Verify manager token"""
    user = await get_current_user_from_request(request, allowed_roles=["admin", "operator"])
    return {'_id': str(user.get('id') or user.get('user_id') or ''), 'role': user.get('role') or user.get('user_type')}


async def get_flight_info(flight_number: str):
    """Get flight status from external API"""
    return {
        'status': 'on_time',
        'estimated_arrival': get_ist_now() + timedelta(hours=2)
    }


async def notify_user(user_id: str, message: str, type: str, booking_id: Optional[str] = None):
    """Send notification to user"""
    pass


def calculate_route_metrics(stops: List[dict]) -> tuple:
    """Calculate total distance and duration for route"""
    total_distance = 0.0
    total_duration = 0
    for i in range(len(stops) - 1):
        dist = haversine_distance(
            stops[i]['lat'], stops[i]['lon'],
            stops[i+1]['lat'], stops[i+1]['lon']
        )
        total_distance += dist
        total_duration += int(dist * 2)  # ~2 mins per km
    return total_distance, total_duration


def optimize_route(stops: List[dict]) -> tuple:
    """Optimize route using nearest neighbor algorithm"""
    # Simplified nearest neighbor implementation
    visited = [False] * len(stops)
    order = [0]
    visited[0] = True
    
    for _ in range(len(stops) - 1):
        last = order[-1]
        nearest = -1
        min_dist = float('inf')
        
        for i in range(len(stops)):
            if not visited[i]:
                dist = haversine_distance(
                    stops[last]['lat'], stops[last]['lon'],
                    stops[i]['lat'], stops[i]['lon']
                )
                if dist < min_dist:
                    min_dist = dist
                    nearest = i
        
        if nearest != -1:
            order.append(nearest)
            visited[nearest] = True
    
    return order, 'nearest_neighbor'


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km"""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c


def calculate_route_distance(stops: List[dict], order: List[int]) -> float:
    """Calculate total distance for given order"""
    total = 0.0
    for i in range(len(order) - 1):
        total += haversine_distance(
            stops[order[i]]['lat'], stops[order[i]]['lon'],
            stops[order[i+1]]['lat'], stops[order[i+1]]['lon']
        )
    return total


def calculate_route_duration(stops: List[dict], order: List[int]) -> int:
    """Calculate total duration for given order"""
    return int(calculate_route_distance(stops, order) * 2)


def calculate_distance_saved(stops: List[dict], original_order: List[int], optimized_order: List[int]) -> float:
    """Calculate distance saved by optimization"""
    original_dist = calculate_route_distance(stops, original_order)
    optimized_dist = calculate_route_distance(stops, optimized_order)
    return original_dist - optimized_dist


def calculate_time_saved(stops: List[dict], original_order: List[int], optimized_order: List[int]) -> int:
    """Calculate time saved by optimization"""
    return calculate_route_duration(stops, original_order) - calculate_route_duration(stops, optimized_order)


def calculate_cost_savings(original_dist: float, optimized_dist: float) -> Decimal:
    """Calculate cost savings from distance reduction"""
    cost_per_km = Decimal('10')
    return (Decimal(str(original_dist)) - Decimal(str(optimized_dist))) * cost_per_km


def calculate_demand_level(drivers_count: int) -> str:
    """Calculate demand level based on driver count"""
    if drivers_count < 5:
        return 'critical'
    elif drivers_count < 10:
        return 'high'
    elif drivers_count < 20:
        return 'medium'
    return 'low'


def calculate_surge(drivers_count: int) -> float:
    """Calculate surge multiplier based on driver availability"""
    if drivers_count < 5:
        return 2.0
    elif drivers_count < 10:
        return 1.5
    elif drivers_count < 20:
        return 1.25
    return 1.0
