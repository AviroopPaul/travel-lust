from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
import os
import google.adk
from google.adk.sessions.sqlite_session_service import SqliteSessionService
from google.adk.models.lite_llm import LiteLlm
from google.genai import types
from ..status_manager import status_manager


class ReportingSessionService(SqliteSessionService):
    """
    Wrapper for SqliteSessionService that reports state changes via WebSocket.
    This is the only custom wrapper we need - for status reporting.
    """

    def __init__(self, db_path: str):
        super().__init__(db_path)
        self.client_id: Optional[str] = None

    def set_client_id(self, client_id: str):
        self.client_id = client_id

    async def append_event(self, session: Any, event: Any):
        await super().append_event(session, event)

        # Check if the event has a state delta (when agents write via output_key)
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


class Agent(ABC):
    """
    Base class for all agents - uses ADK session service directly.
    """

    # Shared session service instance (created once, reused)
    _session_service: Optional[ReportingSessionService] = None
    _app_name: str = "TravelAssistant"
    _user_id: str = "default_user"

    def __init__(self, name: str, model_client: Any = None, model_id: str = "openai/gpt-4o-mini"):
        self.name = name
        self.client = model_client
        self.model_id = model_id
        self.model = LiteLlm(model=self.model_id)
        self.client_id: Optional[str] = None

        # Initialize session service if not already done
        if Agent._session_service is None:
            # Use a separate DB file for ADK sessions (different from chat sessions)
            db_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                'adk_sessions.db'
            )
            Agent._session_service = ReportingSessionService(db_path)

    def set_client_id(self, client_id: str):
        """Set the client ID for WebSocket status updates"""
        self.client_id = client_id
        if Agent._session_service:
            Agent._session_service.set_client_id(client_id)

    async def report_status(self, status: str, step: str = None, data: dict = None):
        """Send a status update via WebSocket"""
        if self.client_id:
            print(f"[{self.name}] Reporting status: {status}")
            await status_manager.send_status(self.client_id, status, step or self.name, data)

    @property
    def session_service(self) -> ReportingSessionService:
        """Get the shared session service"""
        return Agent._session_service

    @abstractmethod
    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """
        Create and return the ADK agent for this task.
        Subclasses must implement this to define their specific agent.
        """
        pass

    async def run_adk_agent(
        self,
        agent: google.adk.Agent,
        prompt: str,
        session_id: str,
        initial_state: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Run an ADK agent using the session service directly.
        The ADK Runner handles all orchestration including sub-agents.

        Args:
            agent: The ADK agent to run
            prompt: The user prompt
            session_id: Unique session ID for this request
            initial_state: Optional initial state to set in the session
        """
        runner = google.adk.Runner(
            agent=agent,
            app_name=Agent._app_name,
            session_service=self.session_service
        )

        # Create or get session
        try:
            session = await self.session_service.create_session(
                app_name=Agent._app_name,
                user_id=Agent._user_id,
                session_id=session_id,
                state=initial_state or {}
            )
        except Exception as e:
            # Session might already exist, try to get it
            session = await self.session_service.get_session(
                app_name=Agent._app_name,
                user_id=Agent._user_id,
                session_id=session_id
            )
            if not session:
                raise RuntimeError(f"Failed to create/get session: {e}")

        new_message = types.Content(
            parts=[types.Part(text=prompt)],
            role="user"
        )

        final_text = ""
        event_count = 0

        async for event in runner.run_async(
            user_id=Agent._user_id,
            session_id=session_id,
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

    async def get_session_state(self, session_id: str, key: str = None, default: Any = None) -> Any:
        """
        Get state from ADK session.
        If key is provided, returns that key's value. Otherwise returns entire state dict.
        """
        session = await self.session_service.get_session(
            app_name=Agent._app_name,
            user_id=Agent._user_id,
            session_id=session_id
        )

        if not session:
            return default

        if key:
            return session.state.get(key, default)
        return session.state

    @abstractmethod
    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        """
        Executes the agent's specific task based on the input query.
        Results are automatically stored in session.state via output_key.
        """
        pass
