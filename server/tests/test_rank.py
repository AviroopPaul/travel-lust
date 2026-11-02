from app.flights import rank
from app.models import Filters


def flight(id, price, duration, stops=0, airlines=("ANA",), depart_hour=9, arrive_hour=18, red_eye=False, overnight=False, layovers=()):
    return {
        "id": id,
        "price": price,
        "currency": "INR",
        "duration_min": duration,
        "stops": stops,
        "airlines": list(airlines),
        "airline_codes": ["NH"],
        "depart_hour": depart_hour,
        "arrive_hour": arrive_hour,
        "depart_at": f"2026-12-20T{depart_hour:02d}:00",
        "red_eye": red_eye,
        "overnight_layover": overnight,
        "layovers": list(layovers),
        "co2_kg": 500,
    }


def test_tags_mark_cheapest_and_fastest():
    ranked = rank.tag([flight("a", 100, 600), flight("b", 150, 300), flight("c", 400, 900)])
    by_id = {f["id"]: f for f in ranked}
    assert "cheapest" in by_id["a"]["tags"]
    assert "fastest" in by_id["b"]["tags"]
    assert by_id["b"]["note"] == "5h faster than the cheapest"
    assert by_id["c"]["tags"] == []
    assert by_id["c"]["note"].startswith("Costs more and takes 5h longer")


def test_best_prefers_a_small_premium_for_much_less_time():
    ranked = rank.tag([flight("slow", 100, 1500, stops=2, overnight=True), flight("quick", 110, 500)])
    assert ranked[0]["id"] == "quick"


def test_filters():
    a = flight("a", 100, 600, red_eye=True, depart_hour=2)
    b = flight("b", 200, 400, stops=1, airlines=("Emirates",), layovers=[{"airport": "DXB", "duration_min": 500}])
    assert rank.passes(a, Filters(max_stops=0))
    assert not rank.passes(b, Filters(max_stops=0))
    assert not rank.passes(a, Filters(no_red_eye=True))
    assert not rank.passes(b, Filters(max_price=150))
    assert not rank.passes(b, Filters(airlines_exclude=["emirates"]))
    assert rank.passes(b, Filters(airlines_include=["Emirates"]))
    assert not rank.passes(a, Filters(airlines_include=["Emirates"]))
    assert not rank.passes(b, Filters(avoid_layover_airports=["dxb"]))
    assert not rank.passes(b, Filters(max_layover_min=120))
    assert not rank.passes(a, Filters(depart_after_hour=5))
    assert rank.passes(a, Filters(depart_before_hour=5))


def test_visible_sorts():
    flights = rank.tag([flight("a", 100, 900), flight("b", 300, 300)])
    assert rank.visible(flights, Filters(sort="fastest"))[0]["id"] == "b"
    assert rank.visible(flights, Filters(sort="cheapest"))[0]["id"] == "a"
