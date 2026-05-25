import type {
    AuditEvent,
    DataSource,
    DashboardPayload,
    ImportBatch,
    Membership,
    NormalizedRecord,
    Organization,
    WorkspaceSession,
} from './types'

type SessionContext = {
    organization: string
    email: string
}

type DemoState = {
    organizations: Organization[]
    memberships: Membership[]
    sources: DataSource[]
    batches: ImportBatch[]
    records: NormalizedRecord[]
    audits: AuditEvent[]
}

const STORAGE_KEY = 'breathe-esg-demo-state-v1'
const DEFAULT_ORG_SLUG = 'breathe-demo'
const DEFAULT_ADMIN_EMAIL = 'admin@breathe.local'
const DEFAULT_ANALYST_EMAIL = 'analyst@breathe.local'
const DEFAULT_VIEWER_EMAIL = 'viewer@breathe.local'
const BASE_TIME = new Date('2026-05-25T09:00:00Z').getTime()

function hasBrowserStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function createId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`
    }
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function stamp(minutesOffset: number) {
    return new Date(BASE_TIME + minutesOffset * 60_000).toISOString()
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

function sortNewest<T extends { created_at: string }>(values: T[]) {
    return [...values].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
}

function splitCsvLine(line: string) {
    const cells: string[] = []
    let current = ''
    let quoted = false

    for (let index = 0; index < line.length; index += 1) {
        const character = line[index]

        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                current += '"'
                index += 1
            } else {
                quoted = !quoted
            }
            continue
        }

        if (character === ',' && !quoted) {
            cells.push(current)
            current = ''
            continue
        }

        current += character
    }

    cells.push(current)
    return cells.map((cell) => cell.trim())
}

function parseCsv(text: string) {
    const normalized = text.replace(/\r\n/g, '\n').trim()
    if (!normalized) {
        return [] as Record<string, string>[]
    }

    const [headerLine, ...dataLines] = normalized.split('\n')
    const headers = splitCsvLine(headerLine)

    return dataLines
        .filter((line) => line.trim().length > 0)
        .map((line) => {
            const row = splitCsvLine(line)
            return headers.reduce<Record<string, string>>((accumulator, header, index) => {
                accumulator[header] = row[index] ?? ''
                return accumulator
            }, {})
        })
}

function parseNumber(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') {
        return null
    }
    const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
}

function formatDecimal(value: number | null) {
    return value === null ? null : Number(value).toFixed(2)
}

function makeMembership(organization: string, email: string, role: Membership['role'], createdMinutesAgo: number): Membership {
    const timestamp = stamp(createdMinutesAgo)
    return {
        id: createId('membership'),
        organization,
        email,
        role,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

function makeBatch(input: {
    id?: string
    organization: string
    data_source: string
    label: string
    source_filename: string
    status: ImportBatch['status']
    total_rows: number
    successful_rows: number
    failed_rows: number
    imported_by_email: string
    created_minutes_ago: number
}): ImportBatch {
    return {
        id: input.id ?? createId('batch'),
        organization: input.organization,
        data_source: input.data_source,
        label: input.label,
        source_filename: input.source_filename,
        source_format: 'csv',
        status: input.status,
        total_rows: input.total_rows,
        successful_rows: input.successful_rows,
        failed_rows: input.failed_rows,
        imported_by_email: input.imported_by_email,
        created_at: stamp(input.created_minutes_ago),
    }
}

function makeAudit(input: {
    id?: string
    organization: string
    entity_type: string
    entity_id: string
    action: string
    actor_email: string
    before_state?: Record<string, unknown>
    after_state?: Record<string, unknown>
    created_minutes_ago: number
}): AuditEvent {
    return {
        id: input.id ?? createId('audit'),
        organization: input.organization,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
        action: input.action,
        actor_email: input.actor_email,
        before_state: input.before_state ?? {},
        after_state: input.after_state ?? {},
        created_at: stamp(input.created_minutes_ago),
    }
}

function makeRecord(input: {
    id?: string
    organization: string
    data_source: string
    import_batch: string
    source_system: string
    source_record_key: string
    activity_type: string
    scope_category: NormalizedRecord['scope_category']
    original_quantity: number | null
    original_unit: string
    normalized_quantity: number | null
    normalized_unit: string
    emission_factor: number | null
    emissions_kg_co2e: number | null
    raw_payload: Record<string, string>
    normalized_payload: Record<string, unknown>
    suspicious_score: number
    suspicious_flags: string[]
    review_status: NormalizedRecord['review_status']
    review_note?: string
    approved_at?: string | null
    edited_by_email?: string
    edited_at?: string | null
    created_minutes_ago: number
}): NormalizedRecord {
    const timestamp = stamp(input.created_minutes_ago)
    return {
        id: input.id ?? createId('record'),
        organization: input.organization,
        data_source: input.data_source,
        import_batch: input.import_batch,
        source_system: input.source_system,
        source_record_key: input.source_record_key,
        activity_type: input.activity_type,
        scope_category: input.scope_category,
        original_quantity: formatDecimal(input.original_quantity),
        original_unit: input.original_unit,
        normalized_quantity: formatDecimal(input.normalized_quantity),
        normalized_unit: input.normalized_unit,
        emission_factor: formatDecimal(input.emission_factor),
        emissions_kg_co2e: formatDecimal(input.emissions_kg_co2e),
        raw_payload: input.raw_payload,
        normalized_payload: input.normalized_payload,
        suspicious_score: input.suspicious_score.toFixed(2),
        suspicious_flags: input.suspicious_flags,
        review_status: input.review_status,
        review_note: input.review_note ?? '',
        approved_at: input.approved_at ?? null,
        edited_by_email: input.edited_by_email ?? '',
        edited_at: input.edited_at ?? null,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

function createInitialState(): DemoState {
    const organization: Organization = {
        id: 'org_breathe_demo',
        name: 'Breathe Demo',
        slug: DEFAULT_ORG_SLUG,
        default_currency: 'USD',
    }

    const memberships = [
        makeMembership(organization.id, DEFAULT_ADMIN_EMAIL, 'admin', 180),
        makeMembership(organization.id, DEFAULT_ANALYST_EMAIL, 'analyst', 160),
        makeMembership(organization.id, DEFAULT_VIEWER_EMAIL, 'viewer', 140),
    ]

    const sources: DataSource[] = [
        {
            id: 'source_sap',
            organization: organization.id,
            source_type: 'sap',
            name: 'SAP ECC Fuel and Procurement Export',
            ingestion_mode: 'csv_upload',
            system_of_record: 'SAP ECC',
            is_active: true,
        },
        {
            id: 'source_utility',
            organization: organization.id,
            source_type: 'utility',
            name: 'Utility Portal Electricity Export',
            ingestion_mode: 'csv_upload',
            system_of_record: 'Utility Portal',
            is_active: true,
        },
        {
            id: 'source_travel',
            organization: organization.id,
            source_type: 'travel',
            name: 'Concur Travel Export',
            ingestion_mode: 'csv_upload',
            system_of_record: 'Concur',
            is_active: true,
        },
    ]

    const sapBatch = makeBatch({
        id: 'batch_sap_march_2026',
        organization: organization.id,
        data_source: 'source_sap',
        label: 'SAP Fuel and Procurement March 2026',
        source_filename: 'sap_fuel_procurement.csv',
        status: 'processed',
        total_rows: 8,
        successful_rows: 8,
        failed_rows: 0,
        imported_by_email: DEFAULT_ADMIN_EMAIL,
        created_minutes_ago: 120,
    })

    const utilityBatch = makeBatch({
        id: 'batch_utility_april_2026',
        organization: organization.id,
        data_source: 'source_utility',
        label: 'Utility Electricity April 2026',
        source_filename: 'utility_electricity.csv',
        status: 'processed',
        total_rows: 6,
        successful_rows: 6,
        failed_rows: 0,
        imported_by_email: DEFAULT_ADMIN_EMAIL,
        created_minutes_ago: 90,
    })

    const travelBatch = makeBatch({
        id: 'batch_travel_april_2026',
        organization: organization.id,
        data_source: 'source_travel',
        label: 'Travel Export April 2026',
        source_filename: 'travel_concur.csv',
        status: 'processed',
        total_rows: 8,
        successful_rows: 8,
        failed_rows: 0,
        imported_by_email: DEFAULT_ADMIN_EMAIL,
        created_minutes_ago: 60,
    })

    const records: NormalizedRecord[] = [
        makeRecord({
            id: 'record_sap_500001',
            organization: organization.id,
            data_source: 'source_sap',
            import_batch: sapBatch.id,
            source_system: 'SAP ECC',
            source_record_key: '500001',
            activity_type: 'diesel backup generator',
            scope_category: '1',
            original_quantity: 1200,
            original_unit: 'L',
            normalized_quantity: 1200,
            normalized_unit: 'L',
            emission_factor: 0.28,
            emissions_kg_co2e: 336,
            raw_payload: {
                belnr: '500001',
                buchungsdatum: '12.03.2026',
                werk: '1001',
                materialbeschreibung: 'Diesel for backup generator',
                menge: '1200',
                einheit: 'L',
                kraftstofftyp: 'Diesel',
                lieferant: 'Indian Oil',
                purchase_category: 'facilities_usd',
                currency: 'INR',
            },
            normalized_payload: {
                activity_type: 'diesel backup generator',
                facility_code: 'PLANT-001',
                quantity: 1200,
                unit: 'L',
                emissions_kg_co2e: 336,
                scope_category: '1',
            },
            suspicious_score: 12,
            suspicious_flags: ['facility-load'],
            review_status: 'pending',
            review_note: 'Pending analyst review.',
            created_minutes_ago: 118,
        }),
        makeRecord({
            id: 'record_sap_500002',
            organization: organization.id,
            data_source: 'source_sap',
            import_batch: sapBatch.id,
            source_system: 'SAP ECC',
            source_record_key: '500002',
            activity_type: 'fleet fuel card',
            scope_category: '1',
            original_quantity: 320,
            original_unit: 'GAL',
            normalized_quantity: 1211.33,
            normalized_unit: 'L',
            emission_factor: 0.28,
            emissions_kg_co2e: 339.17,
            raw_payload: {
                belnr: '500002',
                buchungsdatum: '13.03.2026',
                werk: '1001',
                materialbeschreibung: 'Diesel for fleet fuel card',
                menge: '320',
                einheit: 'GAL',
                kraftstofftyp: 'Diesel',
                lieferant: 'BPCL',
                purchase_category: 'transport_usd',
                currency: 'INR',
            },
            normalized_payload: {
                activity_type: 'fleet fuel card',
                facility_code: 'PLANT-001',
                quantity: 1211.33,
                unit: 'L',
                emissions_kg_co2e: 339.17,
                scope_category: '1',
            },
            suspicious_score: 18,
            suspicious_flags: ['unit-converted'],
            review_status: 'approved',
            review_note: 'Approved after normalization check.',
            approved_at: stamp(114),
            created_minutes_ago: 117,
        }),
        makeRecord({
            id: 'record_sap_500004',
            organization: organization.id,
            data_source: 'source_sap',
            import_batch: sapBatch.id,
            source_system: 'SAP ECC',
            source_record_key: '500004',
            activity_type: 'gasoline site vehicles',
            scope_category: '1',
            original_quantity: -90,
            original_unit: 'L',
            normalized_quantity: -90,
            normalized_unit: 'L',
            emission_factor: 0.28,
            emissions_kg_co2e: -25.2,
            raw_payload: {
                belnr: '500004',
                buchungsdatum: '18.03.2026',
                werk: '2002',
                materialbeschreibung: 'Gasoline for site vehicles',
                menge: '-90',
                einheit: 'L',
                kraftstofftyp: 'Gasoline',
                lieferant: 'Shell',
                purchase_category: 'transport_usd',
                currency: 'INR',
            },
            normalized_payload: {
                activity_type: 'gasoline site vehicles',
                facility_code: 'HQ-001',
                quantity: -90,
                unit: 'L',
                emissions_kg_co2e: -25.2,
                scope_category: '1',
            },
            suspicious_score: 92,
            suspicious_flags: ['negative-quantity', 'manual-review'],
            review_status: 'rejected',
            review_note: 'Rejected because the source quantity is negative.',
            edited_by_email: DEFAULT_ANALYST_EMAIL,
            edited_at: stamp(108),
            created_minutes_ago: 116,
        }),
        makeRecord({
            id: 'record_utility_7781_march',
            organization: organization.id,
            data_source: 'source_utility',
            import_batch: utilityBatch.id,
            source_system: 'Utility Portal',
            source_record_key: 'MTR-7781-2026-03',
            activity_type: 'electricity',
            scope_category: '2',
            original_quantity: 18450,
            original_unit: 'kWh',
            normalized_quantity: 18450,
            normalized_unit: 'kWh',
            emission_factor: 0.42,
            emissions_kg_co2e: 7759.5,
            raw_payload: {
                meter_id: 'MTR-7781',
                billing_start: '2026-03-15',
                billing_end: '2026-04-14',
                kwh: '18450',
                peak_kwh: '10220',
                offpeak_kwh: '8230',
                tariff: 'HT-INR',
                currency: 'INR',
                facility_code: 'PLANT-001',
            },
            normalized_payload: {
                meter_id: 'MTR-7781',
                facility_code: 'PLANT-001',
                quantity: 18450,
                unit: 'kWh',
                emissions_kg_co2e: 7759.5,
                scope_category: '2',
            },
            suspicious_score: 15,
            suspicious_flags: ['peak-load'],
            review_status: 'pending',
            review_note: 'Awaiting analyst sign-off.',
            created_minutes_ago: 88,
        }),
        makeRecord({
            id: 'record_utility_1102_april',
            organization: organization.id,
            data_source: 'source_utility',
            import_batch: utilityBatch.id,
            source_system: 'Utility Portal',
            source_record_key: 'MTR-1102-2026-04',
            activity_type: 'electricity',
            scope_category: '2',
            original_quantity: 8420,
            original_unit: 'kWh',
            normalized_quantity: 8420,
            normalized_unit: 'kWh',
            emission_factor: 0.42,
            emissions_kg_co2e: 3536.4,
            raw_payload: {
                meter_id: 'MTR-1102',
                billing_start: '2026-04-01',
                billing_end: '2026-04-30',
                kwh: '8420',
                peak_kwh: '4700',
                offpeak_kwh: '3720',
                tariff: 'LT-INR',
                currency: 'INR',
                facility_code: 'HQ-001',
            },
            normalized_payload: {
                meter_id: 'MTR-1102',
                facility_code: 'HQ-001',
                quantity: 8420,
                unit: 'kWh',
                emissions_kg_co2e: 3536.4,
                scope_category: '2',
            },
            suspicious_score: 0,
            suspicious_flags: [],
            review_status: 'approved',
            review_note: 'Validated against previous billing cycles.',
            approved_at: stamp(84),
            created_minutes_ago: 87,
        }),
        makeRecord({
            id: 'record_utility_9999_april',
            organization: organization.id,
            data_source: 'source_utility',
            import_batch: utilityBatch.id,
            source_system: 'Utility Portal',
            source_record_key: 'MTR-9999-2026-04',
            activity_type: 'electricity',
            scope_category: '2',
            original_quantity: 1520,
            original_unit: 'kWh',
            normalized_quantity: 1520,
            normalized_unit: 'kWh',
            emission_factor: 0.42,
            emissions_kg_co2e: 638.4,
            raw_payload: {
                meter_id: 'MTR-9999',
                billing_start: '2026-05-01',
                billing_end: '2026-05-31',
                kwh: '1520',
                peak_kwh: '900',
                offpeak_kwh: '550',
                tariff: 'LT-INR',
                currency: 'INR',
                facility_code: 'REMOTE-01',
            },
            normalized_payload: {
                meter_id: 'MTR-9999',
                facility_code: 'REMOTE-01',
                quantity: 1520,
                unit: 'kWh',
                emissions_kg_co2e: 638.4,
                scope_category: '2',
            },
            suspicious_score: 88,
            suspicious_flags: ['unknown-meter', 'usage-spike'],
            review_status: 'rejected',
            review_note: 'Rejected while the meter mapping is being verified.',
            edited_by_email: DEFAULT_ANALYST_EMAIL,
            edited_at: stamp(82),
            created_minutes_ago: 86,
        }),
        makeRecord({
            id: 'record_travel_TR1001',
            organization: organization.id,
            data_source: 'source_travel',
            import_batch: travelBatch.id,
            source_system: 'Concur',
            source_record_key: 'TR-1001',
            activity_type: 'flight',
            scope_category: '3',
            original_quantity: 18400,
            original_unit: 'INR',
            normalized_quantity: 18400,
            normalized_unit: 'INR',
            emission_factor: 0.15,
            emissions_kg_co2e: 2760,
            raw_payload: {
                trip_id: 'TR-1001',
                transaction_date: '2026-04-02',
                category: 'flight',
                origin_airport: 'DEL',
                destination_airport: 'BOM',
                distance_km: '',
                nights: '0',
                amount: '18400',
                currency: 'INR',
                traveler: 'Asha Rao',
            },
            normalized_payload: {
                category: 'flight',
                traveler: 'Asha Rao',
                quantity: 18400,
                unit: 'INR',
                emissions_kg_co2e: 2760,
                scope_category: '3',
            },
            suspicious_score: 0,
            suspicious_flags: [],
            review_status: 'approved',
            review_note: 'Flight route validated.',
            approved_at: stamp(58),
            created_minutes_ago: 59,
        }),
        makeRecord({
            id: 'record_travel_TR1002',
            organization: organization.id,
            data_source: 'source_travel',
            import_batch: travelBatch.id,
            source_system: 'Concur',
            source_record_key: 'TR-1002',
            activity_type: 'hotel',
            scope_category: '3',
            original_quantity: 3,
            original_unit: 'nights',
            normalized_quantity: 3,
            normalized_unit: 'nights',
            emission_factor: 12.5,
            emissions_kg_co2e: 37.5,
            raw_payload: {
                trip_id: 'TR-1002',
                transaction_date: '2026-04-05',
                category: 'hotel',
                origin_airport: '',
                destination_airport: '',
                distance_km: '',
                nights: '3',
                amount: '11250',
                currency: 'INR',
                traveler: 'Rahul Nair',
            },
            normalized_payload: {
                category: 'hotel',
                traveler: 'Rahul Nair',
                quantity: 3,
                unit: 'nights',
                emissions_kg_co2e: 37.5,
                scope_category: '3',
            },
            suspicious_score: 12,
            suspicious_flags: ['multi-night-stay'],
            review_status: 'pending',
            review_note: 'Pending cost center validation.',
            created_minutes_ago: 58,
        }),
        makeRecord({
            id: 'record_travel_TR1004',
            organization: organization.id,
            data_source: 'source_travel',
            import_batch: travelBatch.id,
            source_system: 'Concur',
            source_record_key: 'TR-1004',
            activity_type: 'long-haul flight',
            scope_category: '3',
            original_quantity: 98500,
            original_unit: 'INR',
            normalized_quantity: 98500,
            normalized_unit: 'INR',
            emission_factor: 0.15,
            emissions_kg_co2e: 14775,
            raw_payload: {
                trip_id: 'TR-1004',
                transaction_date: '2026-04-14',
                category: 'flight',
                origin_airport: 'DEL',
                destination_airport: 'JFK',
                distance_km: '',
                nights: '0',
                amount: '98500',
                currency: 'INR',
                traveler: 'Asha Rao',
            },
            normalized_payload: {
                category: 'flight',
                traveler: 'Asha Rao',
                quantity: 98500,
                unit: 'INR',
                emissions_kg_co2e: 14775,
                scope_category: '3',
            },
            suspicious_score: 48,
            suspicious_flags: ['long-haul'],
            review_status: 'edited',
            review_note: 'Normalized long-haul flight record for analyst review.',
            edited_by_email: DEFAULT_ANALYST_EMAIL,
            edited_at: stamp(54),
            created_minutes_ago: 57,
        }),
    ]

    const audits: AuditEvent[] = [
        makeAudit({
            id: 'audit_seeded',
            organization: organization.id,
            entity_type: 'demo_seed',
            entity_id: 'breathe-demo',
            action: 'seeded',
            actor_email: DEFAULT_ADMIN_EMAIL,
            after_state: { batches: 3, records: 12 },
            created_minutes_ago: 120,
        }),
        makeAudit({
            id: 'audit_sap_batch',
            organization: organization.id,
            entity_type: 'import_batch',
            entity_id: sapBatch.id,
            action: 'imported',
            actor_email: DEFAULT_ADMIN_EMAIL,
            after_state: { rows: 8, source: 'sap' },
            created_minutes_ago: 119,
        }),
        makeAudit({
            id: 'audit_utility_batch',
            organization: organization.id,
            entity_type: 'import_batch',
            entity_id: utilityBatch.id,
            action: 'imported',
            actor_email: DEFAULT_ADMIN_EMAIL,
            after_state: { rows: 6, source: 'utility' },
            created_minutes_ago: 90,
        }),
        makeAudit({
            id: 'audit_travel_batch',
            organization: organization.id,
            entity_type: 'import_batch',
            entity_id: travelBatch.id,
            action: 'imported',
            actor_email: DEFAULT_ADMIN_EMAIL,
            after_state: { rows: 8, source: 'travel' },
            created_minutes_ago: 60,
        }),
        makeAudit({
            id: 'audit_sap_500002',
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: 'record_sap_500002',
            action: 'approved',
            actor_email: DEFAULT_ANALYST_EMAIL,
            after_state: { review_status: 'approved' },
            created_minutes_ago: 114,
        }),
        makeAudit({
            id: 'audit_sap_500004',
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: 'record_sap_500004',
            action: 'rejected',
            actor_email: DEFAULT_ANALYST_EMAIL,
            after_state: { review_status: 'rejected' },
            created_minutes_ago: 108,
        }),
        makeAudit({
            id: 'audit_utility_1102',
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: 'record_utility_1102_april',
            action: 'approved',
            actor_email: DEFAULT_ANALYST_EMAIL,
            after_state: { review_status: 'approved' },
            created_minutes_ago: 84,
        }),
        makeAudit({
            id: 'audit_utility_9999',
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: 'record_utility_9999_april',
            action: 'rejected',
            actor_email: DEFAULT_ANALYST_EMAIL,
            after_state: { review_status: 'rejected' },
            created_minutes_ago: 82,
        }),
        makeAudit({
            id: 'audit_travel_1004',
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: 'record_travel_TR1004',
            action: 'edited',
            actor_email: DEFAULT_ANALYST_EMAIL,
            after_state: { review_status: 'edited' },
            created_minutes_ago: 54,
        }),
    ]

    return {
        organizations: [organization],
        memberships,
        sources,
        batches: sortNewest([sapBatch, utilityBatch, travelBatch]),
        records: sortNewest(records),
        audits: sortNewest(audits),
    }
}

let memoryState: DemoState | null = null

function getState() {
    if (!hasBrowserStorage()) {
        if (!memoryState) {
            memoryState = createInitialState()
        }
        return clone(memoryState)
    }

    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
        const initial = createInitialState()
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
        return clone(initial)
    }

    try {
        return JSON.parse(raw) as DemoState
    } catch {
        const initial = createInitialState()
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
        return clone(initial)
    }
}

function saveState(state: DemoState) {
    const nextState = clone(state)
    if (!hasBrowserStorage()) {
        memoryState = nextState
        return
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState))
}

function findOrganization(state: DemoState, slug: string) {
    return state.organizations.find((organization) => organization.slug === slug) ?? state.organizations[0]
}

function membershipToSessionMembership(membership: Membership, organizationSlug: string): Membership {
    return {
        ...membership,
        organization_slug: organizationSlug,
    }
}

function resolveWorkspaceSession(state: DemoState, session: SessionContext): WorkspaceSession {
    const organization = findOrganization(state, session.organization)
    let membership = state.memberships.find((entry) => entry.organization === organization.id && entry.email === session.email)

    if (!membership) {
        membership = makeMembership(organization.id, session.email, 'viewer', 0)
        state.memberships.push(membership)
    }

    const memberships = state.memberships
        .filter((entry) => entry.organization === organization.id)
        .sort((left, right) => left.email.localeCompare(right.email))

    return {
        organization,
        membership: membershipToSessionMembership(membership, organization.slug),
        memberships: memberships.map((entry) => membershipToSessionMembership(entry, organization.slug)),
        permissions: {
            can_upload: membership.role === 'admin',
            can_review: membership.role === 'admin' || membership.role === 'analyst',
            can_seed: membership.role === 'admin',
        },
    }
}

function computeDashboard(state: DemoState, organizationSlug: string): DashboardPayload {
    const organization = findOrganization(state, organizationSlug)
    const records = state.records.filter((record) => record.organization === organization.id)
    const batches = state.batches.filter((batch) => batch.organization === organization.id)
    const audits = state.audits.filter((audit) => audit.organization === organization.id)

    const summary = {
        organization: organization.slug,
        total_records: records.length,
        pending_review: records.filter((record) => record.review_status === 'pending').length,
        suspicious_rows: records.filter((record) => Number(record.suspicious_score) > 0).length,
        approved_rows: records.filter((record) => record.review_status === 'approved').length,
        failed_imports: batches.filter((batch) => batch.status === 'failed').length,
    }

    const sourceOrder: DataSource['source_type'][] = ['sap', 'utility', 'travel']
    const source_breakdown = sourceOrder
        .map((sourceType) => {
            const source = state.sources.find((entry) => entry.organization === organization.id && entry.source_type === sourceType)
            if (!source) {
                return null
            }

            const sourceRecords = records.filter((record) => record.data_source === source.id)
            return {
                source_type: source.source_type,
                source_name: source.name,
                total_records: sourceRecords.length,
                pending_review: sourceRecords.filter((record) => record.review_status === 'pending').length,
                suspicious_rows: sourceRecords.filter((record) => Number(record.suspicious_score) > 0).length,
                approved_rows: sourceRecords.filter((record) => record.review_status === 'approved').length,
            }
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

    return {
        organization: organization.slug,
        summary,
        source_breakdown,
        recent_batches: sortNewest(batches).slice(0, 6),
        recent_records: sortNewest(records).slice(0, 10),
        recent_audits: sortNewest(audits).slice(0, 10),
    }
}

function createRecordFromParsedRow(input: {
    organization: Organization
    source: DataSource
    batch: ImportBatch
    row: Record<string, string>
    rowNumber: number
}): NormalizedRecord {
    const sourceType = input.source.source_type
    if (sourceType === 'sap') {
        const sourceKey = input.row.belnr || `SAP-${input.rowNumber}`
        const amount = parseNumber(input.row.menge)
        const unit = (input.row.einheit || '').toUpperCase()
        const isTransport = Boolean(input.row.purchase_category?.includes('transport'))
        const normalizedQuantity = unit === 'GAL' && amount !== null ? amount * 3.78541 : amount
        const activityType = (input.row.materialbeschreibung || input.row.purchase_category || 'procurement').toLowerCase()
        const suspiciousFlags = [
            amount !== null && amount < 0 ? 'negative-quantity' : '',
            amount !== null && amount > 10000 ? 'high-spend' : '',
            unit === 'GAL' ? 'unit-converted' : '',
        ].filter(Boolean)

        return makeRecord({
            organization: input.organization.id,
            data_source: input.source.id,
            import_batch: input.batch.id,
            source_system: input.source.system_of_record,
            source_record_key: sourceKey,
            activity_type: activityType,
            scope_category: isTransport ? '1' : '3',
            original_quantity: amount,
            original_unit: unit || 'USD',
            normalized_quantity: normalizedQuantity,
            normalized_unit: unit === 'GAL' ? 'L' : unit || 'USD',
            emission_factor: isTransport ? 0.28 : 0.18,
            emissions_kg_co2e: normalizedQuantity === null ? null : normalizedQuantity * (isTransport ? 0.28 : 0.18),
            raw_payload: input.row,
            normalized_payload: {
                source_system: input.source.system_of_record,
                source_record_key: sourceKey,
                activity_type: activityType,
                normalized_quantity: normalizedQuantity,
                normalized_unit: unit === 'GAL' ? 'L' : unit || 'USD',
                scope_category: isTransport ? '1' : '3',
            },
            suspicious_score: suspiciousFlags.length * 20,
            suspicious_flags: suspiciousFlags,
            review_status: 'pending',
            review_note: 'Imported from CSV and awaiting analyst review.',
            created_minutes_ago: -1 * (input.rowNumber + 1),
        })
    }

    if (sourceType === 'utility') {
        const sourceKey = `${input.row.meter_id || 'MTR'}-${input.row.billing_end || input.rowNumber}`
        const amount = parseNumber(input.row.kwh)
        const suspiciousFlags = [
            input.row.meter_id === 'MTR-9999' ? 'unknown-meter' : '',
            amount !== null && amount > 20000 ? 'usage-spike' : '',
        ].filter(Boolean)

        return makeRecord({
            organization: input.organization.id,
            data_source: input.source.id,
            import_batch: input.batch.id,
            source_system: input.source.system_of_record,
            source_record_key: sourceKey,
            activity_type: 'electricity',
            scope_category: '2',
            original_quantity: amount,
            original_unit: 'kWh',
            normalized_quantity: amount,
            normalized_unit: 'kWh',
            emission_factor: 0.42,
            emissions_kg_co2e: amount === null ? null : amount * 0.42,
            raw_payload: input.row,
            normalized_payload: {
                source_system: input.source.system_of_record,
                source_record_key: sourceKey,
                activity_type: 'electricity',
                facility_code: input.row.facility_code || input.row.meter_id,
                normalized_quantity: amount,
                normalized_unit: 'kWh',
                scope_category: '2',
            },
            suspicious_score: suspiciousFlags.length * 30,
            suspicious_flags: suspiciousFlags,
            review_status: suspiciousFlags.length > 0 ? 'pending' : 'approved',
            review_note: 'Utility row normalized in-browser.',
            approved_at: suspiciousFlags.length > 0 ? null : stamp(0),
            created_minutes_ago: -1 * (input.rowNumber + 1),
        })
    }

    const category = (input.row.category || 'travel').toLowerCase()
    const amount = parseNumber(input.row.amount)
    const distance = parseNumber(input.row.distance_km)
    const nights = parseNumber(input.row.nights)
    const normalizedQuantity = category === 'hotel' ? nights : distance ?? amount
    const factor = category === 'hotel' ? 12.5 : category === 'flight' ? 0.15 : category === 'ground' ? 0.09 : 0.04
    const suspiciousFlags = [
        category === 'flight' && input.row.destination_airport === 'JFK' ? 'long-haul' : '',
        category === 'hotel' && (nights ?? 0) >= 3 ? 'multi-night-stay' : '',
        normalizedQuantity === null ? 'missing-quantity' : '',
    ].filter(Boolean)

    return makeRecord({
        organization: input.organization.id,
        data_source: input.source.id,
        import_batch: input.batch.id,
        source_system: input.source.system_of_record,
        source_record_key: input.row.trip_id || `TRAVEL-${input.rowNumber}`,
        activity_type: category,
        scope_category: '3',
        original_quantity: normalizedQuantity,
        original_unit: category === 'hotel' ? 'nights' : 'km',
        normalized_quantity: normalizedQuantity,
        normalized_unit: category === 'hotel' ? 'nights' : 'km',
        emission_factor: factor,
        emissions_kg_co2e: normalizedQuantity === null ? null : normalizedQuantity * factor,
        raw_payload: input.row,
        normalized_payload: {
            source_system: input.source.system_of_record,
            source_record_key: input.row.trip_id || `TRAVEL-${input.rowNumber}`,
            activity_type: category,
            normalized_quantity: normalizedQuantity,
            normalized_unit: category === 'hotel' ? 'nights' : 'km',
            scope_category: '3',
        },
        suspicious_score: suspiciousFlags.length * 25,
        suspicious_flags: suspiciousFlags,
        review_status: suspiciousFlags.length > 0 ? 'pending' : 'approved',
        review_note: 'Travel record imported from CSV.',
        approved_at: suspiciousFlags.length > 0 ? null : stamp(0),
        created_minutes_ago: -1 * (input.rowNumber + 1),
    })
}

function ingestCsvBatch(state: DemoState, options: {
    organizationSlug: string
    dataSourceId: string
    label: string
    importedByEmail: string
    file: File
}) {
    const organization = findOrganization(state, options.organizationSlug)
    const source = state.sources.find((entry) => entry.id === options.dataSourceId && entry.organization === organization.id)

    if (!source) {
        throw new Error('Choose a valid data source before uploading.')
    }

    const batch = makeBatch({
        organization: organization.id,
        data_source: source.id,
        label: options.label || options.file.name,
        source_filename: options.file.name,
        status: 'processed',
        total_rows: 0,
        successful_rows: 0,
        failed_rows: 0,
        imported_by_email: options.importedByEmail,
        created_minutes_ago: -1,
    })

    return options.file.text().then((text) => {
        const rows = parseCsv(text)
        const createdRecords = rows.map((row, index) =>
            createRecordFromParsedRow({
                organization,
                source,
                batch,
                row,
                rowNumber: index + 1,
            }),
        )

        const nextBatch = {
            ...batch,
            total_rows: createdRecords.length,
            successful_rows: createdRecords.length,
            failed_rows: 0,
        }

        state.batches = sortNewest([nextBatch, ...state.batches])
        state.records = sortNewest([...createdRecords, ...state.records])
        state.audits = sortNewest([
            makeAudit({
                organization: organization.id,
                entity_type: 'import_batch',
                entity_id: nextBatch.id,
                action: 'uploaded',
                actor_email: options.importedByEmail,
                after_state: { rows: createdRecords.length, source_type: source.source_type },
                created_minutes_ago: -1,
            }),
            ...state.audits,
        ])

        return clone(nextBatch)
    })
}

function updateRecordReview(state: DemoState, recordId: string, payload: Record<string, unknown>, session: SessionContext) {
    const organization = findOrganization(state, session.organization)
    const recordIndex = state.records.findIndex((entry) => entry.id === recordId && entry.organization === organization.id)

    if (recordIndex < 0) {
        throw new Error('Record not found.')
    }

    const current = state.records[recordIndex]
    const decision = String(payload.decision || 'approved') as NormalizedRecord['review_status']
    const editedPayload = payload.normalized_payload && typeof payload.normalized_payload === 'object' ? (payload.normalized_payload as Record<string, unknown>) : current.normalized_payload
    const nextRecord: NormalizedRecord = {
        ...current,
        normalized_payload: editedPayload,
        review_status: decision,
        review_note: String(payload.comment || ''),
        edited_by_email: session.email,
        edited_at: stamp(0),
        approved_at: decision === 'approved' ? stamp(0) : null,
        updated_at: stamp(0),
    }

    state.records[recordIndex] = nextRecord
    state.records = sortNewest(state.records)
    state.audits = sortNewest([
        makeAudit({
            organization: organization.id,
            entity_type: 'normalized_record',
            entity_id: nextRecord.id,
            action: decision,
            actor_email: session.email,
            before_state: { review_status: current.review_status },
            after_state: { review_status: nextRecord.review_status },
            created_minutes_ago: 0,
        }),
        ...state.audits,
    ])

    return clone(nextRecord)
}

export async function loadDashboard(session: SessionContext) {
    const state = getState()
    const workspaceSession = resolveWorkspaceSession(state, session)
    saveState(state)

    return {
        dashboard: computeDashboard(state, workspaceSession.organization.slug),
        organizations: clone(state.organizations),
        sources: clone(state.sources.filter((source) => source.organization === workspaceSession.organization.id)),
        batches: clone(state.batches.filter((batch) => batch.organization === workspaceSession.organization.id)),
        records: clone(state.records.filter((record) => record.organization === workspaceSession.organization.id)),
        audits: clone(state.audits.filter((audit) => audit.organization === workspaceSession.organization.id)),
        session: workspaceSession,
    }
}

export async function seedDemo(session: SessionContext) {
    const state = createInitialState()
    resolveWorkspaceSession(state, session)
    saveState(state)
    return { status: 'seeded' }
}

export async function uploadBatch(formData: FormData, session: SessionContext) {
    const state = getState()
    const workspaceSession = resolveWorkspaceSession(state, session)

    if (!workspaceSession.permissions.can_upload) {
        throw new Error('Admin access is required to upload files or reset the demo.')
    }

    const organizationSlug = String(formData.get('organization_slug') || session.organization || DEFAULT_ORG_SLUG)
    const dataSourceId = String(formData.get('data_source_id') || '')
    const label = String(formData.get('label') || '')
    const importedByEmail = String(formData.get('imported_by_email') || session.email || DEFAULT_ADMIN_EMAIL)
    const file = formData.get('file')

    if (!(file instanceof File)) {
        throw new Error('Choose a CSV file before uploading.')
    }

    const batch = await ingestCsvBatch(state, {
        organizationSlug,
        dataSourceId,
        label,
        importedByEmail,
        file,
    })

    saveState(state)
    return batch
}

export async function reviewRecord(recordId: string, payload: Record<string, unknown>, session: SessionContext) {
    const state = getState()
    const workspaceSession = resolveWorkspaceSession(state, session)

    if (!workspaceSession.permissions.can_review) {
        throw new Error('This session is read-only.')
    }

    const updatedRecord = updateRecordReview(state, recordId, payload, session)
    saveState(state)
    return updatedRecord
}
