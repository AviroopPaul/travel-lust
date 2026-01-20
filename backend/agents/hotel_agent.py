from typing import Dict, Any, List
from .base_agent import Agent
from urllib.parse import quote
from datetime import datetime
import google.adk
from .tools.search_tool import web_search
from .tools.image_utils import get_hotel_image
from pydantic import BaseModel, ConfigDict


class Hotel(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    price_per_night: str
    rating: float
    description: str
    amenities: List[str]
    style: str


class HotelList(BaseModel):
    model_config = ConfigDict(extra='forbid')
    hotels: List[Hotel]


class HotelAgent(Agent):
    """Agent responsible for searching and finding hotel options."""

    def _generate_hotel_booking_url(self, hotel_name: str, destination: str, dates: str = None) -> str:
        """Generate a Google Hotels search URL for a specific hotel"""
        base_url = "https://www.google.com/travel/hotels"
        query_parts = [hotel_name, destination]
        if dates:
            query_parts.append(dates)
        search_query = " ".join(query_parts)
        return f"{base_url}?q={quote(search_query)}"

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for hotel search."""
        destination = context.get('destination', '')
        current_date = datetime.now().strftime("%B %d, %Y")
        currency = context.get('currency', 'USD')
        strict_budget = context.get('strict_budget', False)
        days = context.get('days', '')
        travelers = context.get('travelers', 1)
        travel_time = context.get('travel_time', '')

        return google.adk.Agent(
            name="HotelSearchAgent",
            model=self.model,
            instruction=f"""You are a hotel search assistant. Today's date is {current_date}.

TASK: Find 3 hotel options in {destination}.
{f'Travel period: {travel_time}' if travel_time else ''}

TOOL USAGE:
- Make exactly 1 search call with query: "best hotels {destination} prices per night {current_date[:4]}"
- DO NOT search more than once.

AFTER SEARCHING, you MUST respond with ONLY a JSON object (no explanation, no markdown):
{{
  "hotels": [
    {{
      "name": "Hotel Name",
      "price_per_night": "{currency} XXX",
      "rating": 4.5,
      "description": "Brief description",
      "amenities": ["WiFi", "Pool", "Gym"],
      "style": "luxury/boutique/budget"
    }},
    ... (exactly 3 hotels)
  ]
}}

IMPORTANT:
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanations
- Extract real hotel names and prices from search results
- rating must be a number between 1-5
{"- Focus on budget-friendly options" if strict_budget else "- Mix: 1 budget, 1 mid-range, 1 luxury"}""",
            tools=[web_search],
            output_schema=HotelList,
            output_key="hotels"
        )

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        print(f"[{self.name}] Searching hotels for: {query}")

        destination = context.get('destination', '')
        dates = context.get('dates', '')

        # Create ADK Agent
        adk_agent = self.create_adk_agent(context)

        try:
            result = await self.run_adk_agent(adk_agent, query)

            if isinstance(result, HotelList):
                hotels_data = [h.model_dump() for h in result.hotels]
            elif isinstance(result, dict):
                hotels_data = result.get('hotels', [])
            else:
                hotels_data = []

            # Post-processing - generate specific URLs and images for each hotel
            for hotel in hotels_data:
                hotel_name = hotel.get('name', 'hotel')
                hotel['booking_url'] = self._generate_hotel_booking_url(
                    hotel_name, destination, dates)
                hotel['image_url'] = get_hotel_image(hotel_name, destination)
                # clean up style
                hotel.pop('style', None)

            # Note: ADK already stores results in session.state["hotels"] via output_key
            # No need to manually update state

            return {"hotels": hotels_data}
        except Exception as e:
            print(f"[{self.name}] Error during ADK execution: {e}")
            return {"hotels": []}
