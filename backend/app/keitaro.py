"""Thin async client for the Keitaro Admin API."""
from typing import Any

import httpx
from fastapi import HTTPException

from .config import settings


class KeitaroClient:
    def __init__(self) -> None:
        self._http = httpx.AsyncClient(
            base_url=settings.keitaro_api_url.rstrip("/"),
            headers={"Api-Key": settings.keitaro_api_key},
            timeout=30,
        )

    async def request(self, method: str, path: str, **kw: Any) -> Any:
        try:
            r = await self._http.request(method, path, **kw)
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Keitaro unreachable: {e}") from e
        if r.status_code >= 400:
            raise HTTPException(
                r.status_code if r.status_code < 500 else 502,
                f"Keitaro {method} {path}: {r.text[:500]}",
            )
        return r.json() if r.content else None

    def get(self, path: str, **kw: Any):
        return self.request("GET", path, **kw)

    def post(self, path: str, body: Any = None):
        return self.request("POST", path, json=body)

    def put(self, path: str, body: Any = None):
        return self.request("PUT", path, json=body)

    def delete(self, path: str):
        return self.request("DELETE", path)


keitaro = KeitaroClient()
