# Breathe ESG Prototype

Prototype for a multi-tenant ESG ingestion and review workflow built with Django REST Framework and React.

## What is included

- Multi-tenant data model for organizations, sources, batches, raw records, normalized records, reviews, and audit events.
- CSV ingestion for SAP fuel/procurement, utility electricity, and corporate travel exports.
- Normalization logic with unit conversion, scope tagging, suspicious-row flagging, and audit logging.
- React analyst workspace for dashboarding, uploads, batch inspection, review, approvals, and audit trail inspection.
- Richer seeded data so the dashboard shows real batch size, suspicious cases, and source breakdowns.
- Deployment scaffolding for Render and Vercel with a shared `/api` contract.

## Local setup

Backend:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The frontend uses `/api` by default. In local dev, Vite proxies that path to `http://127.0.0.1:8000`. Vercel rewrites the same path to the Render backend.

## Demo flow

1. Seed the backend with `python manage.py seed_demo`.
2. Open the frontend and reload demo data.
3. Review pending rows, inspect suspicious flags, edit normalized payloads, and approve or reject rows.

## Deployment

- Backend: Render Docker service using [render.yaml](render.yaml)
- Frontend: Vercel static site from [frontend/vercel.json](frontend/vercel.json) with `/api` rewrites to the Render backend.

### Render setup

1. Create the Render Blueprint from [render.yaml](render.yaml).
2. Confirm the API service name and public URL Render assigns.
3. Keep `DJANGO_DEBUG=0`, set `DJANGO_SECRET_KEY`, and let Render populate `DATABASE_URL` from the managed database.
4. Set `DJANGO_ALLOWED_HOSTS` to the Render service host and any custom domain you add later.

### Vercel setup

1. Import the `frontend/` folder as a Vercel project.
2. Keep the build command as `npm install && npm run build`.
3. Point the rewrite in [frontend/vercel.json](frontend/vercel.json) at the Render API host you actually receive after deployment.
4. Leave the frontend talking to `/api` so local development and production stay aligned.

### One deployment detail to confirm

The frontend rewrite destination needs the final Render backend hostname. That value is the only environment-specific string that cannot be known until the backend is deployed.

## Docs

- [MODEL.md](MODEL.md)
- [DECISIONS.md](DECISIONS.md)
- [TRADEOFFS.md](TRADEOFFS.md)
- [SOURCES.md](SOURCES.md)

## Good next majors

1. Add auth and role-based access so analyst, admin, and reviewer permissions are explicit.
2. Move ingestion to async jobs with a queue so uploads do not block on larger files.
3. Add a persisted edit history view so every field change on a record is visible.
4. Add CSV validation and row-level error reporting before normalization.
5. Replace the demo-seed flow with tenant creation, source onboarding, and batch uploads as separate actions.
