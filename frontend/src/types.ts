export type Overview = {
    organization: string
    total_records: number
    pending_review: number
    suspicious_rows: number
    approved_rows: number
    failed_imports: number
}

export type SourceBreakdown = {
    source_type: 'sap' | 'utility' | 'travel'
    source_name: string
    total_records: number
    pending_review: number
    suspicious_rows: number
    approved_rows: number
}

export type Organization = {
    id: string
    name: string
    slug: string
    default_currency: string
}

export type Membership = {
    id: string
    organization: string
    organization_slug?: string
    email: string
    role: 'viewer' | 'analyst' | 'admin'
    created_at: string
    updated_at: string
}

export type WorkspaceSession = {
    organization: Organization
    membership: Membership
    memberships: Membership[]
    permissions: {
        can_upload: boolean
        can_review: boolean
        can_seed: boolean
    }
}

export type DataSource = {
    id: string
    organization: string
    source_type: 'sap' | 'utility' | 'travel'
    name: string
    ingestion_mode: string
    system_of_record: string
    is_active: boolean
}

export type ImportBatch = {
    id: string
    organization: string
    data_source: string
    label: string
    source_filename: string
    source_format: string
    status: string
    total_rows: number
    successful_rows: number
    failed_rows: number
    imported_by_email: string
    created_at: string
}

export type DashboardPayload = {
    organization: string
    summary: Overview
    source_breakdown: SourceBreakdown[]
    recent_batches: ImportBatch[]
    recent_records: NormalizedRecord[]
    recent_audits: AuditEvent[]
}

export type NormalizedRecord = {
    id: string
    organization: string
    data_source: string
    import_batch: string
    source_system: string
    source_record_key: string
    activity_type: string
    scope_category: '1' | '2' | '3'
    original_quantity: string | null
    original_unit: string
    normalized_quantity: string | null
    normalized_unit: string
    emission_factor: string | null
    emissions_kg_co2e: string | null
    raw_payload: Record<string, string>
    normalized_payload: Record<string, unknown>
    suspicious_score: string
    suspicious_flags: string[]
    review_status: 'pending' | 'approved' | 'rejected' | 'edited'
    review_note: string
    approved_at: string | null
    edited_by_email: string
    edited_at: string | null
    created_at: string
    updated_at: string
}

export type AuditEvent = {
    id: string
    organization: string
    entity_type: string
    entity_id: string
    action: string
    actor_email: string
    before_state: Record<string, unknown>
    after_state: Record<string, unknown>
    created_at: string
}
