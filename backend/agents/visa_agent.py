from typing import Dict, Any, List, Optional
from .base_agent import Agent
from datetime import datetime
import google.adk
from pydantic import BaseModel
from .tools.search_tool import web_search


class VisaInfo(BaseModel):
    country: str
    required: bool
    requirements: List[str]
    processing_time: str
    application_url: Optional[str] = None
    application_steps: List[str] = []


class VisaAgent(Agent):
    """Agent responsible for checking visa requirements."""

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for visa information lookup."""
        origin = context.get('origin', 'Unknown')
        destination = context.get('destination', 'Unknown')
        current_date = datetime.now().strftime("%B %d, %Y")

        return google.adk.Agent(
            name="VisaInfoAgent",
            model=self.model,
            instruction=f"""You are a visa expert. Today's date is {current_date}.

TASK: Provide accurate visa requirements for traveling from {origin} to {destination}.

TOOL USAGE:
- Make exactly 1 search call with query: "{origin} citizens visa requirements {destination} {current_date[:4]}"
- DO NOT search more than once.

AFTER SEARCHING, you MUST respond with ONLY a JSON object (no explanation, no markdown):
{{
  "country": "{destination}",
  "required": true or false,
  "requirements": ["requirement 1", "requirement 2", ...],
  "processing_time": "X business days",
  "application_url": "https://official-visa-site.com",
  "application_steps": ["Step 1", "Step 2", ...]
}}

IMPORTANT:
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanations
- Use real data from search results
- If origin is unknown, assume tourist visa requirements""",
            tools=[web_search],
            output_schema=VisaInfo,
            output_key="visa"
        )

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        print(f"[{self.name}] Checking visa info for: {query}")

        destination = context.get('destination', 'Unknown')

        adk_agent = self.create_adk_agent(context)

        try:
            result = await self.run_adk_agent(adk_agent, query)

            if isinstance(result, VisaInfo):
                visa_data = result.model_dump()
            elif isinstance(result, dict):
                visa_data = result
            else:
                visa_data = {
                    "country": destination,
                    "required": False,
                    "requirements": [],
                    "processing_time": "Unknown",
                    "application_url": None,
                    "application_steps": []
                }

            # Update shared session state
            await self.shared_session.update_state("visa", visa_data)

            return {"visa": visa_data}
        except Exception as e:
            print(f"[{self.name}] Error during ADK execution: {e}")
            return {
                "visa": {
                    "country": destination,
                    "required": False,
                    "requirements": [],
                    "processing_time": "Unknown",
                    "application_url": None,
                    "application_steps": []
                }
            }
