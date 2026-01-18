from typing import Dict, Any, List
from .base_agent import Agent
from datetime import datetime
import google.adk
from pydantic import BaseModel, ConfigDict
from .tools.search_tool import web_search


class Activity(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str
    description: str
    price: str
    duration: str
    category: str


class ActivityList(BaseModel):
    model_config = ConfigDict(extra='forbid')
    activities: List[Activity]


class ActivityAgent(Agent):
    """Agent responsible for finding activities and things to do."""

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for activity search."""
        destination = context.get('destination', '')
        current_date = datetime.now().strftime("%B %d, %Y")
        currency = context.get('currency', 'USD')
        strict_budget = context.get('strict_budget', False)

        return google.adk.Agent(
            name="ActivitySearchAgent",
            model=self.model,
            instruction=f"""You are a travel guide. Today's date is {current_date}.

TASK: Find 5 activities/things to do in {destination}.

TOOL USAGE:
- Make exactly 1 search call with query: "top things to do {destination} {current_date[:4]}"
- DO NOT search more than once.

AFTER SEARCHING, you MUST respond with ONLY a JSON object (no explanation, no markdown):
{{
  "activities": [
    {{
      "name": "Activity Name",
      "description": "Brief description",
      "price": "{currency} XXX or Free",
      "duration": "X hours",
      "category": "sightseeing/food/culture/adventure/relaxation"
    }},
    ... (exactly 5 activities)
  ]
}}

IMPORTANT:
- Output ONLY valid JSON, nothing else
- No markdown code blocks, no explanations
- Include exactly 5 diverse activities
- Use real attractions from search results
{"- Focus on free or low-cost activities" if strict_budget else "- Mix of free and paid experiences"}""",
            tools=[web_search],
            output_schema=ActivityList,
            output_key="activities"
        )

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        print(f"[{self.name}] Finding activities for: {query}")

        destination = context.get('destination', '')

        adk_agent = self.create_adk_agent(context)

        try:
            result = await self.run_adk_agent(adk_agent, query)

            if isinstance(result, ActivityList):
                activities_data = [a.model_dump() for a in result.activities]
            elif isinstance(result, dict):
                activities_data = result.get('activities', [])
            else:
                activities_data = []

            # Clean up activities data
            for activity in activities_data:
                # Remove category from output as it's not in the model
                activity.pop('category', None)

            # Update shared session state
            await self.shared_session.update_state("activities", activities_data)

            return {"activities": activities_data}
        except Exception as e:
            print(f"[{self.name}] Error during ADK execution: {e}")
            return {"activities": []}
