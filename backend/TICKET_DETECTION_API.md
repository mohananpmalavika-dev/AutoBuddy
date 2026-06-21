# Ticket Detection Feature - API Documentation

## Overview
The ticket detection feature automatically detects travel/event ticket information from images and creates scheduled rides.

**Supported Ticket Types:**
- Airport/Flight tickets
- Train tickets
- Bus tickets
- Event tickets

## Setup

### Prerequisites
1. Google Generative AI API key (obtain from [Google AI Studio](https://aistudio.google.com/app/apikey))
2. Set environment variable:
   ```bash
   export GOOGLE_API_KEY=your_api_key_here
   # Or on Windows:
   set GOOGLE_API_KEY=your_api_key_here
   ```

### Implementation Files
- **Service**: `backend/app/services/ticket_detection.py` - Core OCR/AI detection logic
- **Router**: `backend/app/routers/ticket_detection.py` - API endpoints
- **Bootstrap**: Updated in `backend/app/bootstrap.py` to register routes

## API Endpoints

### 1. Detect Ticket Information
**Endpoint:** `POST /api/tickets/detect`

**Description:** Upload a ticket image and extract all relevant information

**Authentication:** Required (passenger/driver/admin)

**Request:**
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@ticket_image.jpg"
```

**Response (200 OK):**
```json
{
  "data": {
    "ticket_type": "airport",
    "departure_location": "New York (JFK)",
    "arrival_location": "London (LHR)",
    "departure_datetime": "2026-06-24T20:30:00",
    "arrival_datetime": "2026-06-25T08:00:00",
    "confirmation_number": "ABC123XYZ",
    "passenger_name": "John Doe",
    "carrier_name": "United Airlines",
    "additional_info": {
      "seat": "12A",
      "flight_number": "UA456",
      "terminal": "1"
    }
  },
  "message": "Ticket information detected successfully"
}
```

**Error Response (422 Unprocessable Entity):**
```json
{
  "detail": "Could not detect ticket information"
}
```

---

### 2. Create Scheduled Ride from Detected Ticket
**Endpoint:** `POST /api/tickets/create-ride-from-ticket`

**Description:** Convert detected ticket information into a scheduled ride

**Authentication:** Required (passenger only)

**Request Body:**
```json
{
  "detected_ticket": {
    "ticket_type": "airport",
    "departure_location": "New York (JFK)",
    "arrival_location": "London (LHR)",
    "departure_datetime": "2026-06-24T20:30:00",
    "arrival_datetime": "2026-06-25T08:00:00",
    "confirmation_number": "ABC123XYZ",
    "passenger_name": "John Doe",
    "carrier_name": "United Airlines",
    "additional_info": {}
  },
  "advance_minutes": 90,
  "auto_create_ride": true,
  "preferred_payment": "wallet",
  "driver_gender_preference": "any",
  "notes": "Going to airport for flight"
}
```

**Response (201 Created):**
```json
{
  "data": {
    "ride_id": "507f1f77bcf86cd799439011",
    "scheduled_time": "2026-06-24T18:00:00",
    "pickup_location": "New York (JFK)",
    "dropoff_location": "London (LHR)",
    "estimated_fare": 95.50,
    "status": "pending",
    "message": "Ride scheduled for 2026-06-24 18:00 UTC"
  },
  "resource_id": "507f1f77bcf86cd799439011"
}
```

---

### 3. One-Shot: Detect Ticket and Create Ride
**Endpoint:** `POST /api/tickets/detect-and-create-ride`

**Description:** Upload image and automatically create ride in one request

**Authentication:** Required (passenger only)

**Request:**
```bash
curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?auto_create=true&advance_minutes=90" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@ticket_image.jpg"
```

**Query Parameters:**
- `auto_create` (bool, default: true) - Automatically create ride if detection succeeds
- `advance_minutes` (int, default: 90) - Schedule pickup N minutes before departure
- `pickup_address` (string, optional) - Override auto-detected pickup location
- `dropoff_address` (string, optional) - Override auto-detected dropoff location
- `pickup_latitude` (float, optional) - Pickup latitude for precise location
- `pickup_longitude` (float, optional) - Pickup longitude for precise location
- `dropoff_latitude` (float, optional) - Dropoff latitude
- `dropoff_longitude` (float, optional) - Dropoff longitude

**Response (200 OK):**
```json
{
  "data": {
    "detected_ticket": {
      "ticket_type": "airport",
      "departure_location": "New York (JFK)",
      "arrival_location": "London (LHR)",
      "departure_datetime": "2026-06-24T20:30:00",
      "arrival_datetime": "2026-06-25T08:00:00",
      "confirmation_number": "ABC123XYZ",
      "passenger_name": "John Doe",
      "carrier_name": "United Airlines",
      "additional_info": {}
    },
    "ride_created": {
      "ride_id": "507f1f77bcf86cd799439011",
      "scheduled_time": "2026-06-24T18:00:00",
      "pickup_location": "New York (JFK)",
      "dropoff_location": "London (LHR)",
      "estimated_fare": 95.50,
      "status": "pending"
    }
  }
}
```

## Supported Ticket Types

| Ticket Type | Detected From | Auto-Ride Type | Example |
|-------------|---------------|----------------|---------|
| `airport` | Flight tickets | `airport_ride` | Boarding pass, e-ticket |
| `train` | Railway tickets | `rental` | Train pass, booking confirmation |
| `bus` | Bus tickets | `ride` | Bus pass, online booking |
| `event` | Event tickets | `ride` | Concert, sports, theater tickets |

## Automatic Location Inference

The system attempts to infer GPS coordinates from location names. Supported locations include:

**Airports:** JFK, LAX, LHR, CDG, NRT, DXB, ORD, ATL, HND
**Major Cities:** New York, Los Angeles, London, Paris, Tokyo, Dubai, Chicago, Atlanta, San Francisco, Singapore

For other locations, you can provide explicit coordinates using the API parameters.

## Ride Scheduling Logic

1. **Ride Type Mapping:**
   - Airport ticket → `airport_ride` (dedicated airport service)
   - Train ticket → `rental` (typically longer journeys)
   - Bus/Event → `ride` (standard ride)

2. **Automatic Schedule:**
   - Default advance time: 90 minutes before departure
   - Pickup scheduled for `departure_time - advance_minutes`
   - Minimum 30 minutes in future (safety buffer)

3. **Fare Estimation:**
   - Base: $60
   - Distance: $18/km
   - Booking fee: $20
   - Formula: `max(60, 35 + (distance_km * 18) + 20)`

## Example Workflows

### Workflow 1: Airport Trip - Quick Setup
```
User takes photo of flight ticket
→ Auto-detects: NY → London, June 24, 8:30 PM
→ Schedules ride for June 24, 6:00 PM
→ Confirms with driver 30 minutes before
→ Ride completed to airport
```

### Workflow 2: Train Journey - Manual Confirmation
```
User uploads train ticket
→ System detects: Chicago → Denver, June 25, 2:00 PM
→ Shows detected info to user
→ User adjusts pickup point if needed
→ Confirms to create ride
→ Ride scheduled 90 minutes before departure
```

### Workflow 3: Event Attendance
```
User uploads event ticket (concert)
→ Detects: Event at Madison Square Garden, June 25, 7:00 PM
→ Schedules ride for 5:30 PM pickup
→ Automatically links to event details
```

## Error Handling

| Status | Error | Solution |
|--------|-------|----------|
| 400 | File must be an image | Upload JPG, PNG, GIF, or WebP |
| 400 | File is empty | Ensure ticket image is readable |
| 422 | Could not detect ticket | Image unclear, try better photo angle/lighting |
| 422 | Ticket must have departure date/time | Image doesn't show departure info clearly |
| 422 | Could not determine coordinates | Provide explicit lat/lng or clearer location name |
| 503 | AI service is not configured | Set GOOGLE_API_KEY environment variable |
| 500 | Failed to process ticket image | Server error, check logs |

## Configuration

### Environment Variables
```bash
# Required
GOOGLE_API_KEY=your_google_ai_key

# Optional - already in requirements.txt
# google-generativeai==0.8.6
```

### Backend Integration Points
1. **Database:** MongoDB collection `scheduled_rides`
2. **Authentication:** Uses existing RBAC system
3. **Payment:** Integrates with wallet management
4. **Notifications:** Scheduled reminders sent 60 minutes before ride

## Testing

### Test Images
The feature works with any clear ticket image:
- Digital tickets (screenshot)
- Physical tickets (photographed)
- QR code-based tickets
- Bar code tickets

### Sample cURL Commands

**Test Detection Only:**
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@ticket.jpg"
```

**Test Full Flow (Detect + Create):**
```bash
curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?advance_minutes=120" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@ticket.jpg"
```

**With Custom Coordinates:**
```bash
curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?auto_create=true&pickup_latitude=40.7128&pickup_longitude=-74.0060&dropoff_latitude=51.5074&dropoff_longitude=-0.1278" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@ticket.jpg"
```

## Future Enhancements

1. **Multi-language Support** - OCR for non-English tickets
2. **Recurring Trips** - Detect pattern from multiple tickets
3. **Integration with Calendar** - Sync with Google/Outlook calendar
4. **Smart Reminders** - Weather-aware pickup time adjustments
5. **Splitting Costs** - Group rides from event tickets
6. **Return Ride** - Auto-schedule return based on event duration
