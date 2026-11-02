"""The travel agent: flights first, then the days.

    input -> interpret (only for typed text) -> plan -> ask | search fan-out | present | offers
                                                ^   \\-> ask_trip | place fan-out -> compose -> present_plan
                                                |                                        |
                                                +------------- wait (interrupt) <--------+

Gemini only turns typed text into structured changes and suggests which places go on which day.
Search, filtering, ranking, booking links, day times and travel estimates are plain code, so no
flight fact or schedule can come from the model.
"""

import asyncio
import hashlib
import json
import operator
from datetime import date, timedelta
from typing import Annotated, Any, Optional, TypedDict

from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt

from . import airports, llm, trip
from .flights import google, rank, serpapi
from .models import Brief, Filters, TripPrefs
from .places import web, wikivoyage
from .questions import INTEREST_LABELS, SPOT_LABELS, STYLE_LABELS, next_question, next_trip_question

TIME_WINDOWS = [(0, 5), (6, 11), (12, 17), (18, 23)]
RESET = "__reset__"


def _parts_reducer(current: list, update: Any) -> list:
    if update == RESET:
        return []
    return (current or []) + update


class AgentState(TypedDict, total=False):
    input: dict
    brief: dict
    filters: dict
    stage: str  # gather, outbound, return, booking
    planning: bool  # True while the traveller is working on their days, not their flights
    prefs: dict
    place_tasks: list
    place_parts: Annotated[list, _parts_reducer]
    pool: list
    sources: list
    places_key: Optional[str]
    plan_key: Optional[str]
    trip_days: list
    plan_note: Optional[str]
    flights_declined: bool
    next: str
    reply: Optional[str]
    transcript: Annotated[list, operator.add]
    search_tasks: list
    search_parts: Annotated[list, _parts_reducer]
    search_keys: dict
    pushed_filters: dict
    results: dict
    insights: dict
    date_prices: dict
    search_error: Optional[str]
    selected_outbound: Optional[dict]
    selected_return: Optional[dict]
    offers: list
    offers_key: Optional[str]
    offers_error: Optional[str]
    card: dict


def _status(label: str) -> None:
    get_stream_writer()({"status": label})


def _today() -> date:
    return date.today()


def _brief(state: AgentState) -> Brief:
    return Brief(**(state.get("brief") or {}))


def _filters(state: AgentState) -> Filters:
    return Filters(**(state.get("filters") or {}))


def _prefs(state: AgentState) -> TripPrefs:
    return TripPrefs(**(state.get("prefs") or {}))


def _city(brief: Brief) -> str:
    return brief.destination_label or "your destination"


def _skeleton(state: AgentState, brief: Brief, prefs: TripPrefs) -> list[dict]:
    return trip.skeleton(brief, prefs, state.get("selected_outbound"), state.get("selected_return"))


def _clear_plan() -> dict:
    return {"planning": False, "flights_declined": False, "prefs": {}, **_no_plan()}


def _no_plan() -> dict:
    return {"pool": [], "sources": [], "places_key": None, "plan_key": None, "trip_days": [], "plan_note": None}


def _quiet(state: AgentState) -> bool:
    """A change made on the plan itself. It shows there, so the chat should not repeat it."""
    return (state.get("input") or {}).get("type") == "edit"


def _current_leg(state: AgentState) -> str:
    return "return" if state.get("stage") == "return" else "outbound"


def _clean_dates(brief: Brief, today: date) -> Optional[str]:
    """Drop impossible dates and say why, rather than searching for them."""
    problem = None
    if brief.outbound_date:
        try:
            if date.fromisoformat(brief.outbound_date) < today:
                brief.outbound_date, problem = None, "That departure date has passed. Pick a future date."
        except ValueError:
            brief.outbound_date = None
    if brief.return_date:
        try:
            if brief.outbound_date and date.fromisoformat(brief.return_date) < date.fromisoformat(brief.outbound_date):
                brief.return_date, problem = None, "The return date was before the departure, so I cleared it."
        except ValueError:
            brief.return_date = None
    return problem


def _reset_for_new_trip(old: Brief, new: Brief, update: dict) -> None:
    """Any change to what is searched invalidates flights picked from the old results."""
    keep_flex = old.model_copy(update={"flex_days": new.flex_days})
    if keep_flex != new:
        update.update(stage="outbound", selected_outbound=None, selected_return=None, offers=[], offers_key=None)
    if old.destination_label != new.destination_label:
        update.update(_no_plan())


def _shown_flights(state: AgentState) -> list[dict]:
    leg = _current_leg(state)
    return rank.visible((state.get("results") or {}).get(leg, []), _filters(state))


def _describe_flights(state: AgentState) -> str:
    if state.get("stage") not in ("outbound", "return"):
        return "None."
    lines = []
    for number, it in enumerate(_shown_flights(state)[:10], start=1):
        airline = "+".join(it["airlines"])
        lines.append(
            f"{number}. {airline}, {it['price']} {it['currency']}, leaves {it['depart_at']}, "
            f"arrives {it['arrive_at']}, {it['duration_min']} min, {it['stops']} stops, tags {it['tags']}"
        )
    return "\n".join(lines) or "None."


async def interpret(state: AgentState) -> dict:
    """Typed text only: ask Gemini what it changes."""
    _status("Reading your message")
    text = state["input"]["text"]
    brief = _brief(state)
    # The filter bar changes filters without a server call, so the UI sends them with each turn.
    filters = Filters(**state["input"]["filters"]) if state["input"].get("filters") else _filters(state)
    recent = [f"{m['role']}: {m['text']}" for m in state.get("transcript", []) if m.get("text")]
    update: dict = {"reply": None, "filters": filters.model_dump(), "transcript": [{"role": "user", "text": text}]}
    if state.get("trip_days"):
        edited = await _interpret_edit(state, text, update)
        if edited is not None:
            return edited
    try:
        plan = await llm.plan_turn(
            text,
            recent,
            _today().isoformat(),
            brief.model_dump_json(),
            filters.model_dump_json(exclude_defaults=True),
            _describe_flights(state),
        )
    except llm.QuotaExhausted:
        update["reply"] = (
            "This demo runs on a free Gemini account and it has hit its limit for now. "
            "The buttons and filters still work, so you can carry on with those."
        )
        return update

    if plan.start_over:
        return {
            **update,
            "brief": Brief(currency=brief.currency).model_dump(),
            "filters": Filters().model_dump(),
            "stage": "gather",
            "selected_outbound": None,
            "selected_return": None,
            "results": {},
            "search_keys": {},
            "offers": [],
            "offers_key": None,
            "reply": plan.reply,
            **_clear_plan(),
        }

    new = brief.model_copy(deep=True)
    if plan.origin_place or plan.origin_codes:
        new.origin, new.origin_label = await _resolve_place(plan.origin_place, plan.origin_codes)
    if plan.destination_place or plan.destination_codes:
        new.destination, new.destination_label = await _resolve_place(plan.destination_place, plan.destination_codes)
    for name in ("outbound_date", "return_date", "adults", "children", "infants", "cabin", "currency", "flex_days"):
        value = getattr(plan, name)
        if value is not None:
            setattr(new, name, value)
    if plan.one_way is not None:
        new.one_way = plan.one_way
        if plan.one_way:
            new.return_date = None
    if new.return_date:
        new.one_way = False
    new.flex_days = max(0, min(new.flex_days, 3))

    problem = _clean_dates(new, _today())
    if plan.trip_nights and new.outbound_date:
        new.return_date = (date.fromisoformat(new.outbound_date) + timedelta(days=plan.trip_nights)).isoformat()
        new.one_way = False
    update["reply"] = problem or (plan.reply if plan.is_question else None)
    update["brief"] = new.model_dump()
    _reset_for_new_trip(brief, new, update)

    merged = Filters() if plan.clear_filters else filters.model_copy()
    for name in Filters.model_fields:
        value = getattr(plan, name, None)
        if value is not None:
            setattr(merged, name, value)
    update["filters"] = merged.model_dump()

    prefs = _prefs(state)
    for field, value in (("style", plan.trip_style), ("spots", plan.trip_spots), ("interests", plan.trip_interests), ("notes", plan.trip_notes), ("days", plan.trip_days)):
        if value is not None:
            setattr(prefs, field, value)
    update["prefs"] = prefs.model_dump()
    # Asking how to spend the days means a plan, even if Gemini missed the explicit flag.
    if plan.want_itinerary or plan.trip_style or plan.trip_spots or plan.trip_interests:
        update["planning"] = True

    if plan.go_back_to:
        update.update(_back_to(plan.go_back_to))
    elif plan.select_number and state.get("stage") in ("outbound", "return"):
        shown = rank.visible((state.get("results") or {}).get(_current_leg(state), []), merged)
        if 1 <= plan.select_number <= len(shown):
            update.update(_select(state, shown[plan.select_number - 1]))
    return update


async def _resolve_place(place: Optional[str], codes: list[str]) -> tuple[list[str], Optional[str]]:
    """Airports for a place. One with none of its own, like Kyoto, gets the nearest ones."""
    found, label = airports.resolve(place, codes)
    if found or not label:
        return found, label
    position = await web.centre_of(label, [])
    return (airports.nearest(*position) if position else []), label


async def _interpret_edit(state: AgentState, text: str, update: dict) -> Optional[dict]:
    """A typed change to a finished plan. Returns None when it is about flights instead."""
    brief, prefs = _brief(state), _prefs(state)
    days, pool = state["trip_days"], list(state.get("pool") or [])
    try:
        edit = await llm.plan_edit(
            text,
            _city(brief),
            _today().isoformat(),
            trip.plan_for_prompt(days, pool),
            trip.pool_for_prompt(trip.spare_places(days, pool)[:50]),
        )
    except llm.QuotaExhausted:
        update["reply"] = (
            "This demo runs on a free Gemini account and it has hit its limit for now. "
            "You can still swap, move and remove stops with the buttons."
        )
        return update
    if edit.about_flights:
        return None

    for op in edit.ops:
        change = op.model_dump()
        if op.search and not op.new_place_id:
            found = await _find_new_place(op.search, brief, pool)
            if not found:
                update["reply"] = f"I could not find a place for \"{op.search}\". Try wording it another way."
                continue
            pool.append(found)
            change["new_place_id"] = found["id"]
        days = trip.apply_op(days, change, pool)

    new_prefs = prefs.model_copy()
    for field in ("style", "spots", "interests", "notes"):
        value = getattr(edit, field)
        if value is not None:
            setattr(new_prefs, field, value)
    update.update(trip_days=days, pool=pool, prefs=new_prefs.model_dump())
    if new_prefs != prefs:
        update["planning"] = True
    done = "Done. Your plan is updated on the right."
    if edit.is_question or edit.reply:
        update["reply"] = edit.reply
    elif edit.ops and not update.get("reply"):
        # While flights are open in the chat, the note has to go with that card instead.
        update["plan_note" if state.get("planning") else "reply"] = done
    return update


async def _find_new_place(query: str, brief: Brief, pool: list[dict]) -> Optional[dict]:
    """One extra place the traveller asked for, from a live web search."""
    _status(f"Searching Google for {query}")
    city = _city(brief)
    found, _ = await web.search(f"{city}, specifically {query}", {"spots": "mixed"}, count=3)
    located = await web.locate(found, city, await web.centre_of(city, pool))
    return located[0] if located else None


def _back_to(leg: str) -> dict:
    change = {"planning": False, "stage": leg, "selected_return": None, "offers": [], "offers_key": None}
    if leg == "outbound":
        change["selected_outbound"] = None
    return change


def _select(state: AgentState, itinerary: dict) -> dict:
    brief = _brief(state)
    if _current_leg(state) == "outbound":
        return {
            "selected_outbound": itinerary,
            "selected_return": None,
            "stage": "booking" if brief.one_way else "return",
            "filters": {**(state.get("filters") or {}), **_leg_reset()},
        }
    return {"selected_return": itinerary, "stage": "booking"}


def _leg_reset() -> dict:
    """Time and airline choices were about the outbound flight, so they do not carry over."""
    return {
        "depart_after_hour": None,
        "depart_before_hour": None,
        "arrive_after_hour": None,
        "arrive_before_hour": None,
        "max_price": None,
    }


def apply_input(state: AgentState) -> dict:
    """Taps and filter changes from the UI. No model call."""
    value = state["input"]
    update: dict = {"reply": None}
    if value.get("label"):
        update["transcript"] = [{"role": "user", "text": value["label"]}]
    if value.get("filters") is not None:
        update["filters"] = Filters(**value["filters"]).model_dump()

    if value.get("type") == "edit":
        update["trip_days"] = trip.apply_op(state.get("trip_days") or [], value.get("op") or {}, state.get("pool") or [])
        return update

    if value.get("type") == "select":
        leg = _current_leg(state)
        found = next(
            (i for i in (state.get("results") or {}).get(leg, []) if i["id"] == value.get("itinerary_id")),
            None,
        )
        if found:
            update.update(_select({**state, **update}, found))
        return update

    patch = value.get("patch") or {}
    if patch.get("brief"):
        old = _brief(state)
        new = old.model_copy(update=patch["brief"])
        # Moving the departure keeps the trip the same length.
        if patch["brief"].get("outbound_date") and "return_date" not in patch["brief"] and old.outbound_date and old.return_date:
            nights = (date.fromisoformat(old.return_date) - date.fromisoformat(old.outbound_date)).days
            new.return_date = (date.fromisoformat(new.outbound_date) + timedelta(days=nights)).isoformat()
        update["reply"] = _clean_dates(new, _today())
        update["brief"] = new.model_dump()
        _reset_for_new_trip(old, new, update)
    if patch.get("go_back_to"):
        update.update(_back_to(patch["go_back_to"]))
    if patch.get("start_over"):
        update.update(
            brief=Brief(currency=_brief(state).currency).model_dump(),
            filters=Filters().model_dump(),
            stage="gather",
            selected_outbound=None,
            selected_return=None,
            results={},
            search_keys={},
            offers=[],
            offers_key=None,
            **_clear_plan(),
        )
    if patch.get("plan_trip"):
        update["planning"] = True
    if patch.get("decline_flights"):
        update["flights_declined"] = True
        update["plan_note"] = "No problem. You can add flights any time from the plan."
    if patch.get("show_booking"):
        update["planning"] = False
    if patch.get("prefs"):
        update["prefs"] = {**(state.get("prefs") or {}), **patch["prefs"]}
    if patch.get("search_with_filters"):
        update["pushed_filters"] = {
            **(state.get("pushed_filters") or {}),
            _current_leg(state): (update.get("filters") or state.get("filters") or {}),
        }
    return update


def _search_key(brief: Brief, leg: str, outbound: Optional[dict], pushed: Optional[dict]) -> str:
    raw = json.dumps(
        [brief.model_dump(), leg, outbound["id"] if outbound and leg == "return" else None, pushed],
        sort_keys=True,
    )
    return hashlib.sha1(raw.encode()).hexdigest()


def _flex_dates(brief: Brief, today: date) -> list[str]:
    base = date.fromisoformat(brief.outbound_date)
    days = [base + timedelta(days=d) for d in range(-brief.flex_days, brief.flex_days + 1) if d != 0]
    return [d.isoformat() for d in days if d >= today]


def plan(state: AgentState) -> dict:
    """Decide the next step from the state. Every path through the graph comes back here."""
    brief, filters = _brief(state), _filters(state)
    planning = bool(state.get("planning"))
    update: dict = {}
    if planning:
        # "5 days in Kyoto" gave a length before any dates, so the end date can now be worked out.
        days = _prefs(state).days
        if days and brief.outbound_date and not brief.return_date and not brief.one_way:
            end = date.fromisoformat(brief.outbound_date) + timedelta(days=days - 1)
            brief.return_date, brief.one_way = end.isoformat(), False
            update["brief"] = brief.model_dump()
    if next_question(brief, _today(), need_origin=not planning):
        return {**update, "next": "ask", "stage": "gather"}
    if planning:
        return {**update, **_plan_step(state, brief)}

    stage = state.get("stage")
    if stage in (None, "gather"):
        stage = "outbound"
    if stage == "booking":
        # Flights added to a finished plan can change which days are free.
        if state.get("trip_days"):
            prefs = _prefs(state)
            if state.get("plan_key") != trip.plan_key(brief, prefs, _skeleton(state, brief, prefs)):
                return {"next": "compose", "stage": stage}
        return {"next": "offers", "stage": stage}

    pushed = (state.get("pushed_filters") or {}).get(stage)
    if filters.allow_self_transfer and not pushed:
        pushed = {"allow_self_transfer": True}
    outbound = state.get("selected_outbound")
    key = _search_key(brief, stage, outbound, pushed)

    if (state.get("search_keys") or {}).get(stage) == key:
        return {"next": "present", "stage": stage}

    pushed_filters = Filters(**pushed).model_dump() if pushed else None
    base = {"leg": stage, "date": brief.outbound_date, "filters": pushed_filters}
    tasks = [{**base, "hours": None, "main": True}]
    # Google lists only a few fares per page. One query per time window gives a far fuller list.
    tasks += [{**base, "hours": list(window), "main": True} for window in TIME_WINDOWS]
    if stage == "outbound":
        # Google only includes its price history on a page that allows self-transfer fares.
        tasks.append({**base, "hours": None, "main": False, "insights_only": True, "filters": {"allow_self_transfer": True}})
    if stage == "outbound" and brief.flex_days:
        tasks += [
            {**base, "date": day, "hours": None, "main": False, "filters": None}
            for day in _flex_dates(brief, _today())
        ]
    return {"next": "search", "stage": stage, "search_tasks": tasks, "search_parts": RESET, "search_error": None}


def _plan_step(state: AgentState, brief: Brief) -> dict:
    prefs = _prefs(state)
    if next_trip_question(prefs, brief, trip.has_end_date(brief, state.get("selected_return"))):
        return {"next": "ask_trip"}
    if state.get("places_key") != trip.places_key(brief, prefs):
        return {"next": "places", "place_tasks": ["guide", "web"], "place_parts": RESET}
    if state.get("plan_key") != trip.plan_key(brief, prefs, _skeleton(state, brief, prefs)):
        return {"next": "compose"}
    return {"next": "present_plan"}


def route_input(state: AgentState) -> str:
    return "interpret" if state["input"].get("type") == "text" else "apply_input"


def route_after_compose(state: AgentState) -> str:
    return "present_plan" if state.get("planning") else "offers"


def route_plan(state: AgentState):
    step = state["next"]
    if step == "ask":
        return "ask"
    if step == "offers":
        return "offers"
    if step == "present":
        return "present"
    if step in ("ask_trip", "compose", "present_plan"):
        return step
    if step == "places":
        return [Send("place_part", {"task": t, "brief": state["brief"], "prefs": state.get("prefs") or {}}) for t in state["place_tasks"]]
    brief = state["brief"]
    outbound = state.get("selected_outbound") if state["stage"] == "return" else None
    return [Send("search_part", {"task": t, "brief": brief, "outbound": outbound}) for t in state["search_tasks"]]


async def search_part(payload: dict) -> dict:
    task, brief = payload["task"], Brief(**payload["brief"])
    part = await google.fetch_part(
        brief,
        task["date"],
        selected_outbound=payload.get("outbound"),
        filters=Filters(**task["filters"]) if task.get("filters") else None,
        hours=tuple(task["hours"]) if task.get("hours") else None,
    )
    return {
        "search_parts": [
            {
                "date": part.date,
                "main": task["main"],
                "insights_only": task.get("insights_only", False),
                "itineraries": part.itineraries,
                "insights": part.insights,
                "error": part.error,
            }
        ]
    }


async def merge_results(state: AgentState) -> dict:
    """Join the fan-out: one row per itinerary at its lowest fare, then rank."""
    brief, leg = _brief(state), state["stage"]
    parts = state.get("search_parts") or []
    main = [p for p in parts if p["main"]]
    best: dict[str, dict] = {}
    for part in main:
        for it in part["itineraries"]:
            if it["id"] not in best or it["price"] < best[it["id"]]["price"]:
                best[it["id"]] = it

    error = None
    if not best and serpapi.api_key():
        _status("Trying the backup flight source")
        try:
            outbound = state.get("selected_outbound") if leg == "return" else None
            for it in await serpapi.search(brief, outbound):
                best[it["id"]] = it
        except Exception as exc:
            error = str(exc)[:200]
    if not best and all(p.get("error") for p in main):
        error = "The flight source did not respond."

    insights = next((p["insights"] for p in parts if p.get("insights_only") and p.get("insights")), None)

    strip = []
    if leg == "outbound" and brief.flex_days:
        lows = {p["date"]: min((i["price"] for i in p["itineraries"]), default=None) for p in parts if not p["main"] and not p.get("insights_only")}
        lows[brief.outbound_date] = min((i["price"] for i in best.values()), default=None)
        strip = [{"date": d, "price": lows[d]} for d in sorted(lows) if lows[d]]

    pushed = (state.get("pushed_filters") or {}).get(leg)
    key = _search_key(brief, leg, state.get("selected_outbound"), pushed or ({"allow_self_transfer": True} if _filters(state).allow_self_transfer else None))
    return {
        "results": {**(state.get("results") or {}), leg: rank.tag(list(best.values()))},
        "insights": {**(state.get("insights") or {}), leg: insights},
        "date_prices": {**(state.get("date_prices") or {}), leg: strip},
        "search_keys": {**(state.get("search_keys") or {}), leg: key},
        "search_error": error,
        "search_parts": RESET,
    }


async def place_part(payload: dict) -> dict:
    """One source of places. A source that fails leaves the other one to carry the plan."""
    task, city = payload["task"], _city(Brief(**payload["brief"]))
    _status(f"Searching Google and travel guides for {city}")
    if task == "guide":
        try:
            return {"place_parts": [{"task": task, "places": await wikivoyage.fetch(city), "sources": ["Wikivoyage"]}]}
        except Exception:
            return {"place_parts": [{"task": task, "places": [], "sources": []}]}
    found, sites = await web.search(city, payload["prefs"])
    return {"place_parts": [{"task": task, "places": found, "sources": sites}]}


async def merge_places(state: AgentState) -> dict:
    """Join the sources, find coordinates for web picks and keep the places that fit best."""
    brief, prefs = _brief(state), _prefs(state)
    city = _city(brief)
    parts = {part["task"]: part for part in state.get("place_parts") or []}
    guide = parts.get("guide", {}).get("places", [])
    picks = parts.get("web", {}).get("places", [])
    _status(f"Checking {len(guide) + len(picks)} places on the map")
    guide, fresh = web.merge(guide, picks)
    centre = await web.centre_of(city, guide)
    located = await web.locate(fresh, city, centre)
    days = _skeleton(state, brief, prefs)
    sources = [source for part in parts.values() for source in part.get("sources", []) if part.get("places")]
    return {
        "pool": trip.choose_pool(guide + located, prefs, centre, len(days)),
        "sources": list(dict.fromkeys(sources)),
        "places_key": trip.places_key(brief, prefs),
        "place_parts": RESET,
    }


def _describe_prefs(prefs: TripPrefs, children: int) -> str:
    interests = [INTEREST_LABELS[key] for key in prefs.interests or [] if key in INTEREST_LABELS]
    lines = [
        f"Pace: {STYLE_LABELS.get(prefs.style or 'balanced')[1]}.",
        f"Places: {SPOT_LABELS.get(prefs.spots or 'mixed')[1]}.",
        f"Likes: {', '.join(interests) or 'no particular preference'}.",
    ]
    if children:
        lines.append(f"Travelling with {children} children, so keep it suitable for them.")
    if prefs.notes:
        lines.append(f"Their own words: {prefs.notes}")
    return "\n".join(lines)


async def compose(state: AgentState) -> dict:
    """Ask Gemini to arrange the days. If it cannot, plain code still gives a sensible plan."""
    brief, prefs = _brief(state), _prefs(state)
    days, pool = _skeleton(state, brief, prefs), state.get("pool") or []
    city = _city(brief)
    if not pool:
        return {
            "trip_days": trip.build_days(None, days, [], prefs),
            "plan_key": trip.plan_key(brief, prefs, days),
            "plan_note": f"I could not find places for {city}. Try the nearest big city.",
        }
    _status(f"Arranging your {len(days)} days in {city}")
    suggestion, note = None, None
    try:
        composed = await llm.compose_plan(
            city,
            _describe_prefs(prefs, brief.children),
            trip.days_for_prompt(days, prefs.style),
            trip.pool_for_prompt(pool),
        )
        suggestion = composed.model_dump()["days"]
    except llm.QuotaExhausted:
        note = "This demo's free Gemini limit is used up, so I grouped the days by distance instead."
    plan_days = trip.build_days(suggestion, days, pool, prefs)
    stops = sum(len(day["stops"]) for day in plan_days)
    if state.get("trip_days") and not state.get("planning"):
        text = "I rearranged your days to fit these flights."
    else:
        text = f"Your {len(days)}-day plan for {city} is ready, with {stops} stops. Have a look on the right, and tell me what to change."
    return {
        "trip_days": plan_days,
        "plan_key": trip.plan_key(brief, prefs, days),
        "plan_note": f"{note} {text}" if note else text,
    }


def _booking_details(state: AgentState) -> Optional[dict]:
    brief, outbound, inbound = _brief(state), state.get("selected_outbound"), state.get("selected_return")
    if not outbound or (not brief.one_way and not inbound):
        return None
    chosen = inbound or outbound
    return {
        "brief": _trip_summary(brief),
        "outbound": outbound,
        "inbound": inbound,
        "total": chosen["price"],
        "currency": brief.currency,
        "offers": state.get("offers") or [],
        "google_link": google.booking_link(brief, outbound, inbound),
    }


def plan_card(state: AgentState) -> dict:
    """Everything the plan screen and the PDF show. Built from state, so both always match."""
    brief, prefs = _brief(state), _prefs(state)
    days, pool = state.get("trip_days") or [], state.get("pool") or []
    return {
        "kind": "itinerary",
        "brief": _trip_summary(brief),
        "prefs": prefs.model_dump(),
        "city": _city(brief),
        "days": trip.schedule(days, _skeleton(state, brief, prefs), pool, prefs, _city(brief)),
        "spare": trip.spare_places(days, pool)[:60],
        "sources": state.get("sources") or [],
        "booking": _booking_details(state),
        "interest_labels": INTEREST_LABELS,
    }


def _flights_offer(state: AgentState, brief: Brief) -> Optional[dict]:
    """Once the plan is made, ask about flights, unless they are chosen or were turned down."""
    if _booking_details(state) or state.get("flights_declined") or not brief.outbound_date:
        return None
    start = f"From {brief.origin_label}" if brief.origin_label else "I will ask where you are flying from"
    return {
        "question": f"Do you want flights for this trip to {_city(brief)}?",
        "options": [
            {"label": "Yes, find flights", "description": start, "patch": {"go_back_to": "outbound"}},
            {"label": "Not now", "description": "Keep the plan as it is", "patch": {"decline_flights": True}},
        ],
    }


def present_plan(state: AgentState) -> dict:
    brief = _brief(state)
    card = {
        **plan_card(state),
        "summary": state.get("plan_note") or "Here is your plan.",
        "reply": state.get("reply"),
        "quiet": _quiet(state),
        "offer": _flights_offer(state, brief),
    }
    return {"card": card, "plan_note": None, "transcript": _say(state, card["summary"], card)}


def ask_trip(state: AgentState) -> dict:
    brief, prefs = _brief(state), _prefs(state)
    question = next_trip_question(prefs, brief, trip.has_end_date(brief, state.get("selected_return")))
    answered = sum(1 for value in (prefs.style, prefs.spots, prefs.interests) if value is not None)
    card = {
        "kind": "question",
        **question,
        "progress": {"done": answered, "total": 3},
        "brief": _trip_summary(brief),
        "prefs": prefs.model_dump(),
        "city": _city(brief),
        "setup_days": _skeleton(state, brief, prefs),
        "interest_labels": INTEREST_LABELS,
        "booking": _booking_details(state),
        "reply": state.get("reply"),
    }
    return {"card": card, "transcript": _say(state, card["question"], card)}


def _trip_summary(brief: Brief) -> dict:
    return brief.model_dump()


def ask(state: AgentState) -> dict:
    brief = _brief(state)
    card = {"kind": "question", **next_question(brief, _today()), "brief": _trip_summary(brief), "reply": state.get("reply")}
    return {"card": card, "transcript": _say(state, card["question"], card)}


def _say(state: AgentState, text: Optional[str], card: dict) -> list:
    reply = state.get("reply")
    joined = " ".join(t for t in (reply, text) if t)
    return [] if _quiet(state) else [{"role": "assistant", "text": joined, "card_kind": card["kind"]}]


SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}


def _money(amount: int, currency: str) -> str:
    symbol = SYMBOLS.get(currency, f"{currency} ")
    if currency != "INR" or amount < 100000:
        return f"{symbol}{amount:,}"
    # Lakh grouping, to match what the UI shows for rupees.
    head, tail = str(amount)[:-3], str(amount)[-3:]
    pairs = []
    while len(head) > 2:
        pairs.insert(0, head[-2:])
        head = head[:-2]
    return f"{symbol}{','.join([head, *pairs])},{tail}"


def _summary(leg: str, all_flights: list[dict], shown: list[dict], error: Optional[str]) -> str:
    if error:
        return "I could not reach the flight source. Try again in a moment."
    if not all_flights:
        return "I found no flights for this search. Try other dates or a nearby airport."
    if not shown:
        return f"None of the {len(all_flights)} flights match your filters. Loosen one, or search again with them applied."
    what = "return flights" if leg == "return" else "flights"
    cheapest = min(shown, key=lambda i: i["price"])
    fastest = min(shown, key=lambda i: i["duration_min"])
    text = f"I found {len(shown)} {what}. Cheapest is {_money(cheapest['price'], cheapest['currency'])} on {cheapest['airlines'][0]}."
    if fastest["id"] != cheapest["id"]:
        extra = fastest["price"] - cheapest["price"]
        hours = (cheapest["duration_min"] - fastest["duration_min"]) / 60
        text += f" Fastest saves {hours:.1f} hours for {_money(extra, cheapest['currency'])} more."
    return text + " Pick one, or tell me what to change."


def present(state: AgentState) -> dict:
    brief, filters, leg = _brief(state), _filters(state), state["stage"]
    flights = (state.get("results") or {}).get(leg, [])
    shown = rank.visible(flights, filters)
    summary = _summary(leg, flights, shown, state.get("search_error"))
    card = {
        "kind": "flights",
        "leg": leg,
        "brief": _trip_summary(brief),
        "filters": filters.model_dump(),
        "itineraries": flights,
        "insights": (state.get("insights") or {}).get(leg),
        "date_prices": (state.get("date_prices") or {}).get(leg) or [],
        "selected_outbound": state.get("selected_outbound"),
        "summary": summary,
        "reply": state.get("reply"),
        "quiet": _quiet(state),
        "google_link": google.search_link(brief),
    }
    return {"card": card, "transcript": _say(state, summary, card)}


async def offers(state: AgentState) -> dict:
    """Sellers for the chosen flights. Spends SerpApi credits only for a finished trip."""
    brief, outbound, inbound = _brief(state), state["selected_outbound"], state.get("selected_return")
    key = json.dumps([brief.model_dump(), outbound["id"], inbound["id"] if inbound else None], sort_keys=True)
    if state.get("offers_key") == key or not serpapi.api_key():
        return {}
    _status("Comparing sellers for these flights")
    try:
        found = await serpapi.fetch_offers(brief, outbound, inbound)
        return {"offers": found, "offers_key": key, "offers_error": None}
    except Exception as exc:
        return {"offers": [], "offers_key": key, "offers_error": str(exc)[:200]}


def booking(state: AgentState) -> dict:
    brief, outbound, inbound = _brief(state), state["selected_outbound"], state.get("selected_return")
    found = state.get("offers") or []
    chosen = inbound or outbound
    if found:
        top = found[0]
        text = f"Cheapest seller is {top['seller']} at {_money(top['price'], brief.currency)}. Prices can change until you pay."
    else:
        text = (
            f"Your flights come to {_money(chosen['price'], brief.currency)}. "
            "This link opens them on Google Flights, where every seller is listed with the lowest price first."
        )
    if state.get("trip_days"):
        text = " ".join(part for part in (state.get("plan_note"), text, "They are in your plan now.") if part)
    card = {
        "kind": "booking",
        "brief": _trip_summary(brief),
        "outbound": outbound,
        "inbound": inbound,
        "total": chosen["price"],
        "currency": brief.currency,
        "offers": found,
        "google_link": google.booking_link(brief, outbound, inbound),
        "has_plan": bool(state.get("trip_days")),
        "summary": text,
        "reply": state.get("reply"),
        "quiet": _quiet(state),
    }
    return {"card": card, "plan_note": None, "transcript": _say(state, text, card)}


def wait(state: AgentState) -> dict:
    """Pause here until the traveller answers. The checkpoint survives restarts."""
    return {"input": interrupt(state["card"])}


def build_graph(checkpointer=None):
    graph = StateGraph(AgentState)
    graph.add_node("interpret", interpret)
    graph.add_node("apply_input", apply_input)
    graph.add_node("plan", plan)
    graph.add_node("ask", ask)
    graph.add_node("search_part", search_part)
    graph.add_node("merge_results", merge_results)
    graph.add_node("present", present)
    graph.add_node("offers", offers)
    graph.add_node("booking", booking)
    graph.add_node("wait", wait)
    graph.add_node("ask_trip", ask_trip)
    graph.add_node("place_part", place_part)
    graph.add_node("merge_places", merge_places)
    graph.add_node("compose", compose)
    graph.add_node("present_plan", present_plan)

    graph.add_conditional_edges(START, route_input, ["interpret", "apply_input"])
    graph.add_edge("interpret", "plan")
    graph.add_edge("apply_input", "plan")
    graph.add_conditional_edges("plan", route_plan, ["ask", "offers", "present", "search_part", "ask_trip", "place_part", "compose", "present_plan"])
    graph.add_edge("search_part", "merge_results")
    graph.add_edge("merge_results", "present")
    graph.add_edge("offers", "booking")
    graph.add_edge("ask", "wait")
    graph.add_edge("present", "wait")
    graph.add_edge("booking", "wait")
    graph.add_edge("place_part", "merge_places")
    graph.add_edge("merge_places", "compose")
    graph.add_conditional_edges("compose", route_after_compose, ["present_plan", "offers"])
    graph.add_edge("ask_trip", "wait")
    graph.add_edge("present_plan", "wait")
    graph.add_conditional_edges("wait", route_input, ["interpret", "apply_input"])
    return graph.compile(checkpointer=checkpointer)
