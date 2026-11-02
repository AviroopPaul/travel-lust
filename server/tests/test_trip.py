import io
from datetime import date, timedelta

import httpx
import pytest
from PIL import Image

from app import airports, pdf, staticmap, trip
from app.models import Brief, TripPrefs
from app.places import web, wikivoyage


@pytest.fixture(autouse=True)
def no_real_tiles(monkeypatch):
    """No test reaches OpenStreetMap. By default tiles fail, which draws the plain panel."""
    def offline(zoom, x, y):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(staticmap, "_download", offline)
    staticmap._tile.cache_clear()


def fake_tile(calls):
    def download(zoom, x, y):
        calls.append((zoom, x, y))
        out = io.BytesIO()
        Image.new("RGB", (256, 256), (120, 160, 120)).save(out, format="PNG")
        return out.getvalue()

    return download


def place(id, lat=35.0, lng=135.7, category="see", tags=None, fame=None, area="East", tier=None):
    return {
        "id": id,
        "name": f"Place {id}",
        "category": category,
        "area": area,
        "lat": lat,
        "lng": lng,
        "summary": "A nice place.",
        "hours": None,
        "price": None,
        "address": None,
        "url": None,
        "image": None,
        "wikidata": None,
        "fame": fame,
        "tier": tier,
        "tags": tags or [],
        "source": "wikivoyage",
    }


def flight(depart_at, arrive_at, from_code="CCU", to_code="KIX"):
    return {
        "depart_at": depart_at,
        "arrive_at": arrive_at,
        "price": 50000,
        "duration_min": 600,
        "stops": 0,
        "layovers": [],
        "segments": [
            {
                "airline": "ANA",
                "airline_code": "NH",
                "flight_number": "12",
                "from_code": from_code,
                "to_code": to_code,
                "depart_at": depart_at,
                "arrive_at": arrive_at,
                "duration_min": 600,
                "aircraft": None,
            }
        ],
    }


BRIEF = Brief(destination=["KIX"], destination_label="Kyoto", outbound_date="2027-03-10", return_date="2027-03-14", adults=2)


def test_flights_set_the_hours_of_the_first_and_last_day():
    days = trip.skeleton(BRIEF, TripPrefs(style="balanced"), flight("2027-03-09T22:00", "2027-03-10T14:00"), flight("2027-03-14T15:30", "2027-03-14T22:00", "KIX", "CCU"))
    assert [d["date"] for d in days] == ["2027-03-10", "2027-03-11", "2027-03-12", "2027-03-13", "2027-03-14"]
    assert days[0]["start"] == 14 * 60 + 150
    assert "Land at KIX at 2:00 pm" in days[0]["before"]
    assert days[-1]["end"] == 15 * 60 + 30 - 210
    assert "Leave for KIX by 12:00 pm" in days[-1]["after"]
    assert days[1]["open"] and days[1]["start"] == 9 * 60 + 30


def test_a_late_landing_and_an_early_flight_leave_no_stops():
    days = trip.skeleton(BRIEF, TripPrefs(style="balanced"), flight("2027-03-09T22:00", "2027-03-10T23:00"), flight("2027-03-14T06:00", "2027-03-14T12:00", "KIX", "CCU"))
    assert not days[0]["open"] and not days[-1]["open"]
    assert trip.capacity(days[0], "balanced") == 0


def test_a_flight_just_after_midnight_means_leaving_the_evening_before():
    days = trip.skeleton(BRIEF, TripPrefs(style="balanced"), None, flight("2027-03-14T01:00", "2027-03-14T12:00", "KIX", "CCU"))
    assert not days[-1]["open"]
    assert "the evening before" in days[-1]["after"]


def test_style_changes_how_much_fits_in_a_day():
    day = {"open": True, "start": 9 * 60, "end": 20 * 60}
    assert trip.capacity(day, "leisure") < trip.capacity(day, "balanced") < trip.capacity(day, "physical")


def test_top_and_hidden_rank_opposite_ways():
    famous, quiet = place("a", fame=40), place("b", fame=2)
    top, hidden = TripPrefs(spots="top"), TripPrefs(spots="hidden")
    assert trip.score(famous, top) > trip.score(quiet, top)
    assert trip.score(quiet, hidden) > trip.score(famous, hidden)


def test_nearest_airports_prefer_international_ones():
    assert airports.nearest(35.01, 135.77) == ["ITM", "KIX"]
    assert airports.nearest(0.0, -160.0) == []
    assert airports.resolve("Kyoto", ["UKY"]) == ([], "Kyoto")


def test_build_days_ignores_invented_ids_and_never_repeats_a_place():
    pool = [place(f"p{i}", lat=35 + i * 0.002) for i in range(10)] + [place("meal", category="eat"), place("meal2", category="eat")]
    frames = trip.skeleton(BRIEF, TripPrefs(style="balanced"))
    composed = [
        {"day": 1, "title": "One", "stops": [{"place_id": "p1", "note": "Good"}, {"place_id": "made_up", "note": "Fake"}]},
        {"day": 2, "title": "Two", "stops": [{"place_id": "p1", "note": "Repeat"}]},
    ]
    days = trip.build_days(composed, frames, pool, TripPrefs(style="balanced"))
    ids = [s["place_id"] for d in days for s in d["stops"]]
    assert "made_up" not in ids
    assert len(ids) == len(set(ids))
    assert days[0]["title"] == "One"
    assert any(p == "p1" for p in [s["place_id"] for s in days[0]["stops"]])


def test_adding_a_meal_never_goes_past_what_the_day_allows():
    pool = [place(f"p{i}", lat=35 + i * 0.002) for i in range(10)] + [place("meal", category="eat"), place("meal2", category="eat")]
    prefs = TripPrefs(style="leisure")
    frames = trip.skeleton(BRIEF, prefs)
    composed = [{"day": 1, "title": "One", "stops": [{"place_id": f"p{i}", "note": None} for i in range(3)]}]
    day = trip.build_days(composed, frames, pool, prefs)[0]
    assert len(day["stops"]) == trip.capacity(frames[0], "leisure") == 3
    assert "meal" in [s["place_id"] for s in day["stops"]] or "meal2" in [s["place_id"] for s in day["stops"]]


def test_lunch_falls_around_noon_without_any_model():
    pool = [place(f"p{i}", lat=35 + i * 0.002) for i in range(4)] + [place("meal", category="eat")]
    prefs = TripPrefs(style="balanced")
    frames = trip.skeleton(BRIEF, prefs)
    days = trip.build_days(None, frames, pool, prefs)
    done = trip.schedule(days, frames, pool, prefs, "Kyoto")
    meal = next(s for s in done[0]["stops"] if s["category"] == "eat")
    assert meal["time"].endswith("pm") and meal["time"].startswith(("12:", "1:"))
    assert done[0]["stops"][0]["travel"] is None
    assert done[0]["stops"][1]["travel"]["min"] >= 5


def test_schedule_flags_a_day_that_runs_past_the_flight():
    pool = [place(f"p{i}", lat=35 + i * 0.05, category="do") for i in range(6)]
    prefs = TripPrefs(style="balanced")
    frames = trip.skeleton(BRIEF, prefs, None, flight("2027-03-14T15:00", "2027-03-14T22:00", "KIX", "CCU"))
    last = frames[-1]
    days = [{"index": last["index"], "date": last["date"], "title": "Last", "stops": [{"place_id": p["id"], "note": None} for p in pool]}]
    done = trip.schedule(days, frames, pool, prefs, "Kyoto")
    assert done[0]["over_by_min"] > 0 and done[0]["must_end_at"] == "11:30 am"


def test_edits_change_only_what_was_asked():
    pool = [place("a"), place("b"), place("c"), place("d", category="eat"), place("spare")]
    days = [
        {"index": 1, "date": "2027-03-10", "title": "One", "stops": [{"place_id": "a", "note": None}, {"place_id": "b", "note": None}, {"place_id": "d", "note": None}]},
        {"index": 2, "date": "2027-03-11", "title": "Two", "stops": [{"place_id": "c", "note": None}]},
    ]
    ids = lambda plan, i: [s["place_id"] for s in plan[i]["stops"]]
    assert ids(trip.apply_op(days, {"action": "swap", "place_id": "a", "new_place_id": "spare"}, pool), 0) == ["spare", "b", "d"]
    assert ids(trip.apply_op(days, {"action": "remove", "place_id": "b"}, pool), 0) == ["a", "d"]
    assert ids(trip.apply_op(days, {"action": "shift", "place_id": "b", "delta": -1}, pool), 0) == ["b", "a", "d"]
    moved = trip.apply_op(days, {"action": "move", "place_id": "c", "day": 1}, pool)
    assert ids(moved, 0) == ["a", "b", "c", "d"] and ids(moved, 1) == []
    assert ids(trip.apply_op(days, {"action": "add", "day": 2, "new_place_id": "spare"}, pool), 1) == ["c", "spare"]
    # A place already in the plan or an unknown id changes nothing.
    assert trip.apply_op(days, {"action": "swap", "place_id": "a", "new_place_id": "c"}, pool) == days
    assert trip.apply_op(days, {"action": "swap", "place_id": "a", "new_place_id": "nope"}, pool) == days
    assert ids(days, 0) == ["a", "b", "d"], "the original must not be changed"


def test_maps_links_are_official_urls():
    assert trip.maps_link(place("a"), "Kyoto").startswith("https://www.google.com/maps/search/?api=1&query=Place%20a")
    link = trip.route_link([place("a"), place("b", lat=35.1), place("c", lat=35.2)])
    assert link.startswith("https://www.google.com/maps/dir/?api=1&origin=") and "waypoints=" in link
    assert trip.route_link([place("a")]) is None


SAMPLE = """
==See==
* {{see | name=Bamboo Forest | alt=Kyoto [[bamboo|grove]] | url=https://example.org | lat=35.0168 | long=135.6716
| hours=Always open | price=Free | image=Bamboo Forest.jpg | wikidata=Q1 | content=Walk the '''famous''' path — go early. See [[Tenryu-ji|the temple]] nearby.
}}
* {{do| name=Daimonji hike | lat=35.02 | long=135.80 | content=A hike with {{km|3}} of trail. }}
* {{see | name=No coordinates | content=Dropped because it cannot go on a map. }}
* {{listing | type=eat | name=Noodle Bar | lat=35.03 | long=135.71 | content=Good noodles. }}
* {{sleep | name=A hotel | lat=35.0 | long=135.7 }}
"""


def test_wikivoyage_listings_are_parsed_and_cleaned():
    places = wikivoyage.parse_listings(SAMPLE, "Arashiyama")
    assert [p["name"] for p in places] == ["Bamboo Forest", "Daimonji hike", "Noodle Bar"]
    forest = places[0]
    assert forest["summary"] == "Walk the famous path, go early. See the temple nearby."
    assert forest["area"] == "Arashiyama" and forest["price"] == "Free"
    assert forest["image"].endswith("Bamboo_Forest.jpg?width=200")
    assert "nature" in forest["tags"]
    assert "active" in places[1]["tags"]
    assert "food" in places[2]["tags"] and places[2]["category"] == "eat"


def test_long_text_stops_at_a_sentence_end():
    text = "This is the first sentence of it. This second one goes on for a long while."
    assert wikivoyage.whole_sentences(text, 50) == "This is the first sentence of it."
    assert wikivoyage.whole_sentences("Short.", 50) == "Short."
    assert wikivoyage.whole_sentences("one long clause without any stop at all in it", 20) == "one long clause..."


def test_a_cafe_at_the_end_of_the_day_does_not_wait_for_dinner():
    pool = [place("a", category="do"), place("b", category="do", lat=35.001), place("c", category="do", lat=35.002), place("cafe", category="eat") | {"name": "Coffee Corner"}, place("meal", category="eat") | {"name": "Noodles"}]
    prefs = TripPrefs(style="balanced")
    frames = trip.skeleton(BRIEF, prefs)
    def last_stop(name):
        days = [{"index": 2, "date": frames[1]["date"], "title": "T", "stops": [{"place_id": i, "note": None} for i in ("a", "b", "c", name)]}]
        return trip.schedule(days, frames, pool, prefs, "Kyoto")[0]["stops"][-1]["time"]
    assert last_stop("meal") == "6:30 pm"
    assert last_stop("cafe") != "6:30 pm"


def test_a_stop_outside_its_hours_is_flagged():
    assert trip.hours_warning("17:00-00:00 (last order 23:00)", 12 * 60 + 35) == "Opens at 5:00 pm"
    assert trip.hours_warning("Daily 09:00-16:00", 16 * 60 + 30) == "Closes at 4:00 pm"
    assert trip.hours_warning("Daily 09:00-16:00", 11 * 60) is None
    assert trip.hours_warning("17:00-02:00", 23 * 60) is None, "open past midnight"
    assert trip.hours_warning("Mar-Oct: 08:30-17:30; Nov-Feb: 08:30-17:00", 18 * 60) is None, "seasonal text is left alone"
    assert trip.hours_warning(None, 600) is None


def test_region_pages_point_to_their_towns():
    text = "==Regions==\nx\n==Cities==\n* [[Ubud]] is nice\n* [[Kuta (Bali)|Kuta]]\n==Other destinations==\n*[[Nusa Lembongan]]\n==Understand==\n[[Java]]"
    assert wikivoyage.linked_destinations(text) == ["Ubud", "Kuta (Bali)", "Nusa Lembongan"]


def test_web_answers_are_parsed_line_by_line():
    text = "Here you go\nName | Neighbourhood | Type | Tier | Reason\nGio-ji | Arashiyama | Temple | hidden | A quiet moss garden.\nCafe Mo | Gion | cafe | famous | Good coffee.\nnot a row"
    places = web.parse_lines(text)
    assert [p["name"] for p in places] == ["Gio-ji", "Cafe Mo"]
    assert places[0]["tier"] == "hidden" and places[0]["category"] == "see"
    assert places[1]["category"] == "eat"


def test_a_web_pick_already_in_the_guide_is_not_added_twice():
    guide = [place("a") | {"name": "Fushimi Inari Shrine"}]
    picks = [place("x") | {"name": "Fushimi Inari", "tier": "famous", "summary": "Famous gates."}, place("y") | {"name": "Gio-ji Temple", "tier": "hidden"}]
    merged, fresh = web.merge(guide, picks)
    assert [p["name"] for p in fresh] == ["Gio-ji Temple"]
    assert merged[0]["tier"] == "famous" and merged[0]["web_note"] == "Famous gates."


def card(with_flights=True):
    pool = [place(f"p{i}", lat=35 + i * 0.01, lng=135.7 + i * 0.01) | {"name": f"Kinkaku-ji & Tō-ji 金閣寺 {i}", "hours": "9-5", "price": "¥500"} for i in range(8)]
    prefs = TripPrefs(style="balanced", spots="mixed", interests=["food"])
    outbound = flight("2027-03-09T22:00", "2027-03-10T14:00")
    inbound = flight("2027-03-14T15:30", "2027-03-14T22:00", "KIX", "CCU")
    frames = trip.skeleton(BRIEF, prefs, outbound if with_flights else None, inbound if with_flights else None)
    days = trip.build_days(None, frames, pool, prefs)
    booking = {"brief": BRIEF.model_dump(), "outbound": outbound, "inbound": inbound, "total": 125000, "currency": "INR", "offers": [], "google_link": "https://www.google.com/travel/flights/booking?tfs=a&b=c"}
    return {
        "kind": "itinerary",
        "brief": {**BRIEF.model_dump(), "origin_label": "Kolkata"},
        "prefs": prefs.model_dump(),
        "city": "Kyoto",
        "days": trip.schedule(days, frames, pool, prefs, "Kyoto"),
        "spare": [],
        "sources": ["Wikivoyage", "kyoto.travel"],
        "booking": booking if with_flights else None,
        "interest_labels": {"food": "Food and drink"},
    }


def test_pdf_renders_with_and_without_flights():
    for with_flights in (True, False):
        data = pdf.render(card(with_flights))
        assert data.startswith(b"%PDF") and len(data) > 5000
    assert pdf.file_name(card()) == "kyoto-trip-plan.pdf"


def test_pdf_days_flow_on_without_forcing_a_page_each():
    long_trip = card()
    long_trip["days"] = long_trip["days"][1:3] * 4
    pages = pdf.render(long_trip).count(b"/Type /Page\n")
    assert pages < len(long_trip["days"]), "days must share pages, not take one each"


def test_pdf_has_real_map_images_with_every_pin_inside_them(monkeypatch):
    calls = []
    monkeypatch.setattr(staticmap, "_download", fake_tile(calls))
    data = pdf.render(card())
    assert b"/Subtype /Image" in data, "the map must be an image, not only dots"
    assert calls and len(calls) == len(set(calls)), "shared tiles are fetched once"

    points = [(35.0, 135.7), (35.03, 135.76), (35.07, 135.72)]
    view = staticmap.fit(points, 504, 276)
    for lat, lng in points:
        x, y = view.pixel(lat, lng)
        assert 0 <= x <= 504 and 0 <= y <= 276


def test_a_single_stop_gets_a_street_level_map():
    view = staticmap.fit([(35.0, 135.7)], 504, 276)
    assert view.zoom == staticmap.MAX_ZOOM
    assert view.pixel(35.0, 135.7) == pytest.approx((252, 138), abs=1)


def test_pdf_still_renders_when_map_tiles_are_unreachable():
    data = pdf.render(card())
    assert data.startswith(b"%PDF") and b"/Subtype /Image" not in data


def test_pdf_text_drops_only_what_the_font_cannot_draw():
    assert pdf.safe("Kinkaku-ji & Tō-ji 金閣寺") == "Kinkaku-ji &amp; Tō-ji"
    assert pdf.money(125000, "INR") == "₹1,25,000"
