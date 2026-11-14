"""Bluesky public post search adapter for recent Gujarat hazard posts.

Uses the unauthenticated AppView search endpoint. Only the post text (sanitised, with links and
@mentions removed), its language and creation time are kept. The author's handle, DID, display
name and the post URI are never stored: the source_uid is a one-way hash of the URI, so a
repeated poll updates the same row without recording who wrote it.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.config import get_settings
from app.services.ingest.base import Adapter, get_capped
from app.services.ingest.signals import (
    detect_language,
    locate_gujarat_text,
    mentions_hazard,
    sanitise_signal_text,
    stable_uid,
)

logger = logging.getLogger("drch.ingest.bluesky")

DEFAULT_SEARCH_URL = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"
ALLOWED_HOSTS = {"api.bsky.app", "public.api.bsky.app"}
LOOKBACK = timedelta(hours=24)
RESULTS_PER_QUERY = 50
MAX_RESPONSE_BYTES = 3_000_000
USER_AGENT = "ResQ-DRCH-ingest/1.0"
MENTION_RE = re.compile(r"(?<!\w)@[\w.-]+")

# Broad place-name searches; hazard words are matched locally. Narrow searches such as
# "gujarat flood" return almost nothing within a 24-hour window.
QUERIES = (
    "gujarat", "ahmedabad", "surat", "vadodara", "rajkot", "kutch", "bharuch", "ગુજરાત", "गुजरात",
)


def _created_at(raw: Any) -> datetime | None:
    try:
        value = datetime.fromisoformat(str(raw))  # Python 3.11+ accepts a trailing "Z"
    except ValueError:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def parse_search_response(body: Any, now: datetime | None = None) -> list[dict[str, Any]]:
    """Turn a searchPosts response into signal rows (recent hazard posts about Gujarat only)."""
    now = now or datetime.now(UTC)
    posts = body.get("posts", []) if isinstance(body, dict) else []
    rows: list[dict[str, Any]] = []
    for post in posts:
        if not isinstance(post, dict):
            continue
        record = post.get("record") or {}
        uri = str(post.get("uri") or "")
        if not uri or not isinstance(record, dict):
            continue
        created = _created_at(record.get("createdAt"))
        if created is None or now - created > LOOKBACK:
            continue
        text = sanitise_signal_text(MENTION_RE.sub(" ", str(record.get("text") or "")))
        if not text or not mentions_hazard(text):
            continue
        location = locate_gujarat_text(text)
        if location is None:
            continue
        langs = record.get("langs") if isinstance(record.get("langs"), list) else []
        rows.append({
            "source": "BLUESKY",
            "source_uid": stable_uid("bluesky", uri),
            "content_text": text,
            "language": detect_language(text),
            "location_text": location["location_text"],
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "is_simulated": False,
            "raw_payload": {
                "kind": "social_post",
                "created_at": created.isoformat(),
                "declared_langs": [str(lang)[:10] for lang in langs[:3]],
                "location_precision": "district_centroid" if location["district"] else "none",
            },
        })
    return rows


class BlueskySearchAdapter(Adapter):
    """Search recent public Bluesky posts for Gujarat hazard keywords."""

    name = "BLUESKY"
    kind = "signal"

    def __init__(self, search_url: str | None = None) -> None:
        self.search_url = (search_url or get_settings().bluesky_search_url or DEFAULT_SEARCH_URL).strip()

    def fetch(self) -> list[dict[str, Any]]:
        parsed = urlsplit(self.search_url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError("BLUESKY_SEARCH_URL must be an https Bluesky AppView URL")
        since = (datetime.now(UTC) - LOOKBACK).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows: dict[str, dict[str, Any]] = {}
        failures = 0
        with httpx.Client(timeout=15.0, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
            for query in QUERIES:
                try:
                    body, _, _ = get_capped(client, self.search_url, params={
                        "q": query, "sort": "latest", "since": since, "limit": RESULTS_PER_QUERY,
                    }, limit=MAX_RESPONSE_BYTES)
                    for row in parse_search_response(json.loads(body)):
                        rows.setdefault(row["source_uid"], row)
                except (httpx.HTTPError, ValueError) as exc:
                    failures += 1
                    logger.warning("Bluesky search query failed (%s)", type(exc).__name__)
        if failures == len(QUERIES):
            raise RuntimeError("Every Bluesky search query failed")
        return list(rows.values())
