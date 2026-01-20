"""
Orchestrator - Simplified trip planning using the TravelAgent.

The TravelAgent handles all sub-agent orchestration internally using Google ADK's
multi-agent architecture. This orchestrator now just provides a clean interface
to the TravelAgent and handles final result assembly.
"""
import re
from typing import Dict, Any, List

from .gemini_client import get_gemini_client
from .agents import TravelAgent
from .models import TripPlan, UserQuery, FlightOption, HotelOption, ItineraryDay


class Orchestrator:
    """
    Simplified orchestrator that delegates to the TravelAgent.

    The TravelAgent internally manages:
    - FlightAgent
    - HotelAgent
    - VisaAgent
    - ActivityAgent

    All agents share a common session state via SharedSession.
    """

    def __init__(self):
        self.client = get_gemini_client()

        # Single TravelAgent handles all sub-agent orchestration
        self.travel_agent = TravelAgent(
            name="TravelAgent",
            model_client=self.client
        )

    def _extract_price(self, price_str: str) -> float:
        """Helper to extract a numeric price from a string like '$1,200' or '500 EUR'"""
        if not price_str:
            return 0.0
        clean_str = price_str.replace(',', '')
        match = re.search(r'(\d+\.?\d*)', clean_str)
        if match:
            return float(match.group(1))
        return 0.0

    def _calculate_total_budget(self, outbound_flights: List[FlightOption], return_flights: List[FlightOption],
                                hotels: List[HotelOption], itinerary: List[ItineraryDay], days: int, currency: str) -> str:
        """Calculate a rough total budget estimate including roundtrip flights"""
        total = 0.0

        # Add outbound flight cost
        if outbound_flights:
            total += self._extract_price(outbound_flights[0].price)

        # Add return flight cost
        if return_flights:
            total += self._extract_price(return_flights[0].price)

        if hotels:
            nightly_rate = self._extract_price(hotels[0].price_per_night)
            total += nightly_rate * (days or 3)

        if itinerary:
            for day in itinerary:
                for activity in day.activities:
                    total += self._extract_price(activity.price)

        return f"{currency} {total:,.2f}"

    async def plan_trip(self, user_query: UserQuery, client_id: str = None) -> TripPlan:
        """
        Plan a complete trip by delegating to the TravelAgent.

        The TravelAgent internally orchestrates all sub-agents (flight, hotel, visa, activity)
        in parallel and returns aggregated results via shared session state.
        """
        if client_id:
            self.travel_agent.set_client_id(client_id)

        # Construct query string
        query_str = f"Trip to {user_query.destination}"
        if user_query.dates:
            query_str += f" on {user_query.dates}"
        if user_query.origin:
            query_str += f" from {user_query.origin}"

        print(f"[Orchestrator] Planning trip: {query_str}")

        # Build context from user query
        context = user_query.model_dump()

        # Let TravelAgent orchestrate all sub-agents
        # This single call replaces the manual parallel invocation of 4 separate agents
        result = await self.travel_agent.perform_task(query_str, context)

        # Calculate total budget estimate with roundtrip flights
        outbound_flights = [FlightOption(**f)
                            for f in result.get("outbound_flights", [])]
        return_flights = [FlightOption(**f)
                          for f in result.get("return_flights", [])]
        hotels = [HotelOption(**h) for h in result.get("hotels", [])]
        itinerary = [ItineraryDay(**i) for i in result.get("itinerary", [])]
        total_budget = self._calculate_total_budget(
            outbound_flights, return_flights, hotels, itinerary, user_query.days, user_query.currency
        )

        # Construct Final Trip Plan
        return TripPlan(
            destination=user_query.destination or "Unknown",
            destination_images=result.get("destination_images", []),
            outbound_flights=result.get("outbound_flights", []),
            return_flights=result.get("return_flights", []),
            hotels=result.get("hotels", []),
            visa=result.get("visa", {
                "country": user_query.destination,
                "required": False,
                "requirements": [],
                "processing_time": "N/A",
                "application_url": None,
                "application_steps": []
            }),
            itinerary=result.get("itinerary", []),
            total_budget=total_budget,
            preferred_currency=user_query.currency
        )
