import airportsdata

_AIRPORTS = airportsdata.load("IATA")

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
    return [], None
