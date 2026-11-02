"""Live fares from Google Flights, read from the same page a browser gets.

No key and no quota, but it is unofficial. Results can stop if Google changes the page
or blocks a server IP, so the graph falls back to SerpApi when this returns nothing.
"""

import asyncio
import base64
import json
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import primp
from selectolax.lexbor import LexborHTMLParser

from .. import airports
from ..models import Brief, Filters, Itinerary, Layover, PriceInsights, Segment

SEARCH_URL = "https://www.google.com/travel/flights/search"
BOOKING_URL = "https://www.google.com/travel/flights/booking"

CABINS = {"economy": 1, "premium_economy": 2, "business": 3, "first": 4}
ROUND_TRIP, ONE_WAY = 1, 2


def _varint(value: int) -> bytes:
    out = b""
    while True:
        byte, value = value & 0x7F, value >> 7
        if value:
            out += bytes([byte | 0x80])
        else:
            return out + bytes([byte])


def _int(field_no: int, value: int) -> bytes:
    return _varint(field_no << 3) + _varint(value)


def _bytes(field_no: int, value: bytes) -> bytes:
    return _varint((field_no << 3) | 2) + _varint(len(value)) + value


def _str(field_no: int, value: str) -> bytes:
    return _bytes(field_no, value.encode())


def _leg(
    date: str,
    origin: list[str],
    destination: list[str],
    selected: Optional[list[dict]] = None,
    filters: Optional[Filters] = None,
    hours: Optional[tuple[int, int]] = None,
) -> bytes:
    out = _str(2, date)
    for seg in selected or []:
        out += _bytes(
            4,
            _str(1, seg["from_code"])
            + _str(2, seg["depart_at"][:10])
            + _str(3, seg["to_code"])
            + _str(5, seg["airline_code"])
            + _str(6, seg["flight_number"]),
        )
    if filters and filters.max_stops is not None:
        out += _int(5, filters.max_stops)
    if filters:
        for code in filters.airlines_include:
            if len(code) == 2:
                out += _str(6, code.upper())
    start, end = hours or (None, None)
    if filters and filters.depart_after_hour is not None:
        start = filters.depart_after_hour
    if filters and filters.depart_before_hour is not None:
        end = filters.depart_before_hour - 1
    if start is not None or end is not None:
        out += _int(8, start or 0) + _int(9, 23 if end is None else end)
    if filters and filters.max_duration_min is not None:
        out += _int(12, filters.max_duration_min)
    for code in origin:
        out += _bytes(13, _int(1, 1) + _str(2, code))
    for code in destination:
        out += _bytes(14, _int(1, 1) + _str(2, code))
    return out


def build_tfs(
    brief: Brief,
    outbound_date: Optional[str] = None,
    selected_outbound: Optional[dict] = None,
    selected_return: Optional[dict] = None,
    filters: Optional[Filters] = None,
    hours: Optional[tuple[int, int]] = None,
) -> str:
    """Encode the search as Google's `tfs` URL parameter."""
    date = outbound_date or brief.outbound_date
    picking_return = selected_outbound is not None
    legs = [
        _leg(
            date,
            brief.origin,
            brief.destination,
            selected=selected_outbound["segments"] if selected_outbound else None,
            filters=None if picking_return else filters,
            hours=None if picking_return else hours,
        )
    ]
    if not brief.one_way:
        return_date = brief.return_date
        legs.append(
            _leg(
                return_date,
                brief.destination,
                brief.origin,
                selected=selected_return["segments"] if selected_return else None,
                filters=filters if picking_return else None,
                hours=hours if picking_return else None,
            )
        )
    out = b"".join(_bytes(3, leg) for leg in legs)
    for code, count in ((1, brief.adults), (2, brief.children), (4, brief.infants)):
        for _ in range(count):
            out += _int(8, code)
    out += _int(9, CABINS[brief.cabin])
    if filters and filters.max_price is not None:
        out += _int(12, filters.max_price)
    # Self-transfer fares look cheap but the traveller carries the missed-connection risk.
    if not (filters and filters.allow_self_transfer):
        out += _int(17, 1)
    out += _int(19, ONE_WAY if brief.one_way else ROUND_TRIP)
    return base64.urlsafe_b64encode(out).decode()


def booking_link(brief: Brief, outbound: dict, inbound: Optional[dict] = None) -> str:
    """A Google Flights page with these exact flights selected. It lists every seller."""
    tfs = build_tfs(brief, selected_outbound=outbound, selected_return=inbound)
    return f"{BOOKING_URL}?tfs={tfs}&hl=en&curr={brief.currency}"


def search_link(brief: Brief) -> str:
    return f"{SEARCH_URL}?tfs={build_tfs(brief)}&hl=en&curr={brief.currency}"


def _iso(date: list, time: Optional[list]) -> str:
    parts = [*(time or []), None, None]
    return f"{date[0]:04d}-{date[1]:02d}-{date[2]:02d}T{parts[0] or 0:02d}:{parts[1] or 0:02d}"


def _at(row: list, index: int):
    return row[index] if row and len(row) > index else None


def parse_itinerary(item: list, currency: str) -> Optional[Itinerary]:
    """Read one result row. Rows with no price are not on sale, so they are skipped."""
    price_cell = _at(_at(item, 1), 0)
    price = _at(price_cell, 1)
    flight = _at(item, 0)
    if not price or not flight or not _at(flight, 2):
        return None

    segments = []
    for seg in flight[2]:
        carrier = _at(seg, 22) or []
        segments.append(
            Segment(
                airline=_at(carrier, 3) or (_at(carrier, 0) or ""),
                airline_code=_at(carrier, 0) or "",
                flight_number=str(_at(carrier, 1) or ""),
                from_code=seg[3],
                from_name=seg[4] or seg[3],
                to_code=seg[6],
                to_name=seg[5] or seg[6],
                depart_at=_iso(seg[20], seg[8]),
                arrive_at=_iso(seg[21], seg[10]),
                duration_min=seg[11] or 0,
                aircraft=_at(seg, 17),
                legroom=_at(seg, 14),
            )
        )

    layovers = []
    for i, row in enumerate(_at(flight, 13) or []):
        arrive, leave = segments[i].arrive_at, segments[i + 1].depart_at
        code = _at(row, 1) or segments[i].to_code
        layovers.append(
            Layover(
                airport=code,
                name=_at(row, 4) or airports.name_of(code),
                city=_at(row, 5) or airports.city_of(code),
                duration_min=_at(row, 0) or 0,
                overnight=arrive[:10] != leave[:10],
            )
        )

    first, last = segments[0], segments[-1]
    depart_hour, arrive_hour = int(first.depart_at[11:13]), int(last.arrive_at[11:13])
    day_offset = _day_gap(first.depart_at, last.arrive_at)
    extras = _at(flight, 22) or []
    co2, typical = _at(extras, 7), _at(extras, 8)
    codes = list(dict.fromkeys(s.airline_code for s in segments if s.airline_code))
    names = list(dict.fromkeys(s.airline for s in segments if s.airline)) or (_at(flight, 1) or [])

    return Itinerary(
        id="-".join(f"{s.airline_code}{s.flight_number}" for s in segments),
        price=price,
        currency=currency,
        airlines=names,
        airline_codes=codes,
        segments=segments,
        layovers=layovers,
        stops=len(segments) - 1,
        duration_min=_at(flight, 9) or sum(s.duration_min for s in segments),
        depart_at=first.depart_at,
        arrive_at=last.arrive_at,
        depart_hour=depart_hour,
        arrive_hour=arrive_hour,
        arrive_day_offset=day_offset,
        red_eye=depart_hour >= 22 or depart_hour < 5,
        overnight_layover=any(l.overnight for l in layovers),
        longest_layover_min=max((l.duration_min for l in layovers), default=0),
        co2_kg=round(co2 / 1000) if co2 else None,
        typical_co2_kg=round(typical / 1000) if typical else None,
    )


def _day_gap(start: str, end: str) -> int:
    return (date.fromisoformat(end[:10]) - date.fromisoformat(start[:10])).days


def parse_insights(payload: list) -> PriceInsights:
    row = _at(payload, 5) or []
    lowest = _at(_at(row, 1), 1)
    low, high = _at(_at(row, 4), 1), _at(_at(row, 5), 1)
    history_rows = _at(_at(row, 10), 0) or []
    level = None
    if lowest and low and high:
        level = "low" if lowest < low else "high" if lowest > high else "typical"
    return PriceInsights(
        lowest=lowest,
        typical_low=low,
        typical_high=high,
        level=level,
        history=[r[1] for r in history_rows if r and len(r) > 1 and r[1]],
    )


def parse_page(html: str, currency: str) -> tuple[list[Itinerary], PriceInsights]:
    node = LexborHTMLParser(html).css_first(r"script.ds\:1")
    if node is None:
        raise RuntimeError("Google Flights returned a page without results data")
    raw = node.text().split("data:", 1)[1].rsplit(",", 1)[0]
    if raw.endswith("errorHasStatus: true"):
        return [], PriceInsights()
    payload = json.loads(raw)
    found = []
    for index in (2, 3):
        rows = (_at(payload, index) or [None])[0] or []
        for item in rows:
            parsed = parse_itinerary(item, currency)
            if parsed:
                found.append(parsed)
    return found, parse_insights(payload)


@dataclass
class SearchPart:
    date: str
    itineraries: list[dict] = field(default_factory=list)
    insights: Optional[dict] = None
    error: Optional[str] = None


def _fetch(tfs: str, currency: str) -> tuple[list[Itinerary], PriceInsights]:
    client = primp.Client(impersonate="chrome_145", impersonate_os="macos", referer=True, cookie_store=True, timeout=20)
    res = client.get(SEARCH_URL, params={"tfs": tfs, "hl": "en", "curr": currency})
    return parse_page(res.text, currency)


async def fetch_part(
    brief: Brief,
    date: str,
    selected_outbound: Optional[dict] = None,
    filters: Optional[Filters] = None,
    hours: Optional[tuple[int, int]] = None,
) -> SearchPart:
    tfs = build_tfs(
        brief,
        outbound_date=date,
        selected_outbound=selected_outbound,
        filters=filters,
        hours=hours,
    )
    try:
        itineraries, insights = await asyncio.to_thread(_fetch, tfs, brief.currency)
    except Exception as exc:
        return SearchPart(date=date, error=str(exc)[:200])
    return SearchPart(
        date=date,
        itineraries=[i.model_dump() for i in itineraries],
        insights=insights.model_dump(),
    )
