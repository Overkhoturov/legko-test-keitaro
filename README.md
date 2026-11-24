# Keitaro tools

Two tools on top of the Keitaro Admin API: a **campaign creator** and an **offer editor** for existing campaigns.

Stack: FastAPI + SQLAlchemy (backend), React + TanStack Query + Tailwind (frontend).

## Setup

```
cp .env.example .env     # set KEITARO_API_KEY
```

Backend via Docker (no local Python needed):
```
docker compose up --build
```

Backend with local Python 3.12:
```
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
or `docker build -t keitaro-back backend && docker run --env-file .env -p 8000:8000 keitaro-back`

Frontend:
```
cd frontend
npm install
npm run dev      # http://localhost:5173, proxies /api to :8000
```

## How it works

**Creator** (`POST /api/campaigns`: name, geo, offer_id) creates a campaign named `test_verkhoturov_<name>` with
domain / group / source and two flows:
1. `regular`, redirect to `https://google.com`, filter `country accept [GEO]`
2. `default`, `landings` schema with the chosen offer at 100%

Domain/group/source: ids pinned in `.env` (`DEFAULT_*_ID`), otherwise the group/source named `FORTESTS`, otherwise the first
available one; the first active domain. If flow creation fails, the campaign is deleted (no half-built campaigns).

**Editor**: pick a campaign (only `test_verkhoturov_*` are listed). Adding/removing offers and editing shares is staged locally:
the stream card turns yellow ("Pending approval"), new rows are highlighted, removed rows are struck through. **Push to KT** sends the
final offers list in one `PUT /api/streams/{id}/offers` (Keitaro replaces the whole list; shares must sum to 100), **Cancel** discards the draft.
Add/remove re-split shares evenly; they can be edited by hand. Clicks / unique / bots come from
`POST /report/build` (per flow and per offer); if the stand does not expose it, the UI shows dashes instead of fake zeros.
