"""Base interface for external disaster alert ingestion adapters (R-05, D-12)."""

from abc import ABC, abstractmethod
from typing import Any

import httpx


def get_capped(client: httpx.Client, url: str, *, params: dict[str, Any], limit: int) -> tuple[bytes, httpx.URL, str | None]:
    """GET `url` and read at most `limit` bytes of body.

    The body is streamed and the read stops as soon as it passes the limit, so an oversized or
    endless response is never held in memory. Returns (body, final URL after redirects, charset).
    Raises ValueError when the limit is exceeded and httpx errors for HTTP failures.
    """
    with client.stream("GET", url, params=params) as response:
        response.raise_for_status()
        declared = response.headers.get("content-length", "")
        if declared.isdigit() and int(declared) > limit:
            raise ValueError("response exceeded the size limit")
        body = bytearray()
        for chunk in response.iter_bytes():
            body += chunk
            if len(body) > limit:
                raise ValueError("response exceeded the size limit")
        return bytes(body), response.url, response.charset_encoding


class Adapter(ABC):
    """Abstract base class for ingestion adapters."""

    name: str
    kind: str = "alert"

    @abstractmethod
    def fetch(self) -> list[dict[str, Any]]:
        """Fetch and return alerts as standard dictionaries.

        For alert adapters, expected keys include:
          - source_uid (str): Unique external alert ID
          - event_type (str): CYCLONE | URBAN_FLOODING | INDUSTRIAL_FIRE | OTHER
          - severity (str): CRITICAL | HIGH | MEDIUM | LOW
          - area_text (str | None): Description of affected area
          - latitude (float | None): Centroid latitude
          - longitude (float | None): Centroid longitude
          - effective_at (datetime | None): Alert start time
          - expires_at (datetime | None): Alert expiration time
          - raw_payload (dict | None): Raw metadata for audit and display

        Signal adapters return source, source_uid, content_text, language,
        location_text, latitude, longitude, is_simulated, and raw_payload.
        """
        ...

