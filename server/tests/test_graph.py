"""Runs the real graph with Gemini and fares stubbed, through interrupts and resumes."""

from datetime import date, timedelta

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from app import graph as agent
from app import llm
from app.flights.google import SearchPart

OUT = (date.today() + timedelta(days=40)).isoformat()
BACK = (date.today() + timedelta(days=50)).isoformat()


def itinerary(id, price, duration=600, stops=0):
    return {
        "id": id,
        "price": price,
        "currency": "INR",
        "airlines": ["ANA"],
        "airline_codes": ["NH"],
        "segments": [
            {
                "airline": "ANA",
                "airline_code": "NH",
                "flight_number": id[2:],
                "from_code": "CCU",
                "from_name": "Kolkata",
                "to_code": "NRT",
                "to_name": "Narita",
                "depart_at": f"{OUT}T09:00",
                "arrive_at": f"{OUT}T19:00",
                "duration_min": duration,
            }
        ],
        "layovers": [],
        "stops": stops,
        "duration_min": duration,
        "depart_at": f"{OUT}T09:00",
        "arrive_at": f"{OUT}T19:00",
        "depart_hour": 9,
        "arrive_hour": 19,
        "arrive_day_offset": 0,
        "red_eye": False,
        "overnight_layover": False,
        "longest_layover_min": 0,
        "co2_kg": 400,
        "typical_co2_kg": 450,
        "tags": [],
        "note": None,
    }


@pytest.fixture
def harness(monkeypatch):
    calls = {"llm": 0, "searches": 0}
    plans = []

    async def fake_plan(*args, **kwargs):
        calls["llm"] += 1
        return plans.pop(0)

    async def fake_fetch(brief, date_, selected_outbound=None, filters=None, hours=None):
        calls["searches"] += 1
        prefix = "RT" if selected_outbound else "NH"
        return SearchPart(
            date=date_,
            itineraries=[itinerary(f"{prefix}1", 1000), itinerary(f"{prefix}2", 1500, duration=300)],
            insights={"lowest": 1000, "typical_low": 900, "typical_high": 1200, "level": "typical", "history": []},
        )

    monkeypatch.setattr(llm, "plan_turn", fake_plan)
    monkeypatch.setattr(agent.google, "fetch_part", fake_fetch)
    monkeypatch.setattr(agent.serpapi, "api_key", lambda: None)
    app = agent.build_graph(MemorySaver())
    config = {"configurable": {"thread_id": "t"}}

    async def card():
        state = await app.aget_state(config)
        return state.tasks[0].interrupts[0].value

    async def start(text):
        seed = {"input": {"type": "text", "text": text}, "brief": {"currency": "INR"}, "stage": "gather"}
        await app.ainvoke(seed, config)
        return await card()

    async def send(**value):
        await app.ainvoke(Command(resume=value), config)
        return await card()

    return plans, calls, start, send


async def test_full_round_trip_with_human_choices(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(destination_place="Tokyo"))

    question = await start("I want to go to Tokyo")
    assert question["kind"] == "question" and question["field"] == "origin"
    assert question["brief"]["destination"] == ["HND", "NRT"]

    question = await send(type="patch", label="Kolkata", patch=question["options"][0]["patch"])
    assert question["field"] == "outbound_date"
    question = await send(type="patch", patch={"brief": {"outbound_date": OUT}})
    assert question["field"] == "return_date"
    assert calls["llm"] == 1, "tapping options must not spend Gemini requests"

    flights = await send(type="patch", patch={"brief": {"return_date": BACK, "one_way": False}})
    assert flights["kind"] == "flights" and flights["leg"] == "outbound"
    assert calls["searches"] == 6  # five for the fare list, one for the price history
    assert {i["id"] for i in flights["itineraries"]} == {"NH1", "NH2"}

    back = await send(type="select", itinerary_id="NH2")
    assert back["kind"] == "flights" and back["leg"] == "return"
    assert back["selected_outbound"]["id"] == "NH2"

    final = await send(type="select", itinerary_id="RT1")
    assert final["kind"] == "booking"
    assert final["total"] == 1000 and final["offers"] == []
    assert final["google_link"].startswith("https://www.google.com/travel/flights/booking?tfs=")


async def test_filter_only_message_does_not_search_again(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, one_way=True))
    flights = await start("Kolkata to Tokyo one way")
    assert flights["kind"] == "flights"
    searched = calls["searches"]

    plans.append(llm.TurnPlan(max_price=1200))
    flights = await send(type="text", text="under 1200")
    assert flights["filters"]["max_price"] == 1200
    assert calls["searches"] == searched


async def test_changing_dates_drops_the_chosen_flight(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, return_date=BACK))
    await start("Kolkata to Tokyo")
    back = await send(type="select", itinerary_id="NH1")
    assert back["leg"] == "return"

    later = (date.today() + timedelta(days=45)).isoformat()
    flights = await send(type="patch", patch={"brief": {"outbound_date": later}})
    assert flights["leg"] == "outbound" and flights["selected_outbound"] is None
    # The trip keeps its length when the departure moves.
    assert flights["brief"]["return_date"] == (date.today() + timedelta(days=55)).isoformat()


async def test_typed_pick_uses_the_number_on_screen(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, one_way=True))
    flights = await start("one way")
    second = flights["itineraries"][1]["id"]
    plans.append(llm.TurnPlan(select_number=2))
    final = await send(type="text", text="the second one")
    assert final["kind"] == "booking" and final["outbound"]["id"] == second


async def test_quota_exhaustion_keeps_the_conversation_alive(harness, monkeypatch):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, one_way=True))
    await start("one way")

    async def out_of_quota(*args, **kwargs):
        raise llm.QuotaExhausted("429")

    monkeypatch.setattr(llm, "plan_turn", out_of_quota)
    flights = await send(type="text", text="nonstop only")
    assert flights["kind"] == "flights"
    assert "free Gemini account" in flights["reply"]


async def test_past_dates_are_refused(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date="2020-01-01"))
    question = await start("Kolkata to Tokyo on Jan 1 2020")
    assert question["field"] == "outbound_date"
    assert "passed" in question["reply"]


async def test_typed_message_keeps_filters_set_in_the_filter_bar(harness):
    plans, calls, start, send = harness
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, one_way=True))
    await start("one way")
    plans.append(llm.TurnPlan(no_red_eye=True))
    flights = await send(type="text", text="no red-eyes", filters={"max_stops": 1})
    assert flights["filters"]["max_stops"] == 1
    assert flights["filters"]["no_red_eye"] is True


def test_money_matches_the_ui():
    assert agent._money(126038, "INR") == "₹1,26,038"
    assert agent._money(12345678, "INR") == "₹1,23,45,678"
    assert agent._money(58242, "INR") == "₹58,242"
    assert agent._money(1234, "USD") == "$1,234"
