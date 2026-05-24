# Decisions

## Ingestion formats

- SAP: CSV export from ECC-style reporting rather than IDoc or OData. That is the most realistic shape for an ESG onboarding prototype because finance and operations teams usually hand over exported flat files first.
- Utility: portal CSV export. It is the smallest realistic surface that still contains billing periods, meter IDs, tariff context, and non-calendar-aligned usage.
- Travel: Concur-like CSV export. It gives enough structure to model flights, hotels, and ground transport without needing direct API integration.

## Ambiguities resolved

- I treated SAP as two subcases: direct fuel rows and procurement spend rows. Fuel rows use Scope 1; procurement rows use Scope 3 spend-based factors.
- I modeled the review workflow as a lock-on-approve process. Once approved, a row is treated as audit-ready and no longer a casual editing target.
- I used a demo organization instead of forcing authentication. That keeps the prototype usable while preserving a real tenancy model under the hood.
- I chose CSV upload over API pull because the assignment emphasized figuring out the source shape first. CSV also lets the sample data stay inspectable and honest.

## What I would still ask the PM

- Which SAP modules are in scope: fuel cards, expense postings, procurement ledger, or all three?
- Which utility regions and tariff plans matter first, because emission factors vary by grid and meter structure?
- Whether travel should rely on spend-based estimates, itinerary data, or both.
- Whether the analyst sign-off is per row, per batch, or per reporting period in the real product.

## Why this implementation choice

The prototype favors transparent lineage over magical automation. Every decision path is visible in the record model, which makes it easier to defend in review and easier to extend once the real production feeds are known.
