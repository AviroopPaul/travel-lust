"""Questions the agent asks when a required trip detail is missing.

These are plain code, so tapping an option never spends a Gemini request.
"""

from datetime import date, timedelta
from typing import Optional

from .models import Brief

HUBS = {
    "INR": [("Kolkata", "CCU"), ("Delhi", "DEL"), ("Mumbai", "BOM"), ("Bengaluru", "BLR")],
    "GBP": [("London", "LHR,LGW,STN"), ("Manchester", "MAN"), ("Edinburgh", "EDI"), ("Birmingham", "BHX")],
    "EUR": [("Paris", "CDG,ORY"), ("Frankfurt", "FRA"), ("Amsterdam", "AMS"), ("Madrid", "MAD")],
}
DEFAULT_HUBS = [("New York", "JFK,EWR,LGA"), ("San Francisco", "SFO"), ("Chicago", "ORD,MDW"), ("London", "LHR,LGW,STN")]
DESTINATIONS = [
    ("Tokyo", "HND,NRT", "Japan"),
    ("Bali", "DPS", "Indonesia"),
    ("Singapore", "SIN", "Singapore"),
    ("Dubai", "DXB", "UAE"),
]


def _place_option(label: str, codes: str, field: str, description: Optional[str] = None) -> dict:
    return {
        "label": label,
        "description": description or codes.replace(",", ", "),
        "patch": {"brief": {field: codes.split(","), f"{field}_label": label}},
    }


def _next_weekday(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7 or 7)


def _pretty(day: date) -> str:
    return f"{day.strftime('%a')} {day.day} {day.strftime('%b')}"


def _date_options(today: date) -> list[dict]:
    friday = _next_weekday(today, 4)
    choices = [
        ("This coming Friday", friday),
        ("Friday after that", friday + timedelta(days=7)),
        ("In a month", _next_weekday(today + timedelta(days=28), 4)),
    ]
    options = [
        {
            "label": label,
            "description": _pretty(day),
            "patch": {"brief": {"outbound_date": day.isoformat()}},
        }
        for label, day in choices
    ]
    flexible = today + timedelta(days=45)
    options.append(
        {
            "label": "I am flexible",
            "description": f"Compare days around {_pretty(flexible)}",
            "patch": {"brief": {"outbound_date": flexible.isoformat(), "flex_days": 3}},
        }
    )
    return options


def _return_options(outbound: str) -> list[dict]:
    start = date.fromisoformat(outbound)
    options = []
    for label, nights in (("A long weekend", 3), ("One week", 7), ("Two weeks", 14)):
        back = start + timedelta(days=nights)
        options.append(
            {
                "label": label,
                "description": f"Back {_pretty(back)}",
                "patch": {"brief": {"return_date": back.isoformat(), "one_way": False}},
            }
        )
    options.append({"label": "One way", "description": "No return flight", "patch": {"brief": {"one_way": True, "return_date": None}}})
    return options


def next_question(brief: Brief, today: date) -> Optional[dict]:
    """The first missing required detail as a question card, or None when the trip is ready."""
    if not brief.destination:
        return {
            "field": "destination",
            "question": "Where do you want to go?",
            "options": [_place_option(l, c, "destination", d) for l, c, d in DESTINATIONS],
        }
    if not brief.origin:
        hubs = HUBS.get(brief.currency, DEFAULT_HUBS)
        return {
            "field": "origin",
            "question": f"Where are you flying to {brief.destination_label or 'there'} from?",
            "options": [_place_option(l, c, "origin") for l, c in hubs],
        }
    if not brief.outbound_date:
        return {
            "field": "outbound_date",
            "question": "When do you want to leave?",
            "options": _date_options(today),
        }
    if brief.one_way is None or (not brief.one_way and not brief.return_date):
        return {
            "field": "return_date",
            "question": "How long is the trip?",
            "options": _return_options(brief.outbound_date),
        }
    return None
