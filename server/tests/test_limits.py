import httpx

from app import limits
from app import main


class FakeCounts:
    def __init__(self):
        self.counts = {}

    async def __call__(self, pool, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]


async def test_no_database_means_no_limits():
    assert await limits.check(None, "1.2.3.4") is None


async def test_one_visitor_hits_their_own_limit_without_blocking_others(monkeypatch):
    monkeypatch.setattr(limits, "_hit", FakeCounts())
    for _ in range(limits.VISITOR_TURNS_PER_HOUR):
        assert await limits.check("pool", "1.1.1.1") is None
    assert await limits.check("pool", "1.1.1.1") == limits.VISITOR_MESSAGE
    assert await limits.check("pool", "2.2.2.2") is None


async def test_site_limit_applies_across_visitors(monkeypatch):
    fake = FakeCounts()
    fake.counts["site"] = limits.SITE_TURNS_PER_HOUR
    monkeypatch.setattr(limits, "_hit", fake)
    assert await limits.check("pool", "3.3.3.3") == limits.SITE_MESSAGE


async def test_database_failure_does_not_take_the_demo_down(monkeypatch):
    async def broken(pool, key):
        raise RuntimeError("database is asleep")

    monkeypatch.setattr(limits, "_hit", broken)
    assert await limits.check("pool", "4.4.4.4") is None


def test_ips_are_not_stored_in_the_clear():
    assert "1.2.3.4" not in limits.visitor_key("1.2.3.4")


async def test_api_returns_429_with_a_readable_message(monkeypatch):
    async def over_limit(pool, ip):
        return limits.VISITOR_MESSAGE

    monkeypatch.setattr(limits, "check", over_limit)
    main.app.state.pool = None
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/turn", json={"type": "text", "text": "hi"})
    assert res.status_code == 429
    assert res.json()["detail"] == limits.VISITOR_MESSAGE
