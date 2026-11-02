"""Map images for the PDF, built from OpenStreetMap tiles.

Only the tiles a trip needs are fetched, two at a time, with a clear User-Agent and credit on
every map, as OpenStreetMap's tile policy asks. If tiles cannot be reached, a map comes back as
None and the PDF draws the stops on a plain panel instead.
"""

import io
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

import httpx
from PIL import Image, ImageEnhance

TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
HEADERS = {"User-Agent": "Travelust/0.1 (https://travelust-app.vercel.app)"}
TILE_SIZE = 256
MAX_ZOOM = 16
MIN_ZOOM = 2
PADDING_PX = 34
WORKERS = 2
BUDGET_SECONDS = 25
_client = httpx.Client(timeout=6, headers=HEADERS, follow_redirects=True)


@dataclass
class View:
    zoom: int
    left: float
    top: float
    width: int
    height: int

    def pixel(self, lat: float, lng: float) -> tuple[float, float]:
        x, y = _world(lat, lng, self.zoom)
        return x - self.left, y - self.top


def _world(lat: float, lng: float, zoom: int) -> tuple[float, float]:
    """Web Mercator position in pixels at this zoom."""
    scale = TILE_SIZE * 2**zoom
    sine = math.sin(math.radians(max(min(lat, 85), -85)))
    return (lng + 180) / 360 * scale, (0.5 - math.log((1 + sine) / (1 - sine)) / (4 * math.pi)) * scale


def fit(points: list[tuple[float, float]], width: int, height: int) -> View:
    """The closest zoom that shows every point, with room for its pin."""
    for zoom in range(MAX_ZOOM, MIN_ZOOM - 1, -1):
        world = [_world(lat, lng, zoom) for lat, lng in points]
        xs, ys = [p[0] for p in world], [p[1] for p in world]
        if max(xs) - min(xs) <= width - 2 * PADDING_PX and max(ys) - min(ys) <= height - 2 * PADDING_PX:
            break
    return View(zoom, (max(xs) + min(xs) - width) / 2, (max(ys) + min(ys) - height) / 2, width, height)


def _tiles_for(view: View) -> list[tuple[int, int, int]]:
    limit = 2**view.zoom
    first_x, last_x = int(view.left // TILE_SIZE), int((view.left + view.width) // TILE_SIZE)
    first_y, last_y = int(view.top // TILE_SIZE), int((view.top + view.height) // TILE_SIZE)
    return [(view.zoom, x, y) for x in range(first_x, last_x + 1) for y in range(first_y, last_y + 1) if 0 <= x < limit and 0 <= y < limit]


def _download(zoom: int, x: int, y: int) -> bytes:
    res = _client.get(TILE_URL.format(z=zoom, x=x, y=y))
    res.raise_for_status()
    return res.content


@lru_cache(maxsize=512)
def _tile(zoom: int, x: int, y: int) -> bytes:
    # Failures raise, and lru_cache does not keep those, so a later export can try again.
    return _download(zoom, x, y)


def _compose(view: View, tiles: dict[tuple[int, int, int], Optional[bytes]]) -> Optional[bytes]:
    wanted = _tiles_for(view)
    if not any(tiles.get(key) for key in wanted):
        return None
    canvas = Image.new("RGB", (view.width, view.height), (236, 233, 224))
    for key in wanted:
        data = tiles.get(key)
        if data:
            tile = Image.open(io.BytesIO(data)).convert("RGB")
            canvas.paste(tile, (round(key[1] * TILE_SIZE - view.left), round(key[2] * TILE_SIZE - view.top)))
    # The same quieter look the plan screen gives its map, so pins stand out on paper.
    canvas = ImageEnhance.Color(canvas).enhance(0.6)
    output = io.BytesIO()
    canvas.save(output, format="JPEG", quality=82, optimize=True)
    return output.getvalue()


def render_many(requests: list[tuple[list[tuple[float, float]], int, int]]) -> list[tuple[View, Optional[bytes]]]:
    """One (view, image) per request. Tiles shared by several maps are fetched once."""
    views = [fit(points, width, height) for points, width, height in requests]
    needed = list(dict.fromkeys(key for view in views for key in _tiles_for(view)))
    deadline = time.monotonic() + BUDGET_SECONDS

    def fetch(key: tuple[int, int, int]) -> Optional[bytes]:
        if time.monotonic() > deadline:
            return None
        try:
            return _tile(*key)
        except (httpx.HTTPError, OSError):
            return None

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        tiles = dict(zip(needed, pool.map(fetch, needed)))
    return [(view, _compose(view, tiles)) for view in views]
