# Model

The model centers on organization-level tenancy and an immutable ingestion trail.

## Core entities

- Organization: tenant boundary for all ESG activity.
- Membership: lightweight analyst/admin access control for an organization.
- DataSource: a named source configuration such as SAP, utility portal, or travel platform.
- ImportBatch: one import event from a source, carrying filename, totals, and status.
- RawRecord: the original row payload exactly as received, with row hash and source row number.
- NormalizedEmissionRecord: the cleaned, scoped, normalized record analysts review and approve.
- AnalystReview: the human decision record for approvals, rejections, and edits.
- AuditEvent: append-only change log for ingestion and review actions.
- Facility: lookup for plant and meter references that real exports often require.
- UnitConversion and EmissionFactorReference: reference data for normalization and factor selection.

## Why this shape

The assignment cares more about defendable lineage than about a large surface area of features. RawRecord preserves the source-of-truth payload, while NormalizedEmissionRecord stores the transformed output that analysts actually sign off. That lets us explain every change between what the source said and what auditors later see.

## Multi-tenancy

Every operational entity hangs off Organization. That keeps imports, records, reviews, and audit history isolated by tenant. The prototype uses a seeded demo organization, but the schema supports multiple organizations without changing the ingestion or review flow.

## Source-of-truth tracking

Each normalized record keeps both the raw payload and the normalized payload, plus source_system, source_record_key, and the link back to the import batch and raw row. Approved rows are locked with approved_at and locked_at. If a reviewer edits the normalized payload, edited_by_email and edited_at capture that intervention.

## Scope and normalization

The normalized record stores scope_category explicitly as Scope 1, 2, or 3. Unit conversion happens before emission estimation so the stored normalized_quantity and normalized_unit are stable review artifacts. EmissionFactorReference exists so those defaults can be replaced by tenant-specific factors later without changing the main record shape.

## Audit trail

AuditEvent is append-only. Ingestion writes an event when a batch is loaded; review actions write a second event when an analyst approves, rejects, or edits a row. That gives us a simple chain from source file to reviewer action without relying on hidden history tables.
