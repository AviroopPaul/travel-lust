from ..models import Filters


def _names(itinerary: dict) -> list[str]:
    return [n.lower() for n in itinerary["airlines"]] + [c.lower() for c in itinerary["airline_codes"]]


def _airline_match(itinerary: dict, wanted: list[str]) -> bool:
    names = _names(itinerary)
    return any(w.lower() in name or name in w.lower() for w in wanted for name in names)


def passes(itinerary: dict, filters: Filters) -> bool:
    f, it = filters, itinerary
    if f.max_stops is not None and it["stops"] > f.max_stops:
        return False
    if f.max_price is not None and it["price"] > f.max_price:
        return False
    if f.max_duration_min is not None and it["duration_min"] > f.max_duration_min:
        return False
    if f.airlines_include and not _airline_match(it, f.airlines_include):
        return False
    if f.airlines_exclude and _airline_match(it, f.airlines_exclude):
        return False
    if f.depart_after_hour is not None and it["depart_hour"] < f.depart_after_hour:
        return False
    if f.depart_before_hour is not None and it["depart_hour"] >= f.depart_before_hour:
        return False
    if f.arrive_after_hour is not None and it["arrive_hour"] < f.arrive_after_hour:
        return False
    if f.arrive_before_hour is not None and it["arrive_hour"] >= f.arrive_before_hour:
        return False
    if f.no_red_eye and it["red_eye"]:
        return False
    if f.no_overnight_layover and it["overnight_layover"]:
        return False
    layovers = it["layovers"]
    if f.max_layover_min is not None and any(l["duration_min"] > f.max_layover_min for l in layovers):
        return False
    if f.min_layover_min is not None and any(l["duration_min"] < f.min_layover_min for l in layovers):
        return False
    avoid = {a.upper() for a in f.avoid_layover_airports}
    if avoid and any(l["airport"] in avoid for l in layovers):
        return False
    return True


def score(itinerary: dict, cheapest: int, fastest: int) -> float:
    """Lower is better. A stop or an overnight layover costs more than its minutes suggest."""
    price_penalty = (itinerary["price"] - cheapest) / max(cheapest, 1)
    time_penalty = (itinerary["duration_min"] - fastest) / max(fastest, 1)
    stop_penalty = 0.08 * itinerary["stops"]
    comfort_penalty = 0.12 * itinerary["overnight_layover"] + 0.06 * itinerary["red_eye"]
    return price_penalty + 0.6 * time_penalty + stop_penalty + comfort_penalty


def _hours(minutes: int) -> str:
    hours, mins = divmod(abs(minutes), 60)
    if not hours:
        return f"{mins}m"
    return f"{hours}h {mins}m" if mins else f"{hours}h"


def tag(itineraries: list[dict]) -> list[dict]:
    """Label the winners and write each flight's trade-off against the cheapest fare."""
    if not itineraries:
        return []
    cheapest = min(i["price"] for i in itineraries)
    fastest = min(i["duration_min"] for i in itineraries)
    ranked = sorted(itineraries, key=lambda i: score(i, cheapest, fastest))
    cheapest_flight = min(itineraries, key=lambda i: (i["price"], i["duration_min"]))
    fastest_flight = min(itineraries, key=lambda i: (i["duration_min"], i["price"]))
    for it in ranked:
        it["tags"] = []
        if it["id"] == ranked[0]["id"]:
            it["tags"].append("best")
        if it["id"] == cheapest_flight["id"]:
            it["tags"].append("cheapest")
        if it["id"] == fastest_flight["id"]:
            it["tags"].append("fastest")
        extra, saved = it["price"] - cheapest, cheapest_flight["duration_min"] - it["duration_min"]
        if extra > 0 and saved > 0:
            it["note"] = f"{_hours(saved)} faster than the cheapest"
        elif extra > 0 and saved < 0:
            it["note"] = f"Costs more and takes {_hours(saved)} longer than the cheapest"
        elif extra == 0 and it["id"] != cheapest_flight["id"]:
            it["note"] = "Same price as the cheapest"
        else:
            it["note"] = None
        it["_rank"] = ranked.index(it)
    return ranked


def visible(itineraries: list[dict], filters: Filters) -> list[dict]:
    kept = [i for i in itineraries if passes(i, filters)]
    if filters.sort == "cheapest":
        kept.sort(key=lambda i: (i["price"], i["duration_min"]))
    elif filters.sort == "fastest":
        kept.sort(key=lambda i: (i["duration_min"], i["price"]))
    elif filters.sort == "earliest":
        kept.sort(key=lambda i: i["depart_at"])
    elif filters.sort == "lowest_co2":
        kept.sort(key=lambda i: (i["co2_kg"] is None, i["co2_kg"] or 0))
    else:
        kept.sort(key=lambda i: i.get("_rank", 0))
    return kept
