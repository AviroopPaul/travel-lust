from pydantic import BaseModel, ConfigDict
from typing import List, Optional


class UserQuery(BaseModel):
    model_config = ConfigDict(extra='forbid')
    query: str
    destination: Optional[str] = None
    origin: Optional[str] = None
    dates: Optional[str] = None
    days: Optional[int] = None
    travelers: int = 1
    travel_time: Optional[str] = None  # e.g., "March 2026", "Summer 2026"
    currency: str = "USD"
    strict_budget: bool = False
    budget: Optional[str] = None


class UserQueryWithClientId(UserQuery):
    client_id: Optional[str] = None


class FlightOption(BaseModel):
    model_config = ConfigDict(extra='forbid')
    airline: str
    price: str
    departure: str
    arrival: str
    duration: str
    booking_url: Optional[str] = None


class HotelOption(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    price_per_night: str
    rating: float
    description: str
    amenities: List[str]
    image_url: Optional[str] = None
    booking_url: Optional[str] = None


class VisaInfo(BaseModel):
    model_config = ConfigDict(extra='forbid')
    country: str
    required: bool
    requirements: List[str]
    processing_time: str
    application_url: Optional[str] = None
    application_steps: List[str] = []


class ActivityOption(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    description: str
    price: str
    duration: str
    image_url: Optional[str] = None


class ItineraryDay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    day: int
    activities: List[ActivityOption]


class TripPlan(BaseModel):
    model_config = ConfigDict(extra='forbid')
    destination: str
    destination_images: List[str] = []  # Multiple destination images
    flights: List[FlightOption]
    hotels: List[HotelOption]
    visa: VisaInfo
    itinerary: List[ItineraryDay]
    total_budget: Optional[str] = None
    preferred_currency: str = "USD"
