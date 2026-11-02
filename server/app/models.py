from typing import Literal, Optional

from pydantic import BaseModel, Field


Cabin = Literal["economy", "premium_economy", "business", "first"]
Sort = Literal["best", "cheapest", "fastest", "earliest", "lowest_co2"]


class Brief(BaseModel):
    """What the traveller wants. Only these fields affect the fare search."""

    origin: list[str] = Field(default_factory=list)
    origin_label: Optional[str] = None
    destination: list[str] = Field(default_factory=list)
    destination_label: Optional[str] = None
    outbound_date: Optional[str] = None
    return_date: Optional[str] = None
    one_way: Optional[bool] = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    cabin: Cabin = "economy"
    currency: str = "USD"
    flex_days: int = 0


class Filters(BaseModel):
    max_stops: Optional[int] = None
    max_price: Optional[int] = None
    max_duration_min: Optional[int] = None
    airlines_include: list[str] = Field(default_factory=list)
    airlines_exclude: list[str] = Field(default_factory=list)
    depart_after_hour: Optional[int] = None
    depart_before_hour: Optional[int] = None
    arrive_after_hour: Optional[int] = None
    arrive_before_hour: Optional[int] = None
    no_red_eye: bool = False
    no_overnight_layover: bool = False
    allow_self_transfer: bool = False
    max_layover_min: Optional[int] = None
    min_layover_min: Optional[int] = None
    avoid_layover_airports: list[str] = Field(default_factory=list)
    sort: Sort = "best"


class Segment(BaseModel):
    airline: str
    airline_code: str
    flight_number: str
    from_code: str
    from_name: str
    to_code: str
    to_name: str
    depart_at: str
    arrive_at: str
    duration_min: int
    aircraft: Optional[str] = None
    legroom: Optional[str] = None


class Layover(BaseModel):
    airport: str
    name: str
    city: Optional[str] = None
    duration_min: int
    overnight: bool = False


class Itinerary(BaseModel):
    id: str
    price: int
    currency: str
    airlines: list[str]
    airline_codes: list[str]
    segments: list[Segment]
    layovers: list[Layover] = Field(default_factory=list)
    stops: int
    duration_min: int
    depart_at: str
    arrive_at: str
    depart_hour: int
    arrive_hour: int
    arrive_day_offset: int = 0
    red_eye: bool = False
    overnight_layover: bool = False
    longest_layover_min: int = 0
    co2_kg: Optional[int] = None
    typical_co2_kg: Optional[int] = None
    tags: list[str] = Field(default_factory=list)
    note: Optional[str] = None


class PriceInsights(BaseModel):
    lowest: Optional[int] = None
    typical_low: Optional[int] = None
    typical_high: Optional[int] = None
    level: Optional[Literal["low", "typical", "high"]] = None
    history: list[int] = Field(default_factory=list)


class BookingOffer(BaseModel):
    seller: str
    price: int
    is_airline: bool = False
    url: Optional[str] = None
    post_data: Optional[str] = None
    phone: Optional[str] = None
    baggage: list[str] = Field(default_factory=list)
    separate_tickets: bool = False
