from typing import Dict, Any, List
from .base_agent import Agent
import json
import google.adk
from pydantic import BaseModel, ConfigDict


class ItineraryActivity(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    description: str
    price: str
    duration: str


class ItineraryDay(BaseModel):
    model_config = ConfigDict(extra='forbid')
    day: int
    activities: List[ItineraryActivity]


class Itinerary(BaseModel):
    model_config = ConfigDict(extra='forbid')
    days: List[ItineraryDay]


class ItineraryAgent(Agent):
    """Agent responsible for creating day-by-day itineraries."""

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for itinerary planning."""
        gathered_info = context.get('gathered_info', {})
        days = context.get('days', 3)
        origin = context.get('origin', 'their home')
        destination = context.get('destination', 'this destination')

        return google.adk.Agent(
            name="ItineraryPlannerAgent",
            model=self.model,
            instruction=f"""
You are an expert travel planner. Create a day-by-day itinerary.
Context (flights, hotels, activities found so far): {json.dumps(gathered_info, default=str)}

Generate a {days}-day itinerary.

**Cultural Sensitivity**: Include 1-2 "Cultural Tips" or adjustments in the itinerary that would be particularly useful for someone traveling from {origin} to {destination}. For example, differences in tipping culture, dress codes, or social etiquette.
""",
            output_schema=Itinerary,
            output_key="itinerary"  # Write results to shared session state
        )

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        print(f"[{self.name}] Planning itinerary for: {query}")

        adk_agent = self.create_adk_agent(context)

        try:
            result = await self.run_adk_agent(adk_agent, query)

            if isinstance(result, Itinerary):
                itinerary_data = [d.model_dump() for d in result.days]
            elif isinstance(result, dict):
                itinerary_data = result.get('days', [])
            else:
                itinerary_data = []

            # Note: ADK already stores results in session.state["itinerary"] via output_key
            # No need to manually update state

            return {"itinerary": itinerary_data}
        except Exception as e:
            print(f"[{self.name}] Error during ADK execution: {e}")
            return {"itinerary": []}
