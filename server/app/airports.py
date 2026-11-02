import math

import airportsdata

_AIRPORTS = airportsdata.load("IATA")
MAX_KM_TO_AIRPORT = 200

# Cities with more than one commercial airport that travellers treat as one place.
METRO = {
    "tokyo": ["HND", "NRT"],
    "london": ["LHR", "LGW", "STN", "LTN", "LCY"],
    "new york": ["JFK", "EWR", "LGA"],
    "paris": ["CDG", "ORY"],
    "milan": ["MXP", "LIN", "BGY"],
    "seoul": ["ICN", "GMP"],
    "osaka": ["KIX", "ITM"],
    "bangkok": ["BKK", "DMK"],
    "dubai": ["DXB", "DWC"],
    "shanghai": ["PVG", "SHA"],
    "beijing": ["PEK", "PKX"],
    "istanbul": ["IST", "SAW"],
    "rome": ["FCO", "CIA"],
    "chicago": ["ORD", "MDW"],
    "washington": ["IAD", "DCA", "BWI"],
    "los angeles": ["LAX", "BUR", "SNA", "ONT"],
    "san francisco": ["SFO", "OAK", "SJC"],
    "miami": ["MIA", "FLL"],
    "kuala lumpur": ["KUL", "SZB"],
    "jakarta": ["CGK", "HLP"],
    "mumbai": ["BOM", "NMI"],
    "delhi": ["DEL", "HIA"],
}
METRO["nyc"] = METRO["new york"]
METRO["bengaluru"] = ["BLR"]
METRO["bangalore"] = ["BLR"]
METRO["calcutta"] = ["CCU"]
METRO["bali"] = ["DPS"]


def is_valid(code: str) -> bool:
    return code.upper() in _AIRPORTS


def name_of(code: str) -> str:
    airport = _AIRPORTS.get(code.upper())
    return airport["name"] if airport else code


def city_of(code: str) -> str:
    airport = _AIRPORTS.get(code.upper())
    return (airport["city"] or code) if airport else code


def resolve(place: str | None, codes: list[str] | None = None) -> tuple[list[str], str | None]:
    """Turn a place name and any model-suggested codes into checked IATA codes."""
    place_key = (place or "").strip().lower()
    if place_key in METRO:
        return [c for c in METRO[place_key] if is_valid(c)], (place or "").strip().title()

    valid = [c.upper() for c in (codes or []) if is_valid(c)]
    if valid:
        return valid, (place or city_of(valid[0])).strip()

    if len(place_key) == 3 and is_valid(place_key):
        code = place_key.upper()
        return [code], city_of(code)

    if not place_key:
        return [], None

    matches = [a for a in _AIRPORTS.values() if (a["city"] or "").lower() == place_key]
    # Scheduled airports are the ones with a "International" name far more often than not.
    matches.sort(key=lambda a: "international" not in a["name"].lower())
    if matches:
        return [matches[0]["iata"]], matches[0]["city"]
    # A real place with no airport, like Kyoto. Keep its name so the trip is not lost.
    return [], (place or "").strip()


def nearest(lat: float, lng: float, limit: int = 2) -> list[str]:
    """The closest airports to a place. International ones first, as small strips rarely have fares."""
    near = []
    for code, airport in _AIRPORTS.items():
        km = _distance_km(lat, lng, airport["lat"], airport["lon"])
        if km <= MAX_KM_TO_AIRPORT:
            near.append((km, code, "international" in airport["name"].lower()))
    near.sort()
    main = [code for _, code, international in near if international]
    return (main or [code for _, code, _ in near])[:limit]


def _distance_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    dlat, dlng = lat2 - lat1, math.radians(b_lng - a_lng)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))
