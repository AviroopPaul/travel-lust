"""Rate limits for the public demo, counted in Postgres.

Each search sends several requests to Google Flights and each typed message uses Gemini, so
one visitor must not be able to burn the demo for everyone. Visitor IPs are stored only as hashes.
"""

import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 3600
VISITOR_TURNS_PER_HOUR = 40
SITE_TURNS_PER_HOUR = 400

VISITOR_MESSAGE = "You have made a lot of requests. This is a free demo, so please try again in a little while."
SITE_MESSAGE = "This free demo is very busy right now. Please try again in a little while."

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
)
"""

# One statement, so concurrent requests cannot both read the same old count.
HIT = """
INSERT INTO rate_limits (key, count, expires_at)
VALUES (%(key)s, 1, now() + make_interval(secs => %(seconds)s))
ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
    expires_at = CASE WHEN rate_limits.expires_at < now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
RETURNING count
"""

PRUNE = "DELETE FROM rate_limits WHERE expires_at < now() - interval '1 day'"


def visitor_key(ip: str) -> str:
    return "visitor:" + hashlib.sha256(ip.encode()).hexdigest()[:32]


async def setup(pool) -> None:
    async with pool.connection() as conn:
        await conn.execute(CREATE_TABLE)
        await conn.execute(PRUNE)


async def _hit(pool, key: str) -> int:
    async with pool.connection() as conn:
        cursor = await conn.execute(HIT, {"key": key, "seconds": WINDOW_SECONDS})
        row = await cursor.fetchone()
    return row["count"]


async def check(pool, ip: str) -> Optional[str]:
    """Count this request. Returns the message to show if it is over a limit."""
    if pool is None:
        return None
    try:
        if await _hit(pool, visitor_key(ip)) > VISITOR_TURNS_PER_HOUR:
            return VISITOR_MESSAGE
        if await _hit(pool, "site") > SITE_TURNS_PER_HOUR:
            return SITE_MESSAGE
    except Exception:
        # A database hiccup should slow nobody down. The demo stays up without limits for a moment.
        logger.exception("Rate limit check failed")
    return None
