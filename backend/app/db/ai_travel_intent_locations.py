"""
Sample Location Database for AI Travel Intent Engine

Includes popular destinations across categories in India.
Can be extended to database in production.
"""

from .ai_travel_intent_models import Location, LocationCategory

# Sample locations database - would be in MongoDB/PostgreSQL in production
SAMPLE_LOCATIONS = [
    # Entertainment - Multiplexes
    Location(
        id="cinepolis_kollam",
        name="Cinepolis Kollam",
        category=LocationCategory.MULTIPLEX,
        address="Cinepolis, ASR Complex, Kollam, Kerala 691001",
        latitude=8.8932,
        longitude=76.5865,
        phone="+91-0474-2702701",
        website="www.cinepolis.com",
        opening_hours="10:00 AM - 11:00 PM",
        rating=4.5,
        reviews_count=1250,
        capacity=500,
        amenities=["Parking", "AC", "Wheelchair Accessible", "Food Court"],
        tags=["movies", "family", "entertainment", "weekend"]
    ),
    Location(
        id="pvr_kochi",
        name="PVR Cinemas Kochi",
        category=LocationCategory.MULTIPLEX,
        address="Lulu Mall, Kochi, Kerala 682024",
        latitude=9.9689,
        longitude=76.3295,
        phone="+91-0484-4014014",
        website="www.pvrcinemas.com",
        opening_hours="10:00 AM - 11:30 PM",
        rating=4.6,
        reviews_count=2100,
        capacity=800,
        amenities=["Premium Seating", "IMAX", "Parking", "Food Court", "AC"],
        tags=["movies", "premium", "entertainment"]
    ),
    Location(
        id="inox_bangalore",
        name="INOX Bangalore",
        category=LocationCategory.MULTIPLEX,
        address="Prestige Ozone, Bangalore, Karnataka 560102",
        latitude=13.0047,
        longitude=77.5944,
        phone="+91-080-40617777",
        website="www.inoxmovies.com",
        opening_hours="9:30 AM - 12:00 AM",
        rating=4.7,
        reviews_count=3500,
        capacity=900,
        amenities=["Recliner Seats", "IMAX", "4K", "Parking", "Food Court"],
        tags=["movies", "premium", "entertainment", "business-district"]
    ),

    # Dining - Restaurants
    Location(
        id="karavali_kochi",
        name="Karavali Restaurant",
        category=LocationCategory.RESTAURANT,
        address="Taj Malabar Resort & Spa, Kochi, Kerala 682011",
        latitude=9.9557,
        longitude=76.2553,
        phone="+91-0484-6605353",
        website="www.tajhotels.com",
        opening_hours="12:00 PM - 3:00 PM, 7:00 PM - 11:00 PM",
        rating=4.8,
        reviews_count=850,
        capacity=150,
        amenities=["Veg & Non-veg", "Kerala Cuisine", "River View", "AC", "Parking"],
        tags=["dining", "seafood", "family", "special-occasion"]
    ),
    Location(
        id="truffles_bangalore",
        name="Truffles Restaurant",
        category=LocationCategory.RESTAURANT,
        address="UB City, Bangalore, Karnataka 560001",
        latitude=13.0014,
        longitude=77.5968,
        phone="+91-080-41435555",
        website="www.truffles.in",
        opening_hours="11:30 AM - 11:30 PM",
        rating=4.6,
        reviews_count=1200,
        capacity=200,
        amenities=["International Cuisine", "Bar", "AC", "WiFi", "Parking"],
        tags=["dining", "multi-cuisine", "date-night", "business-lunch"]
    ),
    Location(
        id="tejas_hyderabad",
        name="Tejas Restaurant",
        category=LocationCategory.RESTAURANT,
        address="Banjara Hills, Hyderabad, Telangana 500034",
        latitude=17.3851,
        longitude=78.4744,
        phone="+91-040-66111111",
        website="www.tejas.in",
        opening_hours="12:00 PM - 11:00 PM",
        rating=4.5,
        reviews_count=950,
        capacity=180,
        amenities=["Hyderabadi Cuisine", "Biryani Specialists", "AC", "Takeaway"],
        tags=["dining", "authentic", "family", "budget-friendly"]
    ),

    # Cafes
    Location(
        id="coffee_bean_kochi",
        name="The Coffee Bean & Tea Leaf",
        category=LocationCategory.CAFE,
        address="Lulu Mall, Kochi, Kerala 682024",
        latitude=9.9689,
        longitude=76.3295,
        phone="+91-0484-4015555",
        website="www.coffeebean.in",
        opening_hours="7:00 AM - 11:00 PM",
        rating=4.4,
        reviews_count=2300,
        capacity=80,
        amenities=["WiFi", "Parking", "AC", "Outdoor Seating"],
        tags=["cafe", "coffee", "study-friendly", "work-space"]
    ),

    # Shopping - Malls
    Location(
        id="lulu_mall_kochi",
        name="Lulu Mall Kochi",
        category=LocationCategory.MALL,
        address="Kochi, Kerala 682024",
        latitude=9.9689,
        longitude=76.3295,
        phone="+91-0484-4014000",
        website="www.lulumallkochi.in",
        opening_hours="10:00 AM - 10:00 PM",
        rating=4.5,
        reviews_count=1800,
        capacity=5000,
        amenities=["500+ Stores", "Food Court", "Parking", "AC", "Movie Theater"],
        tags=["shopping", "mall", "family", "entertainment"]
    ),
    Location(
        id="inorbit_bangalore",
        name="Inorbit Mall Bangalore",
        category=LocationCategory.MALL,
        address="Bangalore, Karnataka 560102",
        latitude=13.0047,
        longitude=77.5944,
        phone="+91-080-40617777",
        website="www.inorbitmalkindia.com",
        opening_hours="10:00 AM - 10:00 PM",
        rating=4.6,
        reviews_count=2100,
        capacity=4000,
        amenities=["300+ Brands", "Food Court", "Parking", "Gaming Zone"],
        tags=["shopping", "mall", "family", "premium"]
    ),

    # Medical - Hospitals
    Location(
        id="amrita_hospital_kochi",
        name="Amrita Institute of Medical Sciences",
        category=LocationCategory.HOSPITAL,
        address="Ponekkara, Kochi, Kerala 682041",
        latitude=9.8906,
        longitude=76.2925,
        phone="+91-0484-2825000",
        website="www.amritahospitals.org",
        opening_hours="24/7",
        rating=4.7,
        reviews_count=1500,
        capacity=600,
        amenities=["24/7 Emergency", "ICU", "OT", "Parking", "Cafeteria"],
        tags=["hospital", "medical", "emergency", "speciality-care"]
    ),
    Location(
        id="fortis_bangalore",
        name="Fortis Hospital Bangalore",
        category=LocationCategory.HOSPITAL,
        address="Bangalore, Karnataka 560092",
        latitude=13.0090,
        longitude=77.5808,
        phone="+91-080-66912233",
        website="www.fortishealthcare.com",
        opening_hours="24/7",
        rating=4.8,
        reviews_count=2200,
        capacity=700,
        amenities=["Super Speciality", "Advanced OTs", "ICU", "24/7 Pharmacy"],
        tags=["hospital", "medical", "premium", "speciality"]
    ),

    # Fitness - Gyms
    Location(
        id="cult_kochi",
        name="Cult.Fit Kochi",
        category=LocationCategory.GYM,
        address="Kochi, Kerala 682024",
        latitude=9.9689,
        longitude=76.3295,
        phone="+91-0484-4015555",
        website="www.cultfit.com",
        opening_hours="6:00 AM - 10:00 PM",
        rating=4.6,
        reviews_count=980,
        capacity=300,
        amenities=["Gym Equipment", "Yoga", "CrossFit", "Locker Room", "Shower"],
        tags=["fitness", "gym", "yoga", "workout"]
    ),
    Location(
        id="gold_gym_bangalore",
        name="Gold's Gym Bangalore",
        category=LocationCategory.GYM,
        address="Bangalore, Karnataka 560001",
        latitude=13.0047,
        longitude=77.5944,
        phone="+91-080-41435555",
        website="www.goldsgym.in",
        opening_hours="6:00 AM - 11:00 PM",
        rating=4.5,
        reviews_count=1300,
        capacity=400,
        amenities=["Premium Equipment", "Personal Training", "Sauna", "Spa"],
        tags=["fitness", "gym", "premium", "workout"]
    ),

    # Education - Schools/Colleges
    Location(
        id="amrita_university_kochi",
        name="Amrita Vishwa Vidyapeetham",
        category=LocationCategory.SCHOOL,
        address="Amritapuri, Kochi, Kerala 682041",
        latitude=9.8906,
        longitude=76.2925,
        phone="+91-0484-2801000",
        website="www.amrita.edu",
        opening_hours="7:00 AM - 6:00 PM",
        rating=4.7,
        reviews_count=2500,
        capacity=5000,
        amenities=["Campus", "Library", "Cafeteria", "Parking", "Transportation"],
        tags=["education", "university", "college", "campus"]
    ),

    # Travel - Airport
    Location(
        id="kochi_airport",
        name="Cochin International Airport",
        category=LocationCategory.AIRPORT,
        address="Nedumbassery, Kochi, Kerala 683111",
        latitude=10.1582,
        longitude=76.3889,
        phone="+91-0484-2610500",
        website="www.cochinairport.com",
        opening_hours="24/7",
        rating=4.4,
        reviews_count=3200,
        capacity=3000,
        amenities=["International Flights", "Domestic Flights", "Lounge", "Parking"],
        tags=["travel", "airport", "international", "transport"]
    ),
    Location(
        id="bangalore_airport",
        name="Kempegowda International Airport",
        category=LocationCategory.AIRPORT,
        address="Bangalore, Karnataka 560300",
        latitude=13.1939,
        longitude=77.7064,
        phone="+91-080-66721111",
        website="www.bengaluru-airport.in",
        opening_hours="24/7",
        rating=4.5,
        reviews_count=4100,
        capacity=5000,
        amenities=["International Hub", "Lounge", "Shopping", "WiFi", "Parking"],
        tags=["travel", "airport", "international", "hub"]
    ),

    # Business - Office
    Location(
        id="tcs_bangalore",
        name="TCS Bangalore Tech Park",
        category=LocationCategory.OFFICE,
        address="Bangalore, Karnataka 560066",
        latitude=13.0290,
        longitude=77.5744,
        phone="+91-080-40615555",
        website="www.tcs.com",
        opening_hours="8:00 AM - 8:00 PM",
        rating=4.6,
        reviews_count=1500,
        capacity=8000,
        amenities=["IT Park", "Cafeteria", "Parking", "WiFi", "Conference Rooms"],
        tags=["business", "office", "tech-park", "work"]
    ),

    # Wellness - Spa
    Location(
        id="kaya_klinic",
        name="Kaya Skin Clinic",
        category=LocationCategory.GYM,  # Using GYM for wellness (can add spa category)
        address="Kochi, Kerala 682024",
        latitude=9.9689,
        longitude=76.3295,
        phone="+91-0484-4015555",
        website="www.kayaklinic.com",
        opening_hours="10:00 AM - 8:00 PM",
        rating=4.5,
        reviews_count=650,
        capacity=50,
        amenities=["Spa Services", "Facial", "Massage", "Hair Treatment"],
        tags=["wellness", "spa", "beauty", "self-care"]
    ),
]


def get_sample_locations() -> list[Location]:
    """Get all sample locations"""
    return SAMPLE_LOCATIONS


def search_locations_by_category(category: LocationCategory) -> list[Location]:
    """Search locations by category"""
    return [loc for loc in SAMPLE_LOCATIONS if loc.category == category]


def search_locations_by_tags(tags: list[str]) -> list[Location]:
    """Search locations by tags"""
    results = []
    for loc in SAMPLE_LOCATIONS:
        if loc.tags and any(tag in loc.tags for tag in tags):
            results.append(loc)
    return results


def search_locations_by_name(name: str) -> list[Location]:
    """Search locations by name"""
    name_lower = name.lower()
    return [loc for loc in SAMPLE_LOCATIONS if name_lower in loc.name.lower()]


def get_location_by_id(location_id: str) -> Location | None:
    """Get location by ID"""
    for loc in SAMPLE_LOCATIONS:
        if loc.id == location_id:
            return loc
    return None
