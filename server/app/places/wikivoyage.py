"""Places from Wikivoyage, through its public API.

Each listing has coordinates and often hours, prices and a description. Wikidata's count of
language editions is a real measure of how famous a place is, so "little known" is not a guess.
"""

import hashlib
import html
import re
from typing import Optional

import httpx

API = "https://en.wikivoyage.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
HEADERS = {"User-Agent": "Travelust/0.1 (https://travelust-app.vercel.app)"}
LISTING = re.compile(r"\{\{\s*(see|do|eat|drink|buy|listing)\s*(?=[|\n}])", re.I)
MAX_DISTRICTS = 40
MAX_FAME_LOOKUPS = 150

TAGS = {
    "nature": r"park|garden|gardens|forest|mountain|hike|hiking|trail|beach|lake|waterfall|river|valley|nature|bamboo|island|viewpoint|gorge|hill",
    "history": r"temple|shrine|castle|palace|historic|heritage|cathedral|church|mosque|monument|fort|ancient|ruins|memorial|archaeological|tomb|old town",
    "art": r"museum|gallery|art|exhibition|theatre|theater|opera|crafts?",
    "shopping": r"market|bazaar|mall|boutique|arcade|shopping",
    "nightlife": r"bar|club|nightclub|nightlife|live music|izakaya|pub|cocktail",
    "active": r"hike|hiking|trek|trekking|climb|climbing|trail|cycling|cycle|bike|kayak|surf|surfing|dive|diving|snorkel|snorkelling|summit|rafting|ascent",
}
TAG_PATTERNS = {name: re.compile(rf"\b(?:{words})\b", re.I) for name, words in TAGS.items()}


def clean(value: str) -> str:
    """Wiki markup to plain text."""
    text = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>|<!--.*?-->", "", value, flags=re.S)
    text = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\]", "", text)
    text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    text = re.sub(r"'{2,}|<[^>]+>", "", text)
    text = html.unescape(text).replace("—", ", ").replace("–", "-")
    text = re.sub(r"\s+,", ",", text)
    return re.sub(r"\s+", " ", text).strip()


def whole_sentences(text: str, limit: int) -> str:
    """Shorten without stopping mid-sentence, when the text has a sentence end to stop at."""
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    if end > 20:
        return cut[:end + 1]
    return cut[:cut.rfind(" ")].rstrip(" ,;:") + "..."


def _blocks(text: str):
    """Yield (kind, body) for each listing template, allowing templates nested inside it."""
    for match in LISTING.finditer(text):
        depth, index = 2, match.end()
        while index < len(text) - 1 and depth:
            pair = text[index:index + 2]
            if pair == "{{":
                depth, index = depth + 2, index + 2
            elif pair == "}}":
                depth, index = depth - 2, index + 2
            else:
                index += 1
        if not depth:
            yield match.group(1).lower(), text[match.end():index - 2]


def _fields(body: str) -> dict[str, str]:
    """Split on pipes that are not inside a link or a nested template."""
    parts, current, depth, index = [], [], 0, 0
    while index < len(body):
        pair = body[index:index + 2]
        if pair in ("{{", "[["):
            depth += 1
            current.append(pair)
            index += 2
        elif pair in ("}}", "]]"):
            depth -= 1
            current.append(pair)
            index += 2
        elif body[index] == "|" and depth == 0:
            parts.append("".join(current))
            current = []
            index += 1
        else:
            current.append(body[index])
            index += 1
    parts.append("".join(current))
    fields = {}
    for part in parts:
        if "=" in part:
            key, value = part.split("=", 1)
            fields[key.strip().lower()] = value.strip()
    return fields


def _number(value: Optional[str]) -> Optional[float]:
    try:
        return float(value) if value else None
    except ValueError:
        return None


def tags_for(text: str, category: str) -> list[str]:
    tags = [name for name, pattern in TAG_PATTERNS.items() if pattern.search(text)]
    if category in ("eat", "drink"):
        tags.append("food")
    if category == "buy" and "shopping" not in tags:
        tags.append("shopping")
    if category == "drink" and "nightlife" not in tags:
        tags.append("nightlife")
    return tags


def parse_listings(text: str, area: Optional[str]) -> list[dict]:
    places = []
    for kind, body in _blocks(text):
        fields = _fields(body)
        category = fields.get("type", "see").lower() if kind == "listing" else kind
        if category not in ("see", "do", "eat", "drink", "buy"):
            continue
        name = clean(fields.get("name", ""))
        lat, lng = _number(fields.get("lat")), _number(fields.get("long"))
        if not name or lat is None or lng is None:
            continue
        summary = clean(fields.get("content", ""))
        image = fields.get("image", "").strip()
        places.append(
            {
                "id": "wv" + hashlib.sha1(f"{name}|{lat}".encode()).hexdigest()[:8],
                "name": name[:80],
                "category": category,
                "area": area,
                "lat": lat,
                "lng": lng,
                "summary": whole_sentences(summary, 360),
                "hours": whole_sentences(clean(fields.get("hours", "")), 100) or None,
                "price": whole_sentences(clean(fields.get("price", "")), 90) or None,
                "address": clean(fields.get("address", ""))[:90] or None,
                "url": fields.get("url", "").strip() if fields.get("url", "").startswith("http") else None,
                "image": f"https://commons.wikimedia.org/wiki/Special:FilePath/{image.replace(' ', '_')}?width=200" if image else None,
                "wikidata": fields.get("wikidata", "").strip() or None,
                "fame": None,
                "tier": None,
                "tags": tags_for(f"{name} {summary}", category),
                "source": "wikivoyage",
            }
        )
    return places


def linked_destinations(text: str) -> list[str]:
    """A region page like Bali lists its towns rather than places, so follow those links."""
    links = []
    for section in re.findall(r"^==\s*(?:Cities|Other destinations|Regions)\s*==\s*$(.*?)(?=^==[^=])", text, re.M | re.S):
        links += re.findall(r"\[\[([^\]|#:]+)(?:\|[^\]]*)?\]\]", section)
    return list(dict.fromkeys(link.strip() for link in links))[:8]


async def _api(client: httpx.AsyncClient, url: str, **params) -> dict:
    res = await client.get(url, params={"format": "json", "formatversion": 2, **params}, headers=HEADERS)
    res.raise_for_status()
    return res.json()


async def _contents(client: httpx.AsyncClient, titles: list[str]) -> dict[str, str]:
    found = {}
    for start in range(0, len(titles), 50):
        data = await _api(
            client,
            API,
            action="query",
            prop="revisions",
            rvprop="content",
            rvslots="main",
            redirects=1,
            titles="|".join(titles[start:start + 50]),
        )
        for page in data.get("query", {}).get("pages", []):
            revisions = page.get("revisions")
            if revisions:
                found[page["title"]] = revisions[0]["slots"]["main"]["content"]
    return found


async def _page_title(client: httpx.AsyncClient, label: str) -> Optional[str]:
    data = await _api(client, API, action="query", redirects=1, titles=label)
    pages = data.get("query", {}).get("pages", [])
    if pages and not pages[0].get("missing"):
        return pages[0]["title"]
    data = await _api(client, API, action="query", list="search", srsearch=label, srnamespace=0, srlimit=1)
    hits = data.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


async def _add_fame(client: httpx.AsyncClient, places: list[dict]) -> None:
    by_id = {p["wikidata"]: p for p in places if p["wikidata"] and p["category"] in ("see", "do")}
    ids = list(by_id)[:MAX_FAME_LOOKUPS]
    for start in range(0, len(ids), 50):
        data = await _api(client, WIKIDATA_API, action="wbgetentities", props="sitelinks", ids="|".join(ids[start:start + 50]))
        for key, entity in data.get("entities", {}).items():
            if key in by_id:
                by_id[key]["fame"] = len(entity.get("sitelinks", {}))


async def fetch(city: str) -> list[dict]:
    """Every listing for a city, from its main page and its district or town pages."""
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        title = await _page_title(client, city)
        if not title:
            return []
        data = await _api(client, API, action="query", list="allpages", apprefix=f"{title}/", aplimit=MAX_DISTRICTS, apfilterredir="nonredirects")
        districts = [p["title"] for p in data.get("query", {}).get("allpages", []) if p["title"].count("/") == title.count("/") + 1]
        pages = await _contents(client, [title, *districts])
        main = pages.get(title, "")
        places = parse_listings(main, None)
        for name, text in pages.items():
            if name != title:
                places += parse_listings(text, name.split("/")[-1])
        if not districts and len(places) < 15:
            towns = linked_destinations(main)
            for name, text in (await _contents(client, towns)).items():
                places += parse_listings(text, name)
        unique = {}
        for place in places:
            unique.setdefault(place["name"].lower(), place)
        result = list(unique.values())
        try:
            await _add_fame(client, result)
        except httpx.HTTPError:
            pass  # Fame only improves ranking, so the plan can go on without it.
        return result
