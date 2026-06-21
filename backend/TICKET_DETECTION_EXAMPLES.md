# Ticket Detection - Example Requests & Responses

This file contains real-world examples for using the Ticket Detection API.

## Example 1: Airport Ticket Detection

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -F "file=@flight_ticket.jpg"
```

### Response (200 OK)
```json
{
  "data": {
    "ticket_type": "airport",
    "departure_location": "New York (JFK)",
    "arrival_location": "London (LHR)",
    "departure_datetime": "2026-06-24T20:30:00",
    "arrival_datetime": "2026-06-25T08:00:00",
    "confirmation_number": "BA456XYZ",
    "passenger_name": "John Michael Doe",
    "carrier_name": "British Airways",
    "additional_info": {
      "seat": "12A",
      "flight_number": "BA456",
      "terminal": "1",
      "boarding_time": "19:45",
      "aircraft_type": "Boeing 777"
    }
  },
  "message": "Ticket information detected successfully"
}
```

---

## Example 2: Creating Ride from Airport Ticket

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/create-ride-from-ticket \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "detected_ticket": {
      "ticket_type": "airport",
      "departure_location": "New York (JFK)",
      "arrival_location": "London (LHR)",
      "departure_datetime": "2026-06-24T20:30:00",
      "arrival_datetime": "2026-06-25T08:00:00",
      "confirmation_number": "BA456XYZ",
      "passenger_name": "John Michael Doe",
      "carrier_name": "British Airways",
      "additional_info": {
        "seat": "12A",
        "flight_number": "BA456"
      }
    },
    "advance_minutes": 120,
    "auto_create_ride": true,
    "preferred_payment": "wallet",
    "driver_gender_preference": "any",
    "notes": "Flight to London for business meeting"
  }'
```

### Response (201 Created)
```json
{
  "data": {
    "ride_id": "507f1f77bcf86cd799439011",
    "scheduled_time": "2026-06-24T18:30:00",
    "pickup_location": "New York (JFK)",
    "dropoff_location": "London (LHR)",
    "estimated_fare": 125.50,
    "status": "pending",
    "message": "Ride scheduled for 2026-06-24 18:30 UTC"
  },
  "resource_id": "507f1f77bcf86cd799439011"
}
```

---

## Example 3: Train Ticket Detection

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@train_ticket.png"
```

### Response (200 OK)
```json
{
  "data": {
    "ticket_type": "train",
    "departure_location": "Chicago Union Station",
    "arrival_location": "Denver Union Station",
    "departure_datetime": "2026-06-25T14:00:00",
    "arrival_datetime": "2026-06-25T20:00:00",
    "confirmation_number": "AMTK789012",
    "passenger_name": "Jane Elizabeth Smith",
    "carrier_name": "Amtrak",
    "additional_info": {
      "seat": "Car 3, Seat 14",
      "train_number": "5",
      "service_type": "Zephyr",
      "coach": "3",
      "accommodation": "Coach"
    }
  },
  "message": "Ticket information detected successfully"
}
```

---

## Example 4: Event Ticket Detection

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@concert_ticket.jpg"
```

### Response (200 OK)
```json
{
  "data": {
    "ticket_type": "event",
    "departure_location": "Madison Square Garden, New York",
    "arrival_location": null,
    "departure_datetime": "2026-06-28T19:00:00",
    "arrival_datetime": null,
    "confirmation_number": "EVT2024MSG001",
    "passenger_name": "Sarah Johnson",
    "carrier_name": "Live Nation Entertainment",
    "additional_info": {
      "event": "Taylor Swift - Eras Tour",
      "section": "201",
      "row": "F",
      "seat": "12",
      "event_date": "June 28, 2026",
      "doors_open": "18:00",
      "venue_address": "33 Penn Plaza, New York, NY 10001"
    }
  },
  "message": "Ticket information detected successfully"
}
```

---

## Example 5: One-Shot Endpoint (Detect + Create)

### Request
```bash
curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?auto_create=true&advance_minutes=90" \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@flight.jpg"
```

### Response (200 OK)
```json
{
  "data": {
    "detected_ticket": {
      "ticket_type": "airport",
      "departure_location": "San Francisco (SFO)",
      "arrival_location": "Seattle (SEA)",
      "departure_datetime": "2026-06-26T15:00:00",
      "arrival_datetime": "2026-06-26T17:30:00",
      "confirmation_number": "SW789456",
      "passenger_name": "Michael Chen",
      "carrier_name": "Southwest Airlines",
      "additional_info": {
        "flight": "SWA123",
        "seat": "24B",
        "boarding_group": "A"
      }
    },
    "ride_created": {
      "ride_id": "507f191e810c19729de860ea",
      "scheduled_time": "2026-06-26T13:30:00",
      "pickup_location": "San Francisco (SFO)",
      "dropoff_location": "Seattle (SEA)",
      "estimated_fare": 89.75,
      "status": "pending"
    }
  }
}
```

---

## Example 6: Override Location Coordinates

### Request
```bash
curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?auto_create=true&pickup_latitude=40.7128&pickup_longitude=-74.0060&dropoff_latitude=51.5074&dropoff_longitude=-0.1278" \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@ticket.jpg"
```

### Response (200 OK)
```json
{
  "data": {
    "detected_ticket": {
      "ticket_type": "airport",
      "departure_location": "New York",
      "arrival_location": "London",
      "departure_datetime": "2026-06-24T20:30:00",
      "arrival_datetime": "2026-06-25T08:00:00",
      "confirmation_number": "BA456",
      "passenger_name": "John Doe",
      "carrier_name": "British Airways",
      "additional_info": {}
    },
    "ride_created": {
      "ride_id": "507f191e810c19729de860eb",
      "scheduled_time": "2026-06-24T18:00:00",
      "pickup_location": "New York",
      "dropoff_location": "London",
      "estimated_fare": 125.50,
      "status": "pending"
    }
  }
}
```

---

## Example 7: Custom Advance Booking Time

### Request (Book 2 hours before departure)
```bash
curl -X POST http://localhost:8000/api/tickets/create-ride-from-ticket \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "detected_ticket": {
      "ticket_type": "airport",
      "departure_location": "Boston (BOS)",
      "arrival_location": "Miami (MIA)",
      "departure_datetime": "2026-06-25T16:00:00",
      "arrival_datetime": "2026-06-25T19:00:00",
      "confirmation_number": "AA123",
      "passenger_name": "David Wilson",
      "carrier_name": "American Airlines",
      "additional_info": {}
    },
    "advance_minutes": 120,
    "preferred_payment": "card",
    "driver_gender_preference": "female"
  }'
```

### Response (201 Created)
```json
{
  "data": {
    "ride_id": "507f191e810c19729de860ec",
    "scheduled_time": "2026-06-25T14:00:00",
    "pickup_location": "Boston (BOS)",
    "dropoff_location": "Miami (MIA)",
    "estimated_fare": 95.00,
    "status": "pending",
    "message": "Ride scheduled for 2026-06-25 14:00 UTC"
  },
  "resource_id": "507f191e810c19729de860ec"
}
```

---

## Example 8: Error - Invalid Image

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@document.txt"
```

### Response (400 Bad Request)
```json
{
  "detail": "File must be an image (JPG, PNG, GIF, or WebP)"
}
```

---

## Example 9: Error - Could Not Detect Ticket

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@random_photo.jpg"
```

### Response (422 Unprocessable Entity)
```json
{
  "detail": "Could not detect ticket information"
}
```

---

## Example 10: Error - Missing API Key Configuration

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@ticket.jpg"
```

### Response (503 Service Unavailable)
```json
{
  "detail": "AI service is not configured"
}
```

---

## Example 11: Bus Ticket Detection

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@bus_ticket.jpg"
```

### Response (200 OK)
```json
{
  "data": {
    "ticket_type": "bus",
    "departure_location": "Los Angeles (LAX)",
    "arrival_location": "San Diego (SAN)",
    "departure_datetime": "2026-06-27T10:30:00",
    "arrival_datetime": "2026-06-27T12:30:00",
    "confirmation_number": "GREYHOUND456",
    "passenger_name": "Amanda Martinez",
    "carrier_name": "Greyhound Lines",
    "additional_info": {
      "seat": "22",
      "bus_line": "LA-SD Express",
      "boarding_location": "Union Station"
    }
  },
  "message": "Ticket information detected successfully"
}
```

---

## Example 12: Complex Multi-Stop Journey

### Request
```bash
curl -X POST http://localhost:8000/api/tickets/detect \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@itinerary.jpg"
```

### Response (200 OK - First leg detected)
```json
{
  "data": {
    "ticket_type": "airport",
    "departure_location": "New York (LGA)",
    "arrival_location": "London (LHR)",
    "departure_datetime": "2026-06-24T19:00:00",
    "arrival_datetime": "2026-06-25T07:00:00",
    "confirmation_number": "BA123+BA456",
    "passenger_name": "Robert Thompson",
    "carrier_name": "British Airways",
    "additional_info": {
      "legs": 2,
      "first_leg": "NYC-LHR",
      "second_leg": "LHR-CDG",
      "layover": "2 hours",
      "note": "Ticket detected for first leg"
    }
  },
  "message": "Ticket information detected successfully"
}
```

---

## Bulk Operations Example

### Create Multiple Rides from Different Tickets

```bash
#!/bin/bash

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

for ticket_file in *.jpg; do
  echo "Processing: $ticket_file"
  
  # Detect and create in one call
  curl -X POST "http://localhost:8000/api/tickets/detect-and-create-ride?auto_create=true" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$ticket_file" \
    -s | jq '.data.ride_created.ride_id'
done
```

---

## Testing with Python

```python
import requests
import json

API_URL = "http://localhost:8000/api/tickets"
TOKEN = "your_jwt_token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Example 1: Detect ticket
with open("ticket.jpg", "rb") as f:
    files = {"file": f}
    response = requests.post(f"{API_URL}/detect", headers=HEADERS, files=files)
    ticket_data = response.json()["data"]
    print(f"Detected: {ticket_data['ticket_type']} from {ticket_data['departure_location']}")

# Example 2: Create ride
ride_request = {
    "detected_ticket": ticket_data,
    "advance_minutes": 90,
    "auto_create_ride": True
}
response = requests.post(
    f"{API_URL}/create-ride-from-ticket",
    headers=HEADERS,
    json=ride_request
)
ride_data = response.json()["data"]
print(f"Ride created: {ride_data['ride_id']} at {ride_data['scheduled_time']}")
```

---

## Testing with JavaScript/Node.js

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

const API_URL = "http://localhost:8000/api/tickets";
const TOKEN = "your_jwt_token";
const headers = { Authorization: `Bearer ${TOKEN}` };

// Example: One-shot detect and create
async function detectAndCreateRide(ticketFilePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(ticketFilePath));

  const response = await axios.post(
    `${API_URL}/detect-and-create-ride?auto_create=true`,
    form,
    { headers: { ...headers, ...form.getHeaders() } }
  );

  const { detected_ticket, ride_created } = response.data.data;
  console.log(`Detected: ${detected_ticket.ticket_type}`);
  console.log(`Ride scheduled: ${ride_created.ride_id}`);
}

detectAndCreateRide('flight_ticket.jpg');
```

---

**Last Updated**: June 22, 2026  
**Feature Version**: 1.0.0
