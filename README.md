# Breathe ESG Prototype

Prototype for a multi-tenant ESG ingestion and review workflow built with Django REST Framework and React.

## What is included

- Multi-tenant data model for organizations, sources, batches, raw records, normalized records, reviews, and audit events.
- CSV ingestion for SAP fuel/procurement, utility electricity, and corporate travel exports.
- Normalization logic with unit conversion, scope tagging, suspicious-row flagging, and audit logging.
- React analyst workspace for dashboarding, uploads, batch inspection, review, approvals, and audit trail inspection.
- Richer seeded data so the dashboard shows real batch size, suspicious cases, and source breakdowns.
- Deployment scaffolding for a Vercel-only frontend demo.

## Local setup

Frontend only:

```bash
cd frontend
npm install
npm run dev
```

The demo keeps its state in the browser, so local development and Vercel production use the same code path.

## Demo flow

1. Open the frontend and load the built-in demo state.
2. Review pending rows, inspect suspicious flags, edit normalized payloads, and approve or reject rows.
3. Upload a CSV file to generate a new batch directly in the browser.

## Deployment

- Frontend: Vercel static site from [frontend/vercel.json](frontend/vercel.json).

### Vercel setup

1. Import the `frontend/` folder as a Vercel project.
2. Keep the build command as `npm install && npm run build`.
3. Leave environment variables empty unless you want to add your own remote API later.
4. Deploy the project.

### Notes

The Django backend remains in the repository for reference, but the deployed Vercel app no longer depends on it.

## Docs

- [MODEL.md](MODEL.md)
- [DECISIONS.md](DECISIONS.md)
- [TRADEOFFS.md](TRADEOFFS.md)
- [SOURCES.md](SOURCES.md)

## Good next majors

1. Add auth and role-based access so analyst, admin, and reviewer permissions are explicit.
2. Move ingestion to async jobs with a queue so uploads do not block on larger files.
3. Add CSV validation and row-level error reporting before normalization.
4. Add a persisted edit history view so every field change on a record is visible.
5. Replace the demo-seed flow with tenant creation, source onboarding, and batch uploads as separate actions.
6. Add emissions by month, source, facility, and suspicious-rate trend analytics.
7. Add backend API tests and frontend workflow tests so the review flow stays stable.
8. Harden deployment with custom domains, environment management, and release checks.
