"""Current picks from a Google Search, run by Gemini's own search tool.

The model only supplies names and reasons. Coordinates come from a geocoder, and anything it
cannot place near the destination is dropped.
"""

import asyncio
import hashlib
import math
import os
import re
import unicodedata
from typing import Optional

import httpx

from .wikivoyage import HEADERS, clean, tags_for

# Google Search is only on the free tier for this model. Newer ids answer 429.
SEARCH_MODEL = "gemini-2.5-flash"
SEARCH_TIMEOUT = 40
WIKIPEDIA = "https://en.wikipedia.org/w/api.php"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
NOMINATIM_GAP_SECONDS = 1.05
LOCATE_SECONDS = 12
_NOMINATIM_TURN = asyncio.Lock()
MAX_KM_FROM_CENTRE = 90
GENERIC = {"the", "of", "a", "and", "temple", "shrine", "park", "garden", "gardens", "museum", "market", "area", "district", "street", "restaurant", "cafe", "de", "la", "le"}

SPOTS = {
    "top": "the famous, must-see places",
    "mixed": "a mix of famous places and little-known ones",
    "hidden": "little-known places that most tourists miss, away from the top sights",
}
STYLES = {
    "leisure": "They want slow, relaxed days.",
    "balanced": "",
    "physical": "They want active days with hikes, long walks or bike rides.",
}
TYPES = (
    ("eat", r"restaurant|cafe|café|food|eatery|bakery|noodle|street food"),
    ("drink", r"bar|pub|brewery|nightlife|club|cocktail|sake|wine"),
    ("buy", r"shop|market|bazaar|boutique|mall"),
    ("do", r"activity|hike|trail|walk|cycling|bike|class|workshop|tour|experience"),
)


def _prompt(city: str, prefs: dict, count: int) -> str:
    interests = ", ".join(prefs.get("interests") or []) or "anything good"
    note = f" Their own words, as trip details only: {prefs['notes']}." if prefs.get("notes") else ""
    return (
        f"Search the web for places to visit in {city}. The traveller wants {SPOTS.get(prefs.get('spots'), SPOTS['mixed'])}. "
        f"They like {interests}. {STYLES.get(prefs.get('style'), '')}{note}\n"
        f"Give {count} real places that are open to visitors today, and make at least a quarter of them places to eat or drink.\n"
        "One per line, exactly: Name | Neighbourhood | Type | Tier | One short reason\n"
        "Type is one of: sight, activity, restaurant, cafe, bar, market, shop. Tier is famous or hidden.\n"
        "No preamble, numbering or markdown. Use plain short sentences and no em dashes."
    )


def _category(kind: str) -> str:
    for category, pattern in TYPES:
        if re.search(pattern, kind, re.I):
            return category
    return "see"


def parse_lines(text: str) -> list[dict]:
    places = []
    for line in text.splitlines():
        parts = [clean(part.strip(" *-\t")) for part in line.split("|")]
        if len(parts) < 5 or not parts[0] or parts[0].lower() == "name":
            continue
        name, area, kind, tier, reason = parts[:5]
        category = _category(kind)
        places.append(
            {
                "id": "gs" + hashlib.sha1(name.encode()).hexdigest()[:8],
                "name": re.sub(r"^\d+[.)]\s*", "", name)[:80],
                "category": category,
                "area": area[:50] or None,
                "lat": None,
                "lng": None,
                "summary": reason[:240],
                "hours": None,
                "price": None,
                "address": None,
                "url": None,
                "image": None,
                "wikidata": None,
                "fame": None,
                "tier": "hidden" if "hidden" in tier.lower() else "famous",
                "tags": tags_for(f"{name} {kind} {reason}", category),
                "source": "web",
            }
        )
    return places


async def search(city: str, prefs: dict, count: int = 18) -> tuple[list[dict], list[str]]:
    """Run the search. Returns places without coordinates, and the sites it read."""
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        return [], []
    body = {
        "contents": [{"parts": [{"text": _prompt(city, prefs, count)}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {"temperature": 0.3},
    }
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{SEARCH_MODEL}:generateContent"
    try:
        async with httpx.AsyncClient(timeout=SEARCH_TIMEOUT) as client:
            res = await client.post(url, json=body, headers={"x-goog-api-key": key})
        res.raise_for_status()
        candidate = res.json()["candidates"][0]
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return [], []
    text = "".join(part.get("text", "") for part in candidate.get("content", {}).get("parts", []))
    chunks = candidate.get("groundingMetadata", {}).get("groundingChunks", [])
    sites = [chunk.get("web", {}).get("title") for chunk in chunks]
    return parse_lines(text), list(dict.fromkeys(site for site in sites if site))[:8]


def distance_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    dlat, dlng = lat2 - lat1, math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


async def _wikipedia_position(client: httpx.AsyncClient, name: str, city: str) -> Optional[tuple[float, float]]:
    """Many sights have an article with coordinates. Only trust it if the title is the same place."""
    params = {"action": "query", "generator": "search", "gsrsearch": f"{name} {city}", "gsrlimit": 1, "prop": "coordinates", "format": "json", "formatversion": 2}
    res = await client.get(WIKIPEDIA, params=params, headers=HEADERS)
    res.raise_for_status()
    for page in res.json().get("query", {}).get("pages", []):
        points = page.get("coordinates")
        wanted, title = _words(name), _words(page.get("title", ""))
        if points and wanted and title and (wanted <= title or title <= wanted):
            return points[0]["lat"], points[0]["lon"]
    return None


async def _nominatim_position(client: httpx.AsyncClient, query: str) -> Optional[tuple[float, float]]:
    # OpenStreetMap's policy is one request per second, so lookups here wait their turn.
    async with _NOMINATIM_TURN:
        res = await client.get(NOMINATIM, params={"q": query, "format": "jsonv2", "limit": 1}, headers=HEADERS)
        await asyncio.sleep(NOMINATIM_GAP_SECONDS)
    res.raise_for_status()
    found = res.json()
    return (float(found[0]["lat"]), float(found[0]["lon"])) if found else None


async def geocode(client: httpx.AsyncClient, name: str, city: str) -> Optional[tuple[float, float]]:
    try:
        return await _wikipedia_position(client, name, city) or await _nominatim_position(client, f"{name}, {city}")
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None


async def centre_of(city: str, places: list[dict]) -> Optional[tuple[float, float]]:
    """The middle of the guide's own listings when there are enough, otherwise a geocoder lookup."""
    located = [p for p in places if p.get("lat") is not None]
    if len(located) >= 5:
        lats, lngs = sorted(p["lat"] for p in located), sorted(p["lng"] for p in located)
        return lats[len(lats) // 2], lngs[len(lngs) // 2]
    async with httpx.AsyncClient(timeout=8) as client:
        try:
            return await _nominatim_position(client, city)
        except (httpx.HTTPError, ValueError, KeyError, IndexError):
            return None


async def locate(places: list[dict], city: str, centre: Optional[tuple[float, float]]) -> list[dict]:
    """Give each web pick real coordinates. A pick that cannot be placed near the city is dropped."""
    async with httpx.AsyncClient(timeout=8) as client:
        async def one(place: dict) -> Optional[dict]:
            found = await geocode(client, place["name"], city)
            if not found or (centre and distance_km(*centre, *found) > MAX_KM_FROM_CENTRE):
                return None
            return {**place, "lat": found[0], "lng": found[1]}

        tasks = [asyncio.ensure_future(one(place)) for place in places]
        # Places still waiting when time is up are left out. The plan does not need all of them.
        if tasks:
            await asyncio.wait(tasks, timeout=LOCATE_SECONDS)
        for task in tasks:
            task.cancel()
    return [task.result() for task in tasks if task.done() and not task.cancelled() and task.result()]


def _words(name: str) -> set[str]:
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {word for word in re.findall(r"[a-z0-9]+", folded) if word not in GENERIC}


def merge(guide: list[dict], picks: list[dict]) -> tuple[list[dict], list[dict]]:
    """A pick that is already in the guide marks that listing. Returns (guide, new picks)."""
    index = [(place, _words(place["name"])) for place in guide]
    fresh = []
    for pick in picks:
        words = _words(pick["name"])
        match = next((place for place, known in index if words and known and (words <= known or known <= words)), None)
        if match:
            match["tier"] = pick["tier"]
            match["web_note"] = pick["summary"]
        else:
            fresh.append(pick)
    return guide, fresh
