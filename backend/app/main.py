import re
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, CreatedCampaign, engine, get_db
from .keitaro import keitaro


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Keitaro campaign tool", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------- reference data ----------
@app.get("/api/offers")
async def offers(q: str = ""):
    """Offer search (autocomplete): by name substring or exact id."""
    data = await keitaro.get("/offers")
    q = q.lower().strip()
    out = [
        {"id": o["id"], "name": o["name"], "country": o.get("country") or []}
        for o in data
        if o.get("state", "active") != "deleted"
        and (not q or q in o["name"].lower() or q == str(o["id"]))
    ]
    return out[:50]


async def _resolve_defaults() -> dict:
    """Domain / group / source for new campaigns: pinned in .env, else 'FORTESTS' by name, else first."""
    domains = await keitaro.get("/domains")
    groups = await keitaro.get("/groups", params={"type": "campaigns"})
    sources = await keitaro.get("/traffic_sources")

    def pick(items, pinned, hint=""):
        if pinned is not None:
            for i in items:
                if i["id"] == pinned:
                    return i
            raise HTTPException(500, f"Configured id {pinned} not found in Keitaro")
        for i in items:
            if hint and (i.get("name") or "").upper() == hint:
                return i
        return items[0] if items else None

    active = [d for d in domains if d.get("state", "active") == "active"]
    d = pick(active, settings.default_domain_id)
    g = pick(groups, settings.default_group_id, "FORTESTS")
    s = pick(sources, settings.default_source_id, "FORTESTS")
    if not (d and g and s):
        raise HTTPException(500, "No domain/group/source available in Keitaro")
    return {
        "domain": {"id": d["id"], "name": d["name"]},
        "group": {"id": g["id"], "name": g["name"]},
        "source": {"id": s["id"], "name": s["name"]},
    }


@app.get("/api/meta")
async def meta():
    return await _resolve_defaults()


# ---------- campaign creator ----------
class CampaignCreate(BaseModel):
    name: str = Field(min_length=1)
    geo: str
    offer_id: int

    @field_validator("geo")
    @classmethod
    def _geo(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("geo must be a 2-letter country code")
        return v


def _prefixed(name: str) -> str:
    name = name.strip()
    return name if name.startswith(settings.campaign_prefix) else settings.campaign_prefix + name


@app.post("/api/campaigns", status_code=201)
async def create_campaign(body: CampaignCreate, db: Session = Depends(get_db)):
    await keitaro.get(f"/offers/{body.offer_id}")  # fail early on a bad offer id
    ref = await _resolve_defaults()
    name = _prefixed(body.name)

    campaign = await keitaro.post("/campaigns", {
        "name": name,
        "alias": secrets.token_hex(3),
        "type": "position",
        "domain_id": ref["domain"]["id"],
        "group_id": str(ref["group"]["id"]),
        "traffic_source_id": ref["source"]["id"],
    })
    cid = campaign["id"]
    try:
        await keitaro.post("/streams", {
            "campaign_id": cid, "name": f"Geo {body.geo}", "type": "regular",
            "schema": "redirect", "action_type": "http", "action_payload": "https://google.com",
            "position": 1,
            "filters": [{"name": "country", "mode": "accept", "payload": [body.geo]}],
        })
        await keitaro.post("/streams", {
            "campaign_id": cid, "name": "Offers", "type": "default", "schema": "landings",
            "position": 2,
            "offers": [{"offer_id": body.offer_id, "share": 100, "state": "active"}],
        })
    except HTTPException:
        await keitaro.delete(f"/campaigns/{cid}")  # do not leave half-built campaigns
        raise
    db.add(CreatedCampaign(keitaro_id=cid, name=name, geo=body.geo, offer_id=body.offer_id))
    db.commit()
    return {"id": cid, "name": name, "alias": campaign.get("alias"), **ref}


@app.get("/api/campaigns")
async def list_campaigns():
    """Campaigns carrying our prefix."""
    data = await keitaro.get("/campaigns", params={"limit": 500})
    return [
        {"id": c["id"], "name": c["name"], "state": c.get("state")}
        for c in data
        if c["name"].startswith(settings.campaign_prefix)
    ]


# ---------- campaign editor ----------
async def _report(campaign_id: int, dims: list[str]) -> list[dict] | None:
    """Click stats from /report/build; None if the stand does not offer it."""
    try:
        r = await keitaro.post("/report/build", {
            "range": {"interval": "all_time"},
            "dimensions": dims,
            "measures": ["clicks", "campaign_unique_clicks", "bots"],
            "filters": [{"name": "campaign_id", "operator": "EQUALS", "expression": campaign_id}],
        })
    except HTTPException:
        return None
    return r.get("rows", [])


def _stat(row: dict | None) -> dict:
    row = row or {}
    return {
        "clicks": int(row.get("clicks") or 0),
        "unique": int(row.get("campaign_unique_clicks") or 0),
        "bots": int(row.get("bots") or 0),
    }


@app.get("/api/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int):
    campaign = await keitaro.get(f"/campaigns/{campaign_id}")
    streams = await keitaro.get(f"/campaigns/{campaign_id}/streams")
    names = {o["id"]: o["name"] for o in await keitaro.get("/offers")}

    s_rows = await _report(campaign_id, ["stream_id"])
    o_rows = await _report(campaign_id, ["stream_id", "offer_id"]) if s_rows is not None else None
    by_stream = {int(r["stream_id"]): r for r in s_rows or [] if r.get("stream_id")}
    by_offer = {
        (int(r["stream_id"]), int(r["offer_id"])): r
        for r in o_rows or [] if r.get("stream_id") and r.get("offer_id")
    }

    return {
        "id": campaign["id"],
        "name": campaign["name"],
        "stats_available": s_rows is not None,
        "streams": [{
            "id": s["id"], "name": s["name"], "type": s["type"], "schema": s["schema"],
            "state": s.get("state"),
            "action_payload": s["action_payload"] if isinstance(s.get("action_payload"), str) else None,
            "filters": [
                {"name": f["name"], "mode": f["mode"], "payload": f.get("payload")}
                for f in s.get("filters") or []
            ],
            "stats": _stat(by_stream.get(s["id"])),
            "offers": [{
                "offer_id": o["offer_id"],
                "share": o["share"],
                "state": o.get("state", "active"),
                "name": names.get(o["offer_id"], f"#{o['offer_id']}"),
                "stats": _stat(by_offer.get((s["id"], o["offer_id"]))),
            } for o in s.get("offers") or []],
        } for s in streams],
    }


class OfferShare(BaseModel):
    offer_id: int
    share: int = Field(ge=0, le=100)


class OffersPush(BaseModel):
    offers: list[OfferShare]


@app.put("/api/streams/{stream_id}/offers")
async def push_offers(stream_id: int, body: OffersPush):
    """Apply a reviewed (staged) offers list to Keitaro in one request.

    Keitaro's PUT /streams/{id} replaces the whole offers list, so this is the full final state.
    """
    s = await keitaro.get(f"/streams/{stream_id}")
    if s.get("schema") != "landings":
        raise HTTPException(400, "Offers can only be edited in a 'landings' stream")
    ids = [o.offer_id for o in body.offers]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Duplicate offers")
    if body.offers and sum(o.share for o in body.offers) != 100:
        raise HTTPException(400, "Shares must sum to 100")
    current = {o["offer_id"]: o for o in s.get("offers") or []}
    for oid in ids:
        if oid not in current:  # newly added: make sure it exists
            await keitaro.get(f"/offers/{oid}")
    await keitaro.put(f"/streams/{stream_id}", {"offers": [
        {"offer_id": o.offer_id, "share": o.share,
         "state": current.get(o.offer_id, {}).get("state", "active")}
        for o in body.offers
    ]})
    return {"ok": True}
