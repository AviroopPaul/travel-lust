from app.flights import serpapi


def test_flight_ids_match_google_provider_format():
    row = {"flights": [{"flight_number": "TG 314"}, {"flight_number": "TG 676"}]}
    assert serpapi.flight_ids(row) == "TG314-TG676"


def test_offers_are_sorted_cheapest_first_with_links_ahead_of_phone_only():
    body = {
        "booking_options": [
            {"together": {"book_with": "Airline", "airline": True, "price": 500, "booking_request": {"url": "https://g/clk", "post_data": "u=a"}}},
            {"together": {"book_with": "Phone Agent", "price": 300, "booking_phone": "1-800"}},
            {"together": {"book_with": "Agency", "price": 300, "booking_request": {"url": "https://g/clk", "post_data": "u=b"}}},
            {"together": {"book_with": "No price"}},
        ]
    }
    offers = serpapi.parse_offers(body)
    assert [o.seller for o in offers] == ["Agency", "Phone Agent", "Airline"]
    assert offers[0].url == "https://g/clk"
    assert offers[2].is_airline


def test_parse_row():
    row = {
        "price": 1000,
        "total_duration": 300,
        "layovers": [{"id": "BKK", "name": "Suvarnabhumi", "duration": 60, "overnight": True}],
        "carbon_emissions": {"this_flight": 500000, "typical_for_this_route": 450000},
        "flights": [
            {
                "airline": "THAI",
                "flight_number": "TG 314",
                "duration": 120,
                "departure_airport": {"id": "CCU", "name": "Kolkata", "time": "2026-12-20 23:30"},
                "arrival_airport": {"id": "BKK", "name": "Suvarnabhumi", "time": "2026-12-21 03:30"},
            },
            {
                "airline": "THAI",
                "flight_number": "TG 676",
                "duration": 120,
                "departure_airport": {"id": "BKK", "name": "Suvarnabhumi", "time": "2026-12-21 04:30"},
                "arrival_airport": {"id": "NRT", "name": "Narita", "time": "2026-12-21 12:30"},
            },
        ],
    }
    it = serpapi.parse_row(row, "INR")
    assert it.id == "TG314-TG676"
    assert it.stops == 1 and it.red_eye and it.overnight_layover
    assert it.arrive_day_offset == 1 and it.co2_kg == 500
