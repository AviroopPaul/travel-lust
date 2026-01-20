"""
TravelAgent - Root orchestrator that manages sub-agents for trip planning.
Uses Google ADK's SequentialAgent + ParallelAgent for proper orchestration.
"""
import uuid
from typing import Dict, Any, List
from datetime import datetime
from urllib.parse import quote
import google.adk
from google.adk.agents import ParallelAgent, SequentialAgent

from .base_agent import Agent, SharedSession
from .flight_agent import FlightAgent
from .hotel_agent import HotelAgent
from .visa_agent import VisaAgent
from .activity_agent import ActivityAgent
from .itinerary_agent import ItineraryAgent
from .tools.image_utils import get_destination_images, get_hotel_image, clear_image_cache


class TravelAgent(Agent):
    """
    Root orchestrator agent that coordinates all sub-agents for trip planning.

    Uses Google ADK's orchestration pattern:
    - SequentialAgent as root
    - ParallelAgent gathers data from all sub-agents concurrently
    - Sub-agents write to session state via output_key
    """

    def __init__(self, name: str = "TravelAgent", model_client: Any = None,
                 model_id: str = "openai/gpt-4o-mini"):
        super().__init__(name, model_client, model_id)

        # Initialize sub-agents (they provide ADK agent definitions)
        self.flight_agent = FlightAgent("FlightAgent", model_client, model_id)
        self.hotel_agent = HotelAgent("HotelAgent", model_client, model_id)
        self.visa_agent = VisaAgent("VisaAgent", model_client, model_id)
        self.activity_agent = ActivityAgent(
            "ActivityAgent", model_client, model_id)
        self.itinerary_agent = ItineraryAgent(
            "ItineraryAgent", model_client, model_id)

    def set_client_id(self, client_id: str):
        """Override to pass client_id to all sub-agents"""
        super().set_client_id(client_id)
        self.flight_agent.set_client_id(client_id)
        self.hotel_agent.set_client_id(client_id)
        self.visa_agent.set_client_id(client_id)
        self.activity_agent.set_client_id(client_id)
        self.itinerary_agent.set_client_id(client_id)

    def _get_memory_context(self) -> Dict[str, Any]:
        """Convert memories to context for personalization"""
        # TODO: Implement memory-based personalization in the future
        # This will convert user memories into context for agent personalization
        return {}

    def _generate_hotel_booking_url(self, hotel_name: str, destination: str, dates: str = None) -> str:
        """Generate a Google Hotels search URL"""
        base_url = "https://www.google.com/travel/hotels"
        query_parts = [hotel_name, destination]
        if dates:
            query_parts.append(dates)
        search_query = " ".join(query_parts)
        return f"{base_url}?q={quote(search_query)}"

    def _generate_google_flights_url(self, origin: str, destination: str, dates: str = None) -> str:
        """Generate a Google Flights search URL"""
        base_url = "https://www.google.com/travel/flights"
        query_parts = []
        if origin:
            query_parts.append(f"from {origin}")
        if destination:
            query_parts.append(f"to {destination}")
        if dates:
            query_parts.append(dates)
        search_query = " ".join(query_parts)
        return f"{base_url}?q={quote(search_query)}"

    async def _post_process_results(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Post-process results from session state.
        Adds booking URLs, images, and cleans up data.
        """
        session = self.shared_session
        destination = context.get('destination', '')
        origin = context.get('origin', '')
        dates = context.get('dates', '')

        # Get raw results from session state
        # Note: ADK stores FlightList under "flights" key, which contains outbound_flights and return_flights
        flights_data = await session.get_state("flights", {})
        hotels = await session.get_state("hotels", [])
        visa = await session.get_state("visa", {})
        activities = await session.get_state("activities", [])
        itinerary = await session.get_state("itinerary", [])

        # Extract outbound and return flights from the flights data
        outbound_flights = []
        return_flights = []

        if hasattr(flights_data, 'outbound_flights'):
            # It's a FlightList Pydantic model
            outbound_flights = [f.model_dump() if hasattr(
                f, 'model_dump') else f for f in flights_data.outbound_flights]
            return_flights = [f.model_dump() if hasattr(
                f, 'model_dump') else f for f in flights_data.return_flights]
        elif isinstance(flights_data, dict):
            # It's a dict with nested flight lists
            outbound_flights = flights_data.get('outbound_flights', [])
            return_flights = flights_data.get('return_flights', [])

        if hasattr(hotels, 'hotels'):
            hotels = [h.model_dump() if hasattr(h, 'model_dump')
                      else h for h in hotels.hotels]
        elif isinstance(hotels, dict) and 'hotels' in hotels:
            hotels = hotels['hotels']

        if hasattr(activities, 'activities'):
            activities = [a.model_dump() if hasattr(
                a, 'model_dump') else a for a in activities.activities]
        elif isinstance(activities, dict) and 'activities' in activities:
            activities = activities['activities']

        if hasattr(visa, 'model_dump'):
            visa = visa.model_dump()

        if hasattr(itinerary, 'days'):
            itinerary = [d.model_dump() if hasattr(d, 'model_dump')
                         else d for d in itinerary.days]
        elif isinstance(itinerary, dict) and 'days' in itinerary:
            itinerary = itinerary['days']

        # Post-process outbound flights
        outbound_booking_url = self._generate_google_flights_url(
            origin, destination, dates)
        for flight in outbound_flights:
            if isinstance(flight, dict):
                flight['booking_url'] = outbound_booking_url

        # Post-process return flights
        return_booking_url = self._generate_google_flights_url(
            destination, origin, dates)
        for flight in return_flights:
            if isinstance(flight, dict):
                flight['booking_url'] = return_booking_url

        # Post-process hotels
        for hotel in hotels:
            if isinstance(hotel, dict):
                hotel_name = hotel.get('name', 'hotel')
                hotel['booking_url'] = self._generate_hotel_booking_url(
                    hotel_name, destination, dates)
                hotel['image_url'] = get_hotel_image(hotel_name, destination)
                hotel.pop('style', None)

        # Post-process activities
        for activity in activities:
            if isinstance(activity, dict):
                activity.pop('category', None)

        return {
            "outbound_flights": outbound_flights,
            "return_flights": return_flights,
            "hotels": hotels,
            "visa": visa if visa else {
                "country": destination,
                "required": False,
                "requirements": [],
                "processing_time": "N/A",
                "application_url": None,
                "application_steps": []
            },
            "activities": activities,
            "itinerary": itinerary
        }

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """
        Create the root orchestration agent using ADK's workflow agents.

        Structure:
        - SequentialAgent (root)
          - ParallelAgent (runs all searches concurrently)
            - FlightSearchAgent (output_key: flights)
            - HotelSearchAgent (output_key: hotels)
            - VisaInfoAgent (output_key: visa)
            - ActivitySearchAgent (output_key: activities)
        """
        # Create ADK agents from each sub-agent
        flight_adk = self.flight_agent.create_adk_agent(context)
        hotel_adk = self.hotel_agent.create_adk_agent(context)
        visa_adk = self.visa_agent.create_adk_agent(context)
        activity_adk = self.activity_agent.create_adk_agent(context)

        # ParallelAgent runs all data-gathering agents concurrently
        parallel_gatherer = ParallelAgent(
            name="DataGathererAgent",
            sub_agents=[flight_adk, hotel_adk, visa_adk, activity_adk]
        )

        # Itinerary agent runs AFTER data gathering is complete
        # We pass the collected info via context (will be synced via session state)
        itinerary_adk = self.itinerary_agent.create_adk_agent(context)

        # SequentialAgent ensures proper execution order:
        # 1. Gather all data in parallel
        # 2. Plan itinerary using that data
        root_agent = SequentialAgent(
            name="TravelPlannerAgent",
            sub_agents=[parallel_gatherer, itinerary_adk]
        )

        return root_agent

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        """
        Execute the complete trip planning flow using ADK's orchestration.

        1. Initialize shared session with context
        2. Create the ADK agent hierarchy (Sequential -> Parallel -> sub-agents)
        3. Run through ADK Runner (handles all orchestration internally)
        4. Post-process results (add URLs, images)
        5. Return the complete trip plan
        """
        print(f"[{self.name}] Starting trip planning for: {query}")

        # Clear image cache for new trip search
        clear_image_cache()

        # Reset and initialize shared session for this planning request
        SharedSession.reset()
        session = self.shared_session

        # Generate unique session ID for this planning request
        session_id = str(uuid.uuid4())

        # Add memory context to the planning context
        memory_context = self._get_memory_context()
        full_context = {**context, **memory_context}

        # Initialize session with the planning context
        await session.initialize_session(session_id, full_context, client_id=self.client_id)

        # Create the ADK agent hierarchy
        print(
            f"[{self.name}] Creating ADK orchestration (Sequential -> Parallel -> sub-agents)...")
        adk_agent = self.create_adk_agent(full_context)

        # Run through ADK Runner - this handles all orchestration internally
        print(f"[{self.name}] Running ADK orchestration...")
        await self.report_status(f"Searching for flights, hotels, and activities in {context.get('destination')}...", step="start")
        await self.run_adk_agent(adk_agent, query)

        # Post-process results from session state
        print(f"[{self.name}] Post-processing results...")
        await self.report_status("Finalizing your personalized trip plan...", step="post_process")
        results = await self._post_process_results(full_context)

        print(f"[{self.name}] Results - Outbound Flights: {len(results['outbound_flights'])}, Return Flights: {len(results['return_flights'])}, Hotels: {len(results['hotels'])}, Activities: {len(results['activities'])}")

        # Add destination images
        results["destination_images"] = get_destination_images(
            context.get('destination', 'travel'), count=3
        )

        return results
