"""Seller offers and a search fallback through SerpApi's Google Flights engine.

Each uncached call costs one credit, so the graph browses with the free provider and only
calls this for a finished trip. SerpApi does not charge for a repeat of a cached search.
"""

import os
from datetime import datetime
from typing import Optional

import httpx

from .. import airports
from ..models import BookingOffer, Brief, Itinerary, Layover, Segment

BASE_URL = "https://serpapi.com/search.json"
CABINS = {"economy": 1, "premium_economy": 2, "business": 3, "first": 4}


def api_key() -> Optional[str]:
    return os.environ.get("SERPAPI_API_KEY") or None


def _base_params(brief: Brief) -> dict:
    params = {
        "engine": "google_flights",
        "api_key": api_key(),
        "departure_id": ",".join(brief.origin),
        "arrival_id": ",".join(brief.destination),
        "outbound_date": brief.outbound_date,
        "type": 2 if brief.one_way else 1,
        "travel_class": CABINS[brief.cabin],
        "adults": brief.adults,
        "children": brief.children,
        "infants_on_lap": brief.infants,
        "currency": brief.currency,
        "hl": "en",
    }
    if not brief.one_way:
        params["return_date"] = brief.return_date
    return params


async def _get(client: httpx.AsyncClient, params: dict) -> dict:
    res = await client.get(BASE_URL, params=params, timeout=45)
    res.raise_for_status()
    body = res.json()
    if body.get("error") and "best_flights" not in body and "booking_options" not in body:
        raise RuntimeError(body["error"])
    return body


def _all_rows(body: dict) -> list[dict]:
    return (body.get("best_flights") or []) + (body.get("other_flights") or [])


def flight_ids(row: dict) -> str:
    """Same id format as the Google provider: 'TG314-TG676'."""
    return "-".join(s.get("flight_number", "").replace(" ", "") for s in row.get("flights", []))


def _find(body: dict, itinerary_id: str) -> Optional[dict]:
    return next((r for r in _all_rows(body) if flight_ids(r) == itinerary_id), None)


def _clock(value: str) -> str:
    return datetime.strptime(value, "%Y-%m-%d %H:%M").strftime("%Y-%m-%dT%H:%M")


def parse_row(row: dict, currency: str) -> Optional[Itinerary]:
    if not row.get("price") or not row.get("flights"):
        return None
    segments = []
    for seg in row["flights"]:
        number = seg.get("flight_number", "").split()
        dep, arr = seg["departure_airport"], seg["arrival_airport"]
        segments.append(
            Segment(
                airline=seg.get("airline", ""),
                airline_code=number[0] if number else "",
                flight_number=number[-1] if number else "",
                from_code=dep["id"],
                from_name=dep.get("name", dep["id"]),
                to_code=arr["id"],
                to_name=arr.get("name", arr["id"]),
                depart_at=_clock(dep["time"]),
                arrive_at=_clock(arr["time"]),
                duration_min=seg.get("duration", 0),
                aircraft=seg.get("airplane"),
                legroom=seg.get("legroom"),
            )
        )
    layovers = [
        Layover(
            airport=l["id"],
            name=l.get("name", l["id"]),
            city=airports.city_of(l["id"]),
            duration_min=l.get("duration", 0),
            overnight=bool(l.get("overnight")),
        )
        for l in row.get("layovers", [])
    ]
    first, last = segments[0], segments[-1]
    depart_hour, arrive_hour = int(first.depart_at[11:13]), int(last.arrive_at[11:13])
    offset = (datetime.fromisoformat(last.arrive_at).date() - datetime.fromisoformat(first.depart_at).date()).days
    carbon = row.get("carbon_emissions") or {}
    return Itinerary(
        id=flight_ids(row),
        price=row["price"],
        currency=currency,
        airlines=list(dict.fromkeys(s.airline for s in segments)),
        airline_codes=list(dict.fromkeys(s.airline_code for s in segments)),
        segments=segments,
        layovers=layovers,
        stops=len(segments) - 1,
        duration_min=row.get("total_duration") or sum(s.duration_min for s in segments),
        depart_at=first.depart_at,
        arrive_at=last.arrive_at,
        depart_hour=depart_hour,
        arrive_hour=arrive_hour,
        arrive_day_offset=offset,
        red_eye=depart_hour >= 22 or depart_hour < 5,
        overnight_layover=any(l.overnight for l in layovers),
        longest_layover_min=max((l.duration_min for l in layovers), default=0),
        co2_kg=round(carbon["this_flight"] / 1000) if carbon.get("this_flight") else None,
        typical_co2_kg=round(carbon["typical_for_this_route"] / 1000) if carbon.get("typical_for_this_route") else None,
    )


async def search(brief: Brief, selected_outbound: Optional[dict]) -> list[dict]:
    """Fallback used only when the free provider returns nothing."""
    async with httpx.AsyncClient() as client:
        params = {**_base_params(brief), "show_hidden": "true"}
        body = await _get(client, params)
        if selected_outbound:
            row = _find(body, selected_outbound["id"])
            if not row or not row.get("departure_token"):
                return []
            body = await _get(client, {**params, "departure_token": row["departure_token"]})
        parsed = [parse_row(r, brief.currency) for r in _all_rows(body)]
    return [p.model_dump() for p in parsed if p]


def parse_offers(body: dict) -> list[BookingOffer]:
    offers = []
    for option in body.get("booking_options") or []:
        together = option.get("together") or {}
        if not together.get("price"):
            continue
        request = together.get("booking_request") or {}
        offers.append(
            BookingOffer(
                seller=together.get("book_with", "Unknown seller"),
                price=together["price"],
                is_airline=bool(together.get("airline")),
                url=request.get("url"),
                post_data=request.get("post_data"),
                phone=together.get("booking_phone"),
                baggage=together.get("baggage_prices") or [],
                separate_tickets=bool(option.get("separate_tickets")),
            )
        )
    # Sellers with a working web link come first when prices tie.
    offers.sort(key=lambda o: (o.price, o.url is None))
    return offers


async def fetch_offers(brief: Brief, outbound: dict, inbound: Optional[dict]) -> list[dict]:
    """Walk SerpApi's token chain to the sellers for the exact flights chosen."""
    async with httpx.AsyncClient() as client:
        params = _base_params(brief)
        body = await _get(client, {**params, "show_hidden": "true"})
        row = _find(body, outbound["id"])
        if row is None:
            return []
        if inbound is not None:
            if not row.get("departure_token"):
                return []
            body = await _get(client, {**params, "show_hidden": "true", "departure_token": row["departure_token"]})
            row = _find(body, inbound["id"])
            if row is None:
                return []
        if not row.get("booking_token"):
            return []
        body = await _get(client, {**params, "booking_token": row["booking_token"]})
    return [o.model_dump() for o in parse_offers(body)]
