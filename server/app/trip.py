"""The day-by-day plan.

Gemini suggests which places go on which day. Everything else is plain code: what fits in a day,
the order of stops, times, travel estimates and links. So swapping a stop needs no model call.
"""

import hashlib
import json
import math
import re
import urllib.parse
from collections import Counter
from datetime import date, timedelta
from typing import Optional

from .models import Brief, TripPrefs
from .places.web import distance_km

MAX_DAYS = 14
DAY_END = 20 * 60 + 30
# Allow for immigration and getting into town, and for getting back and checking in.
AFTER_LANDING_MIN = 150
BEFORE_FLIGHT_MIN = 210
MIN_USEFUL_MIN = 90

DAY_START = {"leisure": 10 * 60, "balanced": 9 * 60 + 30, "physical": 8 * 60}
MIN_PER_STOP = {"leisure": 180, "balanced": 150, "physical": 120}
DURATION = {"see": 90, "do": 120, "eat": 75, "drink": 60, "buy": 60}
HOURS = re.compile(r"(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})")
CAFE = re.compile(r"\b(?:coffee|caf[eé]|tea ?house|bakery|arabica)\b", re.I)
LUNCH_AT = 12 * 60
DINNER_AT = 18 * 60 + 30


def clock(minutes: int) -> str:
    hour, minute = (minutes % 1440) // 60, minutes % 60
    return f"{hour % 12 or 12}:{minute:02d} {'pm' if hour >= 12 else 'am'}"


def _minutes(iso: str) -> int:
    hour, minute = iso[11:16].split(":")
    return int(hour) * 60 + int(minute)


def pretty_date(iso: str) -> str:
    day = date.fromisoformat(iso[:10])
    return f"{day.strftime('%a')} {day.day} {day.strftime('%b')}"


def has_end_date(brief: Brief, inbound: Optional[dict]) -> bool:
    return bool(inbound or brief.return_date)


def skeleton(brief: Brief, prefs: TripPrefs, outbound: Optional[dict] = None, inbound: Optional[dict] = None) -> list[dict]:
    """One entry per calendar day, with the hours the flights leave free."""
    style = prefs.style or "balanced"
    first = (outbound["arrive_at"] if outbound else brief.outbound_date)[:10]
    start = date.fromisoformat(first)
    if inbound:
        last = date.fromisoformat(inbound["depart_at"][:10])
    elif brief.return_date:
        last = date.fromisoformat(brief.return_date)
    else:
        last = start + timedelta(days=(prefs.days or 3) - 1)
    count = max(1, min((last - start).days + 1, MAX_DAYS))

    days = []
    for offset in range(count):
        day = start + timedelta(days=offset)
        days.append(
            {
                "index": offset + 1,
                "date": day.isoformat(),
                "label": pretty_date(day.isoformat()),
                "start": DAY_START[style],
                "end": DAY_END,
                "before": None,
                "after": None,
            }
        )

    if outbound:
        landed = _minutes(outbound["arrive_at"])
        days[0]["start"] = max(days[0]["start"], landed + AFTER_LANDING_MIN)
        code = outbound["segments"][-1]["to_code"]
        days[0]["before"] = f"Land at {code} at {clock(landed)}. Allow about 2.5 hours to clear the airport and reach town."
    if inbound and (last - start).days < MAX_DAYS:
        leaving = _minutes(inbound["depart_at"])
        leave_by = leaving - BEFORE_FLIGHT_MIN
        code = inbound["segments"][0]["from_code"]
        if leave_by < 0:
            days[-1]["end"] = 0
            days[-1]["after"] = f"Your flight from {code} is at {clock(leaving)}, so head to the airport the evening before."
        else:
            days[-1]["end"] = min(days[-1]["end"], leave_by)
            days[-1]["after"] = f"Leave for {code} by {clock(leave_by)}. Your flight is at {clock(leaving)}."
    for day in days:
        day["open"] = day["end"] - day["start"] >= MIN_USEFUL_MIN
    return days


def capacity(day: dict, style: Optional[str]) -> int:
    if not day["open"]:
        return 0
    return max(1, min(6, (day["end"] - day["start"]) // MIN_PER_STOP[style or "balanced"]))


def score(place: dict, prefs: TripPrefs) -> float:
    """How well a place fits this traveller. Fame comes from Wikidata, tier from the web search."""
    total = min(len(place.get("summary") or ""), 300) / 150
    total += sum(3 for interest in prefs.interests or [] if interest in place["tags"])
    fame = place.get("fame")
    sightseeing = place["category"] in ("see", "do")
    if sightseeing and fame is not None:
        if prefs.spots == "top":
            total += min(fame, 50) / 4
        elif prefs.spots == "hidden":
            total += 6 if fame <= 4 else -fame / 5
        else:
            total += min(fame, 30) / 8
    elif sightseeing and prefs.spots == "hidden":
        total += 2
    if place.get("tier"):
        wanted = {"top": "famous", "hidden": "hidden"}.get(prefs.spots)
        total += 2 if wanted is None else (5 if place["tier"] == wanted else -3)
    if "active" in place["tags"]:
        total += {"physical": 5, "leisure": -3}.get(prefs.style, 0)
    if place.get("image"):
        total += 0.5
    return total


def choose_pool(places: list[dict], prefs: TripPrefs, centre: Optional[tuple[float, float]], day_count: int) -> list[dict]:
    """Keep the best fits near the destination, with enough food to cover the meals."""
    nearby = [p for p in places if p.get("lat") is not None and (not centre or distance_km(*centre, p["lat"], p["lng"]) <= 90)]
    ranked = sorted(nearby, key=lambda p: score(p, prefs), reverse=True)
    meals = [p for p in ranked if p["category"] in ("eat", "drink")][: max(12, day_count * 3)]
    other = [p for p in ranked if p["category"] not in ("eat", "drink")][: max(30, day_count * 8)]
    return other + meals


def _centroid(places: list[dict]) -> Optional[tuple[float, float]]:
    located = [p for p in places if p.get("lat") is not None]
    if not located:
        return None
    return sum(p["lat"] for p in located) / len(located), sum(p["lng"] for p in located) / len(located)


def _route(places: list[dict]) -> list[dict]:
    """Nearest neighbour, starting from the stop furthest out so the day sweeps one way."""
    if len(places) < 3:
        return places
    middle = _centroid(places)
    left = sorted(places, key=lambda p: distance_km(*middle, p["lat"], p["lng"]), reverse=True)
    route = [left.pop(0)]
    while left:
        here = route[-1]
        left.sort(key=lambda p: distance_km(here["lat"], here["lng"], p["lat"], p["lng"]))
        route.append(left.pop(0))
    return route


def order_stops(places: list[dict], day_start: int) -> list[dict]:
    """Sights in a sensible walk, with lunch around noon and dinner or drinks at the end."""
    meals = [p for p in places if p["category"] == "eat"]
    drinks = [p for p in places if p["category"] == "drink"]
    route = _route([p for p in places if p["category"] not in ("eat", "drink")])
    if meals and day_start < 14 * 60:
        lunch, clock_now, spot = meals.pop(0), day_start, len(route)
        for position, place in enumerate(route):
            if clock_now + DURATION[place["category"]] > LUNCH_AT + 60:
                spot = position
                break
            clock_now += DURATION[place["category"]]
        route.insert(spot, lunch)
    return route + meals + drinks


def _fill(day: dict, chosen: list[dict], pool: list[dict], used: set[str], room: int, prefs: TripPrefs) -> list[dict]:
    """Top up a day from the pool: the best fit first, then whatever is close to it."""
    spare = lambda: [p for p in pool if p["id"] not in used and p not in chosen]
    if room >= 3 and not any(p["category"] == "eat" for p in chosen):
        middle = _centroid(chosen)
        meals = [p for p in spare() if p["category"] == "eat"]
        if meals:
            pick = min(meals, key=lambda p: distance_km(*middle, p["lat"], p["lng"])) if middle else meals[0]
            # The meal takes a stop's place on a full day, so a relaxed day stays relaxed.
            chosen = [*chosen[: room - 1], pick]
    while len(chosen) < room:
        options = [p for p in spare() if p["category"] not in ("eat", "drink")] or spare()
        if not options:
            break
        middle = _centroid(chosen)
        if middle:
            pick = max(options, key=lambda p: score(p, prefs) - distance_km(*middle, p["lat"], p["lng"]) * 0.8)
        else:
            pick = max(options, key=lambda p: score(p, prefs))
        chosen = [*chosen, pick]
    return chosen


def _title(stops: list[dict], day: dict) -> str:
    if not stops:
        return "Arrival and rest" if day["index"] == 1 else "Travel day"
    areas = Counter(p["area"] for p in stops if p.get("area"))
    if areas:
        return areas.most_common(1)[0][0]
    return f"{stops[0]['name']} and around"


def build_days(composed: Optional[list[dict]], plan_skeleton: list[dict], pool: list[dict], prefs: TripPrefs) -> list[dict]:
    """Turn Gemini's suggestion into a valid plan. It may be None, which still gives a good one."""
    index = {p["id"]: p for p in pool}
    suggested = {d["day"]: d for d in composed or []}
    used: set[str] = set()
    days = []
    for day in plan_skeleton:
        room = capacity(day, prefs.style)
        suggestion = suggested.get(day["index"], {})
        notes = {s["place_id"]: s.get("note") for s in suggestion.get("stops", [])}
        chosen = []
        for place_id in notes:
            if place_id in index and place_id not in used and len(chosen) < room:
                chosen.append(index[place_id])
        chosen = _fill(day, chosen, pool, used, room, prefs) if room else []
        used.update(p["id"] for p in chosen)
        ordered = order_stops(chosen, day["start"])
        days.append(
            {
                "index": day["index"],
                "date": day["date"],
                "title": (suggestion.get("title") or _title(ordered, day)).replace("—", ",")[:60],
                "stops": [{"place_id": p["id"], "note": (notes.get(p["id"]) or "").replace("—", ",")[:160] or None} for p in ordered],
            }
        )
    return days


def _travel(previous: Optional[dict], place: dict) -> Optional[dict]:
    if not previous or previous.get("lat") is None or place.get("lat") is None:
        return None
    km = distance_km(previous["lat"], previous["lng"], place["lat"], place["lng"])
    if km < 1.2:
        minutes, mode = km / 4.5 * 60, "walk"
    else:
        minutes, mode = 10 + km / 22 * 60, "ride"
    return {"km": round(km, 1), "min": max(5, int(math.ceil(minutes / 5)) * 5), "mode": mode}


def _is_cafe(place: dict) -> bool:
    """A coffee stop is fine at four o'clock, so it should not wait for dinner time."""
    return bool(CAFE.search(f"{place['name']} {place.get('summary') or ''}"))


def hours_warning(hours: Optional[str], arrive: int) -> Optional[str]:
    """Flag a stop planned outside its hours. Only for one plain range, as seasonal text is too varied."""
    ranges = HOURS.findall(hours or "")
    if len(ranges) != 1:
        return None
    start_h, start_m, end_h, end_m = (int(part) for part in ranges[0])
    opens, closes = start_h * 60 + start_m, end_h * 60 + end_m
    if closes <= opens:
        closes += 1440
    if arrive < opens:
        return f"Opens at {clock(opens)}"
    if arrive >= closes:
        return f"Closes at {clock(closes)}"
    return None


def _duration(place: dict, style: Optional[str]) -> int:
    minutes = DURATION[place["category"]]
    if style == "physical" and "active" in place["tags"]:
        return 180
    if style == "leisure" and place["category"] == "see":
        return minutes + 30
    return minutes


def schedule(days: list[dict], plan_skeleton: list[dict], pool: list[dict], prefs: TripPrefs, city: str) -> list[dict]:
    """Times, travel and links for each stop. Runs after every change, so it never goes stale."""
    index = {p["id"]: p for p in pool}
    frames = {d["date"]: d for d in plan_skeleton}
    result = []
    for day in days:
        frame = frames.get(day["date"], {"start": DAY_START["balanced"], "end": DAY_END, "before": None, "after": None, "label": pretty_date(day["date"])})
        now, previous, stops = frame["start"], None, []
        kept = [s for s in day["stops"] if s["place_id"] in index]
        for position, stop in enumerate(kept):
            place = index[stop["place_id"]]
            travel = _travel(previous, place)
            arrive = now + (travel["min"] if travel else 0)
            last = position == len(kept) - 1
            if place["category"] == "eat" and 10 * 60 + 30 <= arrive < LUNCH_AT:
                arrive = LUNCH_AT
            elif last and place["category"] in ("eat", "drink") and 15 * 60 <= arrive < DINNER_AT and not _is_cafe(place):
                arrive = DINNER_AT
            minutes = _duration(place, prefs.style)
            stops.append(
                {
                    **place,
                    "number": position + 1,
                    "note": stop.get("note") or place.get("web_note") or None,
                    "time": clock(arrive),
                    "end_time": clock(arrive + minutes),
                    "duration_min": minutes,
                    "travel": travel,
                    "hours_warning": hours_warning(place.get("hours"), arrive),
                    "maps_url": maps_link(place, city),
                }
            )
            now, previous = arrive + minutes, place
        over = max(0, now - frame["end"]) if stops else 0
        result.append(
            {
                "index": day["index"],
                "date": day["date"],
                "label": frame["label"],
                "title": day["title"],
                "before": frame["before"],
                "after": frame["after"],
                "stops": stops,
                "ends_at": clock(now) if stops else None,
                "over_by_min": over,
                "must_end_at": clock(frame["end"]) if over else None,
                "route_url": route_link(stops),
            }
        )
    return result


def maps_link(place: dict, city: str) -> str:
    query = ", ".join(part for part in (place["name"], place.get("area"), city) if part)
    return "https://www.google.com/maps/search/?api=1&query=" + urllib.parse.quote(query)


def route_link(stops: list[dict]) -> Optional[str]:
    points = [f"{s['lat']:.6f},{s['lng']:.6f}" for s in stops if s.get("lat") is not None]
    if len(points) < 2:
        return None
    params = {"api": 1, "origin": points[0], "destination": points[-1]}
    if len(points) > 2:
        params["waypoints"] = "|".join(points[1:-1])
    return "https://www.google.com/maps/dir/?" + urllib.parse.urlencode(params)


def apply_op(days: list[dict], op: dict, pool: list[dict]) -> list[dict]:
    """One change from the traveller. Anything that does not make sense is ignored."""
    known = {p["id"]: p for p in pool}
    days = [{**day, "stops": [dict(s) for s in day["stops"]]} for day in days]
    used = {s["place_id"] for day in days for s in day["stops"]}
    action, place_id, new_id = op.get("action"), op.get("place_id"), op.get("new_place_id")

    if action == "add":
        target = next((d for d in days if d["index"] == op.get("day")), None)
        if target is not None and new_id in known and new_id not in used:
            _insert(target, {"place_id": new_id, "note": op.get("note")}, known)
        return days

    for day in days:
        for position, stop in enumerate(day["stops"]):
            if stop["place_id"] != place_id:
                continue
            if action == "swap" and new_id in known and new_id not in used:
                day["stops"][position] = {"place_id": new_id, "note": op.get("note")}
            elif action == "remove":
                day["stops"].pop(position)
            elif action == "shift":
                other = position + int(op.get("delta") or 0)
                if 0 <= other < len(day["stops"]):
                    day["stops"][position], day["stops"][other] = day["stops"][other], day["stops"][position]
            elif action == "move":
                target = next((d for d in days if d["index"] == op.get("day")), None)
                if target is not None and target is not day:
                    day["stops"].pop(position)
                    _insert(target, stop, known)
            return days
    return days


def _insert(day: dict, stop: dict, known: dict) -> None:
    """A new stop goes before a closing dinner or drink, not after it."""
    position = len(day["stops"])
    closing = position and known.get(day["stops"][-1]["place_id"], {}).get("category") in ("eat", "drink")
    if closing and known[stop["place_id"]]["category"] in ("see", "do", "buy"):
        position -= 1
    day["stops"].insert(position, stop)


def places_key(brief: Brief, prefs: TripPrefs) -> str:
    raw = json.dumps([brief.destination, brief.destination_label, prefs.spots, sorted(prefs.interests or []), prefs.notes])
    return hashlib.sha1(raw.encode()).hexdigest()


def plan_key(brief: Brief, prefs: TripPrefs, plan_skeleton: list[dict]) -> str:
    raw = json.dumps([places_key(brief, prefs), prefs.style, [d["date"] for d in plan_skeleton], [d["open"] for d in plan_skeleton]])
    return hashlib.sha1(raw.encode()).hexdigest()


def pool_for_prompt(pool: list[dict]) -> str:
    lines = []
    for place in pool:
        fame = "unknown" if place.get("fame") is None else ("famous" if place["fame"] >= 15 else "little known" if place["fame"] <= 4 else "known")
        if place.get("tier"):
            fame = place["tier"]
        summary = (place.get("summary") or "")[:90].replace("\n", " ")
        lines.append(f"{place['id']} | {place['name']} | {place['category']} | {place.get('area') or '-'} | {place['lat']:.2f},{place['lng']:.2f} | {fame} | {summary}")
    return "\n".join(lines)


def days_for_prompt(plan_skeleton: list[dict], style: Optional[str]) -> str:
    return "\n".join(
        f"Day {d['index']} ({d['label']}): {capacity(d, style)} stops, free {clock(d['start'])} to {clock(d['end'])}" if d["open"] else f"Day {d['index']} ({d['label']}): no stops, travel day"
        for d in plan_skeleton
    )


def plan_for_prompt(days: list[dict], pool: list[dict]) -> str:
    index = {p["id"]: p for p in pool}
    lines = []
    for day in days:
        lines.append(f"Day {day['index']} ({pretty_date(day['date'])}), {day['title']}:")
        for stop in day["stops"]:
            place = index.get(stop["place_id"])
            if place:
                lines.append(f"  {place['id']} | {place['name']} | {place['category']} | {place.get('area') or '-'}")
    return "\n".join(lines)


def spare_places(days: list[dict], pool: list[dict]) -> list[dict]:
    used = {s["place_id"] for day in days for s in day["stops"]}
    return [p for p in pool if p["id"] not in used]
