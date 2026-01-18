from typing import Dict, Any, List
from .base_agent import Agent
import json
import google.adk
from pydantic import BaseModel, ConfigDict


class Memory(BaseModel):
    model_config = ConfigDict(extra='forbid')
    memory_type: str
    content: str
    confidence: float


class MemoryList(BaseModel):
    model_config = ConfigDict(extra='forbid')
    memories: List[Memory]


class MemoryAgent(Agent):
    """Agent that extracts user preferences and memories from conversations."""

    def create_adk_agent(self, context: Dict[str, Any]) -> google.adk.Agent:
        """Create the ADK agent for memory extraction."""
        user_query = context.get('user_query', '')
        trip_result = context.get('trip_result', {})

        return google.adk.Agent(
            name="MemoryExtractorAgent",
            model=self.model,
            instruction=f"""
Analyze this travel planning interaction and extract user preferences and facts that should be remembered for future interactions.

User Query: {user_query}
Context: {json.dumps(context, indent=2, default=str)}

Extract memories in these categories:
- travel_style: How the user likes to travel (luxury, budget, adventure, etc.)
- destination_preference: Types of destinations they prefer
- home_location: Where they're traveling from (if mentioned)
- dietary_preference: Any food preferences or restrictions
- accommodation_preference: Hotel style preferences
- activity_preference: Types of activities they enjoy
- budget_range: Their typical budget level
- travel_companions: Who they typically travel with
- accessibility_needs: Any special requirements

Only extract memories that are clearly stated or strongly implied.
Do not make assumptions.
""",
            output_schema=MemoryList,
            output_key="memories"  # Write results to shared session state
        )

    async def extract_memories(self, user_query: str, trip_result: Dict[str, Any], context: Dict[str, Any] = {}) -> List[Dict[str, Any]]:
        """Extract meaningful memories from a trip planning interaction"""
        print(f"[{self.name}] Extracting memories from interaction...")

        # Add context for the agent
        full_context = {**context, 'user_query': user_query,
                        'trip_result': trip_result}
        adk_agent = self.create_adk_agent(full_context)

        try:
            result = await self.run_adk_agent(adk_agent, user_query)

            if isinstance(result, MemoryList):
                memories = [m.model_dump() for m in result.memories]
            elif isinstance(result, dict):
                memories = result.get('memories', [])
            else:
                memories = []

            # Update shared session state
            await self.shared_session.update_state("memories", memories)

            print(f"[{self.name}] Extracted {len(memories)} memories")
            return memories
        except Exception as e:
            print(f"[{self.name}] Error extracting memories: {e}")
            return []

    async def personalize_prompt(self, base_prompt: str, memories: List[Dict[str, Any]]) -> str:
        """Add personalization context to a prompt based on memories"""
        if not memories:
            return base_prompt

        memory_context = "\n\nUser Preferences (from previous interactions):\n"
        for mem in memories:
            memory_context += f"- {mem['memory_type']}: {mem['content']}\n"

        memory_context += "\nPlease consider these preferences when making recommendations.\n"

        return base_prompt + memory_context

    async def perform_task(self, query: str, context: Dict[str, Any] = {}) -> Dict[str, Any]:
        """Default task - extract memories"""
        trip_result = context.get('trip_result', {})
        memories = await self.extract_memories(query, trip_result, context)
        return {"memories": memories}
