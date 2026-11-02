"""The trip as a PDF, ready to print or share. It renders the same card the plan screen shows."""

import io
import math
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Flowable, Frame, HRFlowable, KeepTogether, PageTemplate, Paragraph, Spacer, Table, TableStyle

from . import staticmap
from .places.wikivoyage import whole_sentences
from .questions import SPOT_LABELS, STYLE_LABELS

FONTS = Path(__file__).parent / "fonts"
REGULAR, MEDIUM, BOLD = "Geist", "Geist-Medium", "Geist-SemiBold"
pdfmetrics.registerFont(TTFont(REGULAR, FONTS / "Geist-Regular.ttf"))
pdfmetrics.registerFont(TTFont(MEDIUM, FONTS / "Geist-Medium.ttf"))
pdfmetrics.registerFont(TTFont(BOLD, FONTS / "Geist-SemiBold.ttf"))
_GLYPHS = set(pdfmetrics.getFont(REGULAR).face.charToGlyph)

SITE = "travelust-app.vercel.app"
CLAY = colors.HexColor("#a14c2a")
CLAY_SOFT = colors.HexColor("#f1e4db")
INK = colors.HexColor("#26241f")
MUTED = colors.HexColor("#5f5b52")
SUBTLE = colors.HexColor("#7f7a6c")
RULE = colors.HexColor("#dedad0")
PANEL = colors.HexColor("#f6f4ee")
PAPER = colors.HexColor("#fdfbf7")
# Each day's colour, matching --day-1 to --day-6 on the plan screen.
DAY_COLOURS = ["#a14c2a", "#3f6a8a", "#4f7045", "#a0741a", "#7a4a68", "#2f7a76"]
MARGIN = 18 * mm
WIDTH = A4[0] - 2 * MARGIN

# Images hold two pixels per point, so the maps stay sharp in print.
PIXELS_PER_POINT = 2
DAY_MAP_SIZE = (252, 138)
TRIP_MAP_SIZE = (214, 196)

SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}
CATEGORY = {"see": "Sight", "do": "Activity", "eat": "Food", "drink": "Drinks", "buy": "Shopping"}
# The logo's plane, from public/logo.svg, in absolute points on its 32 unit square.
PLANE_PATH = "M16 4.5c1.1 0 1.9 1.5 1.9 3.2v4.9l8.6 5v2.5l-8.6-2.5v5l2.5 1.9v1.9L16 25.3l-4.4 1.1v-1.9l2.5-1.9v-5l-8.6 2.5v-2.5l8.6-5V7.7c0-1.7.8-3.2 1.9-3.2z"


def _style(name: str, size: float, font: str = REGULAR, color=INK, leading: float = 0, **extra) -> ParagraphStyle:
    return ParagraphStyle(name, fontName=font, fontSize=size, leading=leading or size * 1.32, textColor=color, **extra)


TITLE = _style("title", 25, BOLD, leading=29)
SUB = _style("sub", 10.5, REGULAR, MUTED)
H2 = _style("h2", 13, BOLD, spaceBefore=4, spaceAfter=5)
DAY_TAG = _style("daytag", 9, MEDIUM, CLAY)
DAY_TITLE = _style("daytitle", 15.5, BOLD, leading=19)
BODY = _style("body", 9.5)
SMALL = _style("small", 8.5, REGULAR, MUTED)
TINY = _style("tiny", 8, REGULAR, SUBTLE)
NAME = _style("name", 10.5, MEDIUM)
TIME = _style("time", 9.5, MEDIUM, MUTED)
RIGHT = _style("right", 9.5, REGULAR, MUTED, alignment=TA_RIGHT)


def safe(text) -> str:
    """Escape for a Paragraph, and drop characters the font cannot draw."""
    kept = "".join(ch for ch in str(text or "") if ord(ch) in _GLYPHS or ch == " ").replace("—", ",")
    return escape(re.sub(r"\s+", " ", kept).strip())


def money(amount: int, currency: str) -> str:
    symbol = SYMBOLS.get(currency, f"{currency} ")
    if currency != "INR" or amount < 100000:
        return f"{symbol}{amount:,}"
    head, tail = str(amount)[:-3], str(amount)[-3:]
    pairs = []
    while len(head) > 2:
        pairs.insert(0, head[-2:])
        head = head[:-2]
    return f"{symbol}{','.join([head, *pairs])},{tail}"


def duration(minutes: int) -> str:
    hours, rest = minutes // 60, minutes % 60
    if not hours:
        return f"{rest}m"
    return f"{hours}h {rest}m" if rest else f"{hours}h"


def clock(iso: str) -> str:
    hour, minute = int(iso[11:13]), int(iso[14:16])
    return f"{hour % 12 or 12}:{minute:02d} {'pm' if hour >= 12 else 'am'}"


def link(url: str, label: str) -> str:
    return f'<a href="{escape(url, {chr(34): "&quot;"})}" color="#a14c2a">{safe(label)}</a>'


def _plane(c: canvas.Canvas) -> None:
    """Draw the SVG path. Only the commands the logo uses."""
    path = c.beginPath()
    x = y = 0.0
    for command, raw in re.findall(r"([MLVclvz])([^MLVclvz]*)", PLANE_PATH):
        args = [float(n) for n in re.findall(r"-?\d*\.?\d+", raw)]
        if command == "M":
            x, y = args
            path.moveTo(x, 32 - y)
        elif command == "L":
            x, y = args
            path.lineTo(x, 32 - y)
        elif command == "V":
            y = args[0]
            path.lineTo(x, 32 - y)
        elif command == "v":
            y += args[0]
            path.lineTo(x, 32 - y)
        elif command == "l":
            for i in range(0, len(args), 2):
                x, y = x + args[i], y + args[i + 1]
                path.lineTo(x, 32 - y)
        elif command == "c":
            for i in range(0, len(args), 6):
                a = args[i:i + 6]
                path.curveTo(x + a[0], 32 - (y + a[1]), x + a[2], 32 - (y + a[3]), x + a[4], 32 - (y + a[5]))
                x, y = x + a[4], y + a[5]
        elif command == "z":
            path.close()
    c.drawPath(path, stroke=0, fill=1)


def draw_logo(c: canvas.Canvas, x: float, y: float, size: float) -> None:
    c.saveState()
    c.translate(x, y)
    c.scale(size / 32, size / 32)
    c.setFillColor(CLAY)
    c.roundRect(0, 0, 32, 32, 8, stroke=0, fill=1)
    c.setFillColor(PAPER)
    c.translate(16, 16)
    c.rotate(-45)  # The y axis is flipped from the SVG, so its +45 turn becomes -45.
    c.translate(-16, -16)
    _plane(c)
    c.restoreState()


class Masthead(Flowable):
    def __init__(self, width: float):
        super().__init__()
        self.width, self.height = width, 22

    def draw(self):
        c = self.canv
        draw_logo(c, 0, 1, 20)
        c.setFillColor(INK)
        c.setFont(BOLD, 12)
        c.drawString(27, 6, "Travelust")
        c.setFillColor(SUBTLE)
        c.setFont(REGULAR, 9)
        c.drawRightString(self.width, 6, "Trip plan")


class Number(Flowable):
    """A numbered dot, matching the pins on the plan screen."""

    def __init__(self, number: int, color=CLAY, size: float = 16):
        super().__init__()
        self.number, self.size, self.color = number, size, color
        self.width = self.height = size

    def draw(self):
        c = self.canv
        c.setFillColor(self.color)
        c.circle(self.size / 2, self.size / 2, self.size / 2, stroke=0, fill=1)
        c.setFillColor(PAPER)
        c.setFont(BOLD, self.size * 0.56)
        c.drawCentredString(self.size / 2, self.size * 0.3, str(self.number))


class TripMap(Flowable):
    """Pins and routes in vector over a map image, so they stay crisp in print. With no image
    (tiles unreachable), it draws the same pins on a plain panel, in their true positions."""

    def __init__(self, view: staticmap.View, image: bytes | None, pins: list[dict], routes: list[list[dict]], width: float, height: float):
        super().__init__()
        self.view, self.image, self.pins, self.routes = view, image, pins, routes
        self.width, self.height = width, height

    def _at(self, pin: dict) -> tuple[float, float]:
        x, y = self.view.pixel(pin["lat"], pin["lng"])
        return x / self.view.width * self.width, self.height - y / self.view.height * self.height

    def draw(self):
        c = self.canv
        c.saveState()
        outline = c.beginPath()
        outline.roundRect(0, 0, self.width, self.height, 6)
        c.clipPath(outline, stroke=0, fill=0)
        if self.image:
            c.drawImage(ImageReader(io.BytesIO(self.image)), 0, 0, self.width, self.height)
        else:
            c.setFillColor(PANEL)
            c.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        for route in self.routes:
            points = [self._at(pin) for pin in route]
            for width, color, dash in ((2.6, PAPER, None), (1.3, route[0]["color"], (3, 2.5))):
                c.setLineWidth(width)
                c.setStrokeColor(color)
                if dash:
                    c.setDash(*dash)
                else:
                    c.setDash()
                for start, end in zip(points, points[1:]):
                    c.line(*start, *end)
        c.setDash()
        for pin in self.pins:
            x, y = self._at(pin)
            c.setFillColor(pin["color"])
            c.setStrokeColor(PAPER)
            c.setLineWidth(1)
            c.circle(x, y, 7, stroke=1, fill=1)
            c.setFillColor(PAPER)
            c.setFont(BOLD, 7.5)
            c.drawCentredString(x, y - 2.7, str(pin["label"]))
        if self.image:
            credit = "© OpenStreetMap contributors"
            width = c.stringWidth(credit, REGULAR, 6)
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.8))
            c.rect(self.width - width - 6, 0, width + 6, 9, stroke=0, fill=1)
            c.setFillColor(MUTED)
            c.setFont(REGULAR, 6)
            c.drawString(self.width - width - 3, 2.6, credit)
        c.restoreState()
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.roundRect(0, 0, self.width, self.height, 6, stroke=1, fill=0)


class _NumberedCanvas(canvas.Canvas):
    """Holds pages until the end, so the footer can say how many there are."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for page in self._pages:
            # Restoring a page would rewind this counter and clash with the footer's links.
            annotations = self._annotationCount
            self.__dict__.update(page)
            self._annotationCount = annotations
            self._footer(total)
            super().showPage()
        super().save()

    def _footer(self, total: int) -> None:
        y = 10 * mm
        self.setStrokeColor(RULE)
        self.setLineWidth(0.5)
        self.line(MARGIN, y + 11, A4[0] - MARGIN, y + 11)
        draw_logo(self, MARGIN, y - 1.5, 9)
        self.setFont(REGULAR, 8)
        self.setFillColor(SUBTLE)
        self.drawString(MARGIN + 13, y, "Created with Travelust")
        width = self.stringWidth("Created with Travelust", REGULAR, 8)
        self.linkURL(f"https://{SITE}", (MARGIN + 13, y - 2, MARGIN + 13 + width, y + 8), relative=0)
        self.setFillColor(SUBTLE)
        self.drawRightString(A4[0] - MARGIN, y, f"Page {self._pageNumber} of {total}")


def _year(iso: str) -> str:
    return iso[:4]


def _heading(card: dict) -> tuple[str, str]:
    brief, days = card["brief"], card["days"]
    origin = brief.get("origin_label")
    title = f"{origin} to {card['city']}" if origin else f"{len(days)} days in {card['city']}"
    bits = []
    if days:
        span = days[0]["label"] if len(days) == 1 else f"{days[0]['label']} to {days[-1]['label']}"
        bits.append(f"{span} {_year(days[-1]['date'])}")
        bits.append(f"{len(days)} day{'s' if len(days) != 1 else ''}")
    total = brief["adults"] + brief["children"] + brief["infants"]
    bits.append(f"{total} traveller{'s' if total != 1 else ''}")
    return title, ", ".join(bits)


def _leg(title: str, flight: dict) -> list:
    rows = [[Paragraph(f"{title}, {safe(_short(flight['depart_at']))}", _style("legt", 10, MEDIUM)), Paragraph(f"{duration(flight['duration_min'])}, {_stops(flight['stops'])}", RIGHT)]]
    table = [Table(rows, colWidths=[WIDTH * 0.6, WIDTH * 0.4 - 16], style=_flat())]
    layovers = flight.get("layovers") or []
    for index, segment in enumerate(flight["segments"]):
        number = segment.get("flight_number") or ""
        code = segment.get("airline_code") or ""
        name = f"{segment['airline']} {code} {number}".strip()
        extra = ", ".join(x for x in (duration(segment["duration_min"]), segment.get("aircraft")) if x)
        row = [
            Paragraph(f"<b>{clock(segment['depart_at'])}</b> {safe(segment['from_code'])} to <b>{clock(segment['arrive_at'])}</b> {safe(segment['to_code'])}", BODY),
            Paragraph(f"{safe(name)}<br/><font color='#7f7a6c'>{safe(extra)}</font>", SMALL),
        ]
        table.append(Table([row], colWidths=[WIDTH * 0.5, WIDTH * 0.5 - 16], style=_flat(top=1.5)))
        if index < len(layovers):
            stop = layovers[index]
            place = stop.get("city") or stop.get("name") or stop.get("airport")
            text = f"Layover {duration(stop['duration_min'])} in {safe(place)}{', overnight' if stop.get('overnight') else ''}"
            table.append(Paragraph(text, _style("lay", 8.5, REGULAR, SUBTLE, leftIndent=6, spaceBefore=1, spaceAfter=1)))
    return table


def _short(iso: str) -> str:
    from .trip import pretty_date

    return pretty_date(iso)


def _stops(count: int) -> str:
    return "nonstop" if not count else f"{count} stop{'s' if count > 1 else ''}"


def _flat(top: float = 0) -> TableStyle:
    return TableStyle(
        [
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), top),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]
    )


def _flights(card: dict) -> list:
    booking = card.get("booking")
    if not booking:
        return [Paragraph("Flights", H2), Paragraph("No flights chosen yet.", SMALL), Spacer(1, 12)]
    rows = _leg("Outbound", booking["outbound"])
    if booking.get("inbound"):
        rows += [Spacer(1, 7), HRFlowable(width="100%", thickness=0.5, color=RULE), Spacer(1, 7), *_leg("Return", booking["inbound"])]
    brief = booking["brief"]
    total = brief["adults"] + brief["children"] + brief["infants"]
    price = booking["offers"][0]["price"] if booking.get("offers") else booking["total"]
    rows += [
        Spacer(1, 7),
        HRFlowable(width="100%", thickness=0.5, color=RULE),
        Spacer(1, 7),
        Table(
            [[
                Paragraph(f"<b>{money(price, booking['currency'])}</b> for {total} traveller{'s' if total != 1 else ''}. Fare when planned. It can change until you pay.", BODY),
                Paragraph(link(booking["google_link"], "Book on Google Flights"), RIGHT),
            ]],
            colWidths=[WIDTH * 0.68, WIDTH * 0.32 - 16],
            style=_flat(),
        ),
    ]
    box = Table([[rows]], colWidths=[WIDTH], style=TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [Paragraph("Flights", H2), box, Spacer(1, 14)]


def _day_colour(index: int) -> colors.Color:
    return colors.HexColor(DAY_COLOURS[(index - 1) % len(DAY_COLOURS)])


def _glance(card: dict, trip_map: Flowable | None) -> list:
    rows = []
    gap = 12
    table_width = WIDTH - (TRIP_MAP_SIZE[0] + gap if trip_map else 0)
    for day in card["days"]:
        count = len(day["stops"])
        rows.append([
            Paragraph(f"Day {day['index']}", _style("g1", 9.5, BOLD, _day_colour(day["index"]))),
            Paragraph(safe(day["label"]), SMALL),
            Paragraph(safe(day["title"]), BODY),
            Paragraph(f"{count} stop{'s' if count != 1 else ''}" if count else "Travel", _style("g4", 8.5, REGULAR, MUTED, alignment=TA_RIGHT)),
        ])
    table = Table(rows, colWidths=[36, 66, table_width - 36 - 66 - 42, 42], style=TableStyle([
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    prefs = card["prefs"]
    labels = card.get("interest_labels", {})
    parts = [
        STYLE_LABELS.get(prefs.get("style") or "balanced")[0],
        SPOT_LABELS.get(prefs.get("spots") or "mixed")[0],
        *[labels.get(key, key) for key in prefs.get("interests") or []],
    ]
    intro = [Paragraph("Your days at a glance", H2), Paragraph(safe(", ".join(parts)), SMALL), Spacer(1, 5)]
    if not trip_map:
        return [*intro, table]
    both = Table(
        [[[table], trip_map]],
        colWidths=[table_width + gap, TRIP_MAP_SIZE[0]],
        style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (0, 0), gap), ("RIGHTPADDING", (1, 0), (1, 0), 0), ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]),
    )
    return [*intro, both]


def _stop_rows(day: dict) -> list:
    flow = []
    for stop in day["stops"]:
        if stop.get("travel"):
            travel = stop["travel"]
            how = "walk" if travel["mode"] == "walk" else "by transit or taxi"
            hint = Paragraph(f"About {travel['min']} min {how} ({travel['km']} km)", _style("trv", 8, REGULAR, SUBTLE, leftIndent=74, spaceBefore=2, spaceAfter=2))
        else:
            hint = None
        meta = [CATEGORY[stop["category"]]]
        if stop.get("area"):
            meta.append(safe(stop["area"]))
        lines = [Paragraph(safe(stop["name"]), NAME), Paragraph(", ".join(meta), TINY)]
        note = stop.get("note") or stop.get("summary")
        if note:
            lines.append(Paragraph(safe(whole_sentences(note, 240)), _style("nt", 9, REGULAR, MUTED, spaceBefore=1.5)))
        if stop.get("hours_warning"):
            lines.append(Paragraph(f"{safe(stop['hours_warning'])}, so check this time.", _style("hw", 8.5, MEDIUM, CLAY, spaceBefore=1.5)))
        facts = [f"Hours: {safe(stop['hours'])}" if stop.get("hours") else None, f"Price: {safe(stop['price'])}" if stop.get("price") else None, safe(stop["address"]) if stop.get("address") else None]
        facts = [fact for fact in facts if fact]
        facts.append(link(stop["maps_url"], "Google Maps"))
        lines.append(Paragraph("  |  ".join(facts), _style("fx", 8, REGULAR, SUBTLE, spaceBefore=1.5)))
        row = Table(
            [[Paragraph(stop["time"], TIME), Number(stop["number"], _day_colour(day["index"])), lines]],
            colWidths=[50, 24, WIDTH - 74],
            style=_flat(),
        )
        flow.append([*([hint] if hint else []), row, Spacer(1, 3)])
    return flow


def _day(day: dict, day_map: Flowable | None) -> list:
    colour = _day_colour(day["index"])
    hex_colour = DAY_COLOURS[(day["index"] - 1) % len(DAY_COLOURS)]
    heading = [Paragraph(f"Day {day['index']}, {safe(day['label'])}", _style("dtag", 9, MEDIUM, colour)), Paragraph(safe(day["title"]), DAY_TITLE)]
    if day.get("route_url"):
        heading.append(Paragraph(link(day["route_url"], "Open this day's route in Google Maps"), _style("rt", 8.5, REGULAR, spaceBefore=3)))
    # The stops in order, as a key to the map beside them.
    if day_map:
        heading.append(Spacer(1, 7))
        for stop in day["stops"]:
            heading.append(Paragraph(
                f'<font name="{BOLD}" color="{hex_colour}">{stop["number"]}</font>&nbsp;&nbsp;{safe(stop["name"])} <font color="#7f7a6c">{safe(stop["time"])}</font>',
                _style("key", 8.5, leading=12.5),
            ))
    if day_map:
        top = Table([[heading, day_map]], colWidths=[WIDTH - DAY_MAP_SIZE[0], DAY_MAP_SIZE[0]], style=_flat())
    else:
        top = Table([[heading]], colWidths=[WIDTH], style=_flat())
    flow = [HRFlowable(width="100%", thickness=1.4, color=colour, spaceAfter=6), top, Spacer(1, 9)]
    if day.get("before"):
        flow.append(Paragraph(safe(day["before"]), _style("anc", 9, MEDIUM, CLAY, spaceAfter=5, backColor=CLAY_SOFT, borderPadding=(3, 5, 3, 5), leftIndent=5, rightIndent=5)))
        flow.append(Spacer(1, 3))
    head = flow
    rows = _stop_rows(day)
    tail = []
    if day.get("over_by_min"):
        tail.append(Paragraph(f"This day runs past {safe(day['must_end_at'])}. You may want to drop a stop.", _style("ov", 8.5, MEDIUM, CLAY, spaceBefore=3)))
    if day.get("after"):
        tail.append(Spacer(1, 3))
        tail.append(Paragraph(safe(day["after"]), _style("anc2", 9, MEDIUM, CLAY, backColor=CLAY_SOFT, borderPadding=(3, 5, 3, 5), leftIndent=5, rightIndent=5)))
        tail.append(Spacer(1, 3))
    if not rows and not tail:
        tail.append(Paragraph("No stops planned.", SMALL))
    # The heading stays with the first stop, and each stop stays whole. The rest can flow across pages.
    opening = rows[0] if rows else []
    middle = [KeepTogether(row) if isinstance(row, list) else row for row in rows[1:]]
    return [KeepTogether([*head, *opening]), *middle, *tail, Spacer(1, 15)]


def _credits(card: dict) -> list:
    sources = [s for s in card.get("sources", []) if s != "Wikivoyage"]
    text = "Times and travel are estimates. Check opening hours before you go. Place details come from Wikivoyage (CC BY-SA 4.0) and map positions from Wikipedia and OpenStreetMap contributors. Maps © OpenStreetMap contributors."
    if sources:
        text += " Web picks came from a Google Search that read " + safe(", ".join(sources[:5])) + "."
    return [Paragraph(text, TINY)]


def _build_maps(card: dict) -> tuple[Flowable | None, dict[int, Flowable]]:
    """The whole-trip map and one map per day, fetched together so shared tiles load once."""
    day_pins = {}
    for day in card["days"]:
        pins = [
            {"lat": s["lat"], "lng": s["lng"], "label": s["number"], "color": _day_colour(day["index"])}
            for s in day["stops"]
            if s.get("lat") is not None
        ]
        if pins:
            day_pins[day["index"]] = pins
    if not day_pins:
        return None, {}

    every = [{**pin, "label": index} for index, pins in day_pins.items() for pin in pins]
    size = lambda box: (box[0] * PIXELS_PER_POINT, box[1] * PIXELS_PER_POINT)
    requests = [([(p["lat"], p["lng"]) for p in every], *size(TRIP_MAP_SIZE))]
    requests += [([(p["lat"], p["lng"]) for p in pins], *size(DAY_MAP_SIZE)) for pins in day_pins.values()]
    results = staticmap.render_many(requests)

    trip_map = TripMap(*results[0], every, [], *TRIP_MAP_SIZE)
    day_maps = {index: TripMap(*result, pins, [pins], *DAY_MAP_SIZE) for (index, pins), result in zip(day_pins.items(), results[1:])}
    return trip_map, day_maps


def file_name(card: dict) -> str:
    city = re.sub(r"[^a-z0-9]+", "-", card["city"].lower()).strip("-") or "trip"
    return f"{city}-trip-plan.pdf"


def render(card: dict) -> bytes:
    buffer = io.BytesIO()
    title, subtitle = _heading(card)
    doc = BaseDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=15 * mm,
        bottomMargin=19 * mm,
        title=f"{title}: trip plan",
        author="Travelust",
        creator="Travelust",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame])])
    story = [Masthead(WIDTH), Spacer(1, 16), Paragraph(safe(title), TITLE), Spacer(1, 4), Paragraph(safe(subtitle), SUB), Spacer(1, 16)]
    trip_map, day_maps = _build_maps(card)
    story += _flights(card)
    story += _glance(card, trip_map)
    story.append(Spacer(1, 20))
    for day in card["days"]:
        story += _day(day, day_maps.get(day["index"]))
    story += _credits(card)
    doc.build(story, canvasmaker=_NumberedCanvas)
    return buffer.getvalue()
