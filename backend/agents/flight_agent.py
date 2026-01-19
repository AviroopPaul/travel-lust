from typing import Dict, Any, List
from .base_agent import Agent
from urllib.parse import quote
from datetime import datetime
import google.adk
from .tools.search_tool import web_search
from pydantic import BaseModel, ConfigDict


class Flight(BaseModel):
    model_config = ConfigDict(extra='forbid')
    airline: str
    price: str
    departure: str
    arrival: str
    duration: str


class FlightList(BaseModel):
    model_config = ConfigDict(extra='forbid')
    outbound_flights: List[Flight]
    return_flights: List[Flight]


class FlightAgent(Agent):
    """Agent responsible for searching and finding flight options."""

    def _generate_google_flights_url(self, origin: str, destination: str, dates: str = None, is_return: bool = False) -> str:
        """Generate a Google Flights search URL"""
        base_url = "https://www.google.com/travel/flights"
        query_parts = []
        if is_return:
            # Swap origin and destination for return flights
            if destination:
                query_parts.append(f"from {destination}")
            if origin:
                query_parts.append(f"to {origin}")
        else:
            if origin:
                query_parts.append(f"from {origin}")
            if destination:
                query_parts.append(f"to {destination}")
        if dates:
            query_parts.append(dates)

        search_query = " ".join(query_parts)
        return f"{base_url}?q={quote(search_query)}"

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for flight search."""
        origin = context.get('origin', '')
        destination = context.get('destination', '')
        current_date = datetime.now().strftime("%B %d, %Y")
        currency = context.get('currency', 'USD')
        strict_budget = context.get('strict_budget', False)
        travelers = context.get('travelers', 1)
        travel_time = context.get('travel_time', '')
        dates = context.get('dates', '')
        days = context.get('days', 3)

        return google.adk.Agent(
            name="FlightSearchAgent",
            model=self.model,
            instruction=f"""You are a flight search assistant. Today's date is {current_date}.

TASK: Find roundtrip flight options for a trip from {origin or 'a major city'} to {destination}.
{f'Travel period: {travel_time}' if travel_time else ''}
Trip duration: {days} days

TOOL USAGE:
- Make exactly 1 search call with query: "roundtrip flights {origin} to {destination} {travel_time or dates} prices {current_date[:4]}"
- DO NOT search more than once.

AFTER SEARCHING, you MUST respond with ONLY a JSON object (no explanation, no markdown):
{{
  "outbound_flights": [
    {{
      "airline": "Airline Name",
      "price": "{currency} XXX",
      "departure": "HH:MM AM/PM",
      "arrival": "HH:MM AM/PM",
      "duration": "Xh Xm"
    }},
    ... (exactly 3 outbound flights from {origin} to {destination})
  ],
  "return_flights": [
    {{
      "airline": "Airline Name",
      "price": "{currency} XXX",
      "departure": "HH:MM AM/PM",
      "arrival": "HH:MM AM/PM",
      "duration": "Xh Xm"
    }},
    ... (exactly 3 return flights from {destination} back to {origin})
  ]
}}

IMPORTANT:
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanations
- Extract real data from search results
- Include exactly 3 outbound flights AND 3 return flights
- Outbound = {origin} → {destination}
- Return = {destination} → {origin}
{"- Focus on budget-friendly options" if strict_budget else "- Mix of budget and premium options"}""",
            tools=[web_search],
            output_schema=FlightList,
            output_key="flights"
        )

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        print(f"[{self.name}] Searching roundtrip flights for: {query}")

        origin = context.get('origin', '')
        destination = context.get('destination', '')
        dates = context.get('dates', '')

        # Create the ADK Agent
        adk_agent = self.create_adk_agent(context)

        try:
            # Execute using the Runner
            result = await self.run_adk_agent(adk_agent, query)

            # Result should be an instance of FlightList
            if isinstance(result, FlightList):
                outbound_data = [f.model_dump() for f in result.outbound_flights]
                return_data = [f.model_dump() for f in result.return_flights]
            elif isinstance(result, dict):
                outbound_data = result.get('outbound_flights', [])
                return_data = result.get('return_flights', [])
            else:
                outbound_data = []
                return_data = []

            # Add booking URLs for outbound flights
            outbound_booking_url = self._generate_google_flights_url(
                origin, destination, dates, is_return=False)
            for flight in outbound_data:
                flight['booking_url'] = outbound_booking_url

            # Add booking URLs for return flights
            return_booking_url = self._generate_google_flights_url(
                origin, destination, dates, is_return=True)
            for flight in return_data:
                flight['booking_url'] = return_booking_url

            # Update shared session state
            await self.shared_session.update_state("outbound_flights", outbound_data)
            await self.shared_session.update_state("return_flights", return_data)

            return {
                "outbound_flights": outbound_data,
                "return_flights": return_data
            }
        except Exception as e:
            print(f"[{self.name}] Error during ADK execution: {e}")
            return {"outbound_flights": [], "return_flights": []}

