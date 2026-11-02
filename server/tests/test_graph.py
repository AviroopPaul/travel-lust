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


def itinerary(id, price, duration=600, stops=0, day=OUT):
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
                "depart_at": f"{day}T09:00",
                "arrive_at": f"{day}T19:00",
                "duration_min": duration,
            }
        ],
        "layovers": [],
        "stops": stops,
        "duration_min": duration,
        "depart_at": f"{day}T09:00",
        "arrive_at": f"{day}T19:00",
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
            itineraries=[itinerary(f"{prefix}1", 1000, day=BACK if selected_outbound else OUT), itinerary(f"{prefix}2", 1500, duration=300, day=BACK if selected_outbound else OUT)],
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


GUIDE = [
    {
        "id": f"wv{i}",
        "name": f"Sight {i}",
        "category": "eat" if i % 5 == 0 else "see",
        "area": "East",
        "lat": 35 + i * 0.002,
        "lng": 135.7,
        "summary": "Nice.",
        "hours": None,
        "price": None,
        "address": None,
        "url": None,
        "image": None,
        "wikidata": None,
        "fame": i,
        "tier": None,
        "tags": [],
        "source": "wikivoyage",
    }
    for i in range(30)
]


async def _plan_harness(monkeypatch, harness, compose_fails=False):
    plans, calls, start, send = harness
    calls.update(guide=0, web=0, compose=0)

    async def fake_guide(city):
        calls["guide"] += 1
        return [dict(p) for p in GUIDE]

    async def fake_web(city, prefs, count=18):
        calls["web"] += 1
        return [], ["kyoto.travel"]

    async def fake_centre(city, places):
        return (35.0, 135.7)

    async def fake_compose(city, prefs, days, pool):
        calls["compose"] += 1
        if compose_fails:
            raise llm.QuotaExhausted("no quota")
        return llm.ComposedPlan(days=[llm.ComposedDay(day=2, title="East side", stops=[llm.ComposedStop(place_id="wv7", note="Quiet")])])

    monkeypatch.setattr(agent.wikivoyage, "fetch", fake_guide)
    monkeypatch.setattr(agent.web, "search", fake_web)
    monkeypatch.setattr(agent.web, "centre_of", fake_centre)
    monkeypatch.setattr(llm, "compose_plan", fake_compose)
    return plans, calls, start, send


async def _answer_questions(send):
    question = await send(type="patch", patch={"plan_trip": True})
    assert question["kind"] == "question" and question["field"] == "style"
    assert question["setup_days"], "the right panel shows the days while questions are asked"
    question = await send(type="patch", patch=question["options"][0]["patch"])
    assert question["field"] == "spots"
    question = await send(type="patch", patch=question["options"][2]["patch"])
    assert question["field"] == "interests" and question["multi"]
    return await send(type="patch", patch={"prefs": {"interests": ["food", "nature"]}})


async def test_plan_after_flights_with_swaps_and_no_extra_searches(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)
    plans.append(llm.TurnPlan(origin_place="Kolkata", destination_place="Tokyo", outbound_date=OUT, return_date=BACK))
    await start("Kolkata to Tokyo")
    await send(type="select", itinerary_id="NH1")
    booking = await send(type="select", itinerary_id="RT1")
    assert booking["kind"] == "booking" and not booking["has_plan"]
    llm_before = calls["llm"]

    plan = await _answer_questions(send)
    assert plan["kind"] == "itinerary"
    assert calls["llm"] == llm_before, "tapping through the questions must not spend Gemini requests"
    assert calls["guide"] == 1 and calls["web"] == 1 and calls["compose"] == 1
    assert plan["booking"]["outbound"]["id"] == "NH1"
    assert plan["sources"] == ["Wikivoyage"]
    assert any(day["title"] == "East side" for day in plan["days"])
    assert all(s["time"] for day in plan["days"] for s in day["stops"])

    day = next(d for d in plan["days"] if d["stops"])
    target = day["stops"][0]
    spare = plan["spare"][0]
    swapped = await send(type="edit", op={"action": "swap", "place_id": target["id"], "new_place_id": spare["id"]})
    assert swapped["quiet"]
    assert swapped["days"][day["index"] - 1]["stops"][0]["id"] == spare["id"]
    assert all(p["id"] != spare["id"] for p in swapped["spare"])
    assert calls["compose"] == 1 and calls["guide"] == 1, "a swap must not search or call Gemini"

    back = await send(type="patch", patch={"show_booking": True})
    assert back["kind"] == "booking" and back["has_plan"]
    again = await send(type="patch", patch={"plan_trip": True})
    assert again["days"][day["index"] - 1]["stops"][0]["id"] == spare["id"], "edits survive a trip to the flights tab"
    assert calls["compose"] == 1

    redone = await send(type="patch", patch={"prefs": {"style": "physical"}})
    assert calls["compose"] == 2 and calls["guide"] == 1, "a new pace rearranges the days without searching again"
    assert redone["prefs"]["style"] == "physical"


async def test_plan_without_flights_and_without_gemini(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness, compose_fails=True)
    plans.append(llm.TurnPlan(destination_place="Tokyo", want_itinerary=True, trip_days=4, outbound_date=OUT))
    question = await start("plan 4 days in Tokyo")
    assert question["field"] == "style", "no origin is needed for a plan without flights"
    question = await send(type="patch", patch=question["options"][1]["patch"])
    question = await send(type="patch", patch=question["options"][1]["patch"])
    plan = await send(type="patch", patch={"prefs": {"interests": []}})
    assert plan["kind"] == "itinerary" and plan["booking"] is None
    assert len(plan["days"]) == 4
    assert sum(len(d["stops"]) for d in plan["days"]) >= 12
    assert "grouped the days by distance" in plan["summary"]


async def test_typed_edit_uses_ops_and_can_fall_through_to_flights(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)
    plans.append(llm.TurnPlan(destination_place="Tokyo", want_itinerary=True, trip_days=3, outbound_date=OUT, trip_style="leisure", trip_spots="top", trip_interests=["food"]))
    plan = await start("3 relaxed days in Tokyo, top spots, love food")
    assert plan["kind"] == "itinerary"

    edits = []

    async def fake_edit(text, city, today, current, spare):
        return edits.pop(0)

    monkeypatch.setattr(llm, "plan_edit", fake_edit)
    day = next(d for d in plan["days"] if d["stops"])
    victim = day["stops"][0]["id"]
    edits.append(llm.PlanEdit(ops=[llm.EditOp(action="remove", place_id=victim)]))
    updated = await send(type="text", text="drop that one")
    assert victim not in [s["id"] for s in updated["days"][day["index"] - 1]["stops"]]
    assert updated["summary"].startswith("Done")

    edits.append(llm.PlanEdit(about_flights=True))
    plans.append(llm.TurnPlan(go_back_to="outbound"))
    flights = await send(type="text", text="actually show me flights")
    assert flights["kind"] in ("question", "flights")


async def test_a_place_without_an_airport_keeps_its_name_and_gets_the_nearest_ones(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)
    plans.append(llm.TurnPlan(destination_place="Kyoto", destination_codes=["UKY"], outbound_date=OUT, trip_days=5, trip_style="leisure", trip_spots="hidden"))
    question = await start("Plan 5 relaxed days in Kyoto, away from the crowds")
    assert question["brief"]["destination_label"] == "Kyoto"
    assert question["brief"]["destination"], "the nearest airports are filled in for flights later"
    assert question["field"] == "interests", "pace and places came from the message, so only this is left"
    assert len(question["setup_days"]) == 5


async def test_a_lost_geocoder_still_allows_a_plan_but_flights_ask_for_an_airport(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)

    async def no_position(city, places):
        return None

    monkeypatch.setattr(agent.web, "centre_of", no_position)
    plans.append(llm.TurnPlan(destination_place="Kyoto", outbound_date=OUT, trip_days=3, want_itinerary=True))
    question = await start("Plan 3 days in Kyoto")
    assert question["field"] == "style" and question["brief"]["destination_label"] == "Kyoto"

    other = await send(type="patch", patch={"show_booking": True})
    assert other["field"] == "destination" and "could not find an airport near Kyoto" in other["question"]



async def test_plan_first_then_flights_keeps_the_plan_and_refits_it(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)
    plans.append(llm.TurnPlan(destination_place="Tokyo", want_itinerary=True, outbound_date=OUT, return_date=BACK, trip_style="balanced", trip_spots="mixed", trip_interests=["food"]))
    plan = await start("Plan my days in Tokyo")
    assert plan["kind"] == "itinerary" and plan["booking"] is None
    assert plan["offer"]["question"].startswith("Do you want flights")
    assert calls["searches"] == 0, "the plan comes first, so no fares yet"

    question = await send(type="patch", patch=plan["offer"]["options"][0]["patch"])
    assert question["kind"] == "question" and question["field"] == "origin"
    flights = await send(type="patch", patch=question["options"][0]["patch"])
    assert flights["kind"] == "flights" and flights["leg"] == "outbound"

    composed = calls["compose"]
    await send(type="select", itinerary_id="NH1")
    booking = await send(type="select", itinerary_id="RT1")
    assert booking["kind"] == "booking" and booking["has_plan"]
    assert "They are in your plan now." in booking["summary"]
    assert calls["compose"] == composed + 1, "landing at 7 pm closes day 1, so the days are rearranged"
    assert "rearranged" in booking["summary"]

    edited = await send(type="edit", op={"action": "remove", "place_id": "nothing"})
    assert edited["kind"] == "booking" and edited["quiet"], "an edit on the plan does not disturb the chat"


async def test_declining_flights_stops_asking(monkeypatch, harness):
    plans, calls, start, send = await _plan_harness(monkeypatch, harness)
    plans.append(llm.TurnPlan(destination_place="Tokyo", want_itinerary=True, outbound_date=OUT, return_date=BACK, trip_style="balanced", trip_spots="mixed", trip_interests=[]))
    plan = await start("Plan my days in Tokyo")
    declined = await send(type="patch", patch=plan["offer"]["options"][1]["patch"])
    assert declined["offer"] is None
    assert "add flights any time" in declined["summary"]
