from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import google.adk
from google.adk.sessions import InMemorySessionService
from google.adk.models.lite_llm import LiteLlm
from google.genai import types
from ..status_manager import status_manager


class ReportingSessionService(InMemorySessionService):
    """
    Wrapper for InMemorySessionService that reports state changes.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.client_id: Optional[str] = None

    def set_client_id(self, client_id: str):
        self.client_id = client_id

    async def append_event(self, session: Any, event: Any):
        await super().append_event(session, event)
        
        # Check if the event has a state delta
        if hasattr(event, 'actions') and event.actions and event.actions.state_delta:
            delta = event.actions.state_delta
            if self.client_id:
                status_map = {
                    "flights": "Found flight options",
                    "hotels": "Found accommodation options",
                    "visa": "Retrieved visa requirements",
                    "activities": "Discovered things to do",
                    "itinerary": "Completed your personalized itinerary"
                }
                for key in delta:
                    if key in status_map:
                        await status_manager.send_status(self.client_id, status_map[key], step=key)

class SharedSession:
    """
    Singleton-like class to manage shared session state across all agents.
    All agents share the same session service and session ID within a planning request.
    """
    _instance: Optional['SharedSession'] = None

    def __init__(self):
        self.session_service = ReportingSessionService()
        self.current_session_id: Optional[str] = None
        self.current_user_id: str = "default_user"
        self.app_name: str = "TravelAssistant"
        self.state: Dict[str, Any] = {}
        self.client_id: Optional[str] = None

    @classmethod
    def get_instance(cls) -> 'SharedSession':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls):
        """Reset the shared session for a new planning request"""
        cls._instance = cls()

    async def initialize_session(self, session_id: str, initial_state: Dict[str, Any] = None, client_id: str = None):
        """Initialize a new session with optional initial state"""
        self.current_session_id = session_id
        self.state = initial_state or {}
        self.client_id = client_id
        self.session_service.set_client_id(client_id)

        # Create session in the service
        await self.session_service.create_session(
            app_name=self.app_name,
            user_id=self.current_user_id,
            session_id=session_id,
            state=self.state
        )
        print(f"[SharedSession] Initialized session: {session_id}")

    async def update_state(self, key: str, value: Any):
        """Update shared state in both local dict and ADK session service"""
        self.state[key] = value
        
        if self.current_session_id:
            try:
                session = await self.session_service.get_session(
                    app_name=self.app_name,
                    user_id=self.current_user_id,
                    session_id=self.current_session_id
                )
                if session:
                    # Create an event with the state delta to update ADK's internal state
                    from google.adk.events.event import Event
                    from google.adk.events.event_actions import EventActions
                    
                    event = Event(
                        invocation_id="state_update",
                        author="system",
                        actions=EventActions(state_delta={key: value})
                    )
                    await self.session_service.append_event(session, event)
            except Exception as e:
                print(f"[SharedSession] Error updating ADK session state: {e}")
        
        print(f"[SharedSession] Updated state key: {key}")
        
        # Auto-report status based on the key
        if self.client_id:
            status_map = {
                "flights": "Found flight options",
                "hotels": "Found accommodation options",
                "visa": "Retrieved visa requirements",
                "activities": "Discovered things to do",
                "itinerary": "Completed your personalized itinerary"
            }
            if key in status_map:
                await status_manager.send_status(self.client_id, status_map[key], step=key)

    async def get_state(self, key: str, default: Any = None) -> Any:
        """Get value from shared state, syncing with ADK session service if possible"""
        if self.current_session_id:
            try:
                session = await self.session_service.get_session(
                    app_name=self.app_name,
                    user_id=self.current_user_id,
                    session_id=self.current_session_id
                )
                if session and key in session.state:
                    # Sync local state with ADK state
                    self.state[key] = session.state[key]
            except Exception as e:
                print(f"[SharedSession] Error fetching from ADK session service: {e}")
                
        return self.state.get(key, default)


class Agent(ABC):
    """Base class for all agents - uses shared session for ADK orchestration"""

    def __init__(self, name: str, model_client: Any = None, model_id: str = "openai/gpt-4o-mini"):
        self.name = name
        self.client = model_client
        self.model_id = model_id
        self.model = LiteLlm(model=self.model_id)
        self.client_id: Optional[str] = None

    def set_client_id(self, client_id: str):
        """Set the client ID for WebSocket status updates"""
        self.client_id = client_id

    async def report_status(self, status: str, step: str = None, data: dict = None):
        """Send a status update via WebSocket"""
        if self.client_id:
            print(f"[{self.name}] Reporting status: {status}")
            await status_manager.send_status(self.client_id, status, step or self.name, data)

    @property
    def shared_session(self) -> SharedSession:
        """Access the shared session singleton"""
        return SharedSession.get_instance()

    @abstractmethod
    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """
        Create and return the ADK agent for this task.
        Subclasses must implement this to define their specific agent.
        """
        pass

    async def run_adk_agent(self, agent: google.adk.Agent, prompt: str) -> Dict[str, Any]:
        """
        Run an ADK agent using the shared session.
        The ADK Runner handles all orchestration including sub-agents.
        """
        session = self.shared_session

        runner = google.adk.Runner(
            agent=agent,
            app_name=session.app_name,
            session_service=session.session_service
        )

        new_message = types.Content(
            parts=[types.Part(text=prompt)],
            role="user"
        )

        final_text = ""
        event_count = 0

        async for event in runner.run_async(
            user_id=session.current_user_id,
            session_id=session.current_session_id,
            new_message=new_message
        ):
            event_count += 1

            # Extract text from event content
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if hasattr(part, 'text') and part.text:
                        final_text += part.text

        print(
            f"[{self.name}] Processed {event_count} events, collected {len(final_text)} chars")

        if not final_text.strip():
            print(f"[{self.name}] Warning: No text response from agent {agent.name}")
            return {}

        # If the agent has an output schema, attempt to parse the result
        if hasattr(agent, 'output_schema') and agent.output_schema:
            try:
                # Clean up markdown if present
                cleaned_text = final_text.strip()

                # Remove markdown code blocks if present
                if "```json" in cleaned_text:
                    start = cleaned_text.find("```json") + 7
                    end = cleaned_text.rfind("```")
                    if end > start:
                        cleaned_text = cleaned_text[start:end].strip()
                elif cleaned_text.startswith("```"):
                    lines = cleaned_text.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    cleaned_text = "\n".join(lines).strip()

                result = agent.output_schema.model_validate_json(cleaned_text)
                print(f"[{self.name}] Successfully parsed structured output")
                return result
            except Exception as e:
                print(
                    f"[{self.name}] Error parsing structured response for {agent.name}: {e}")
                print(
                    f"[{self.name}] Raw text (first 500 chars): {final_text[:500]}")
                return {}

        return final_text

    @abstractmethod
    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        """
        Executes the agent's specific task based on the input query.
        Results should be written to shared session state.
        """
        pass
