import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { loadDashboard, reviewRecord, seedDemo, uploadBatch } from './api'
import type { AuditEvent, DashboardPayload, DataSource, ImportBatch, NormalizedRecord, Organization, WorkspaceSession } from './types'

type ViewKey = 'dashboard' | 'upload' | 'review' | 'approved' | 'audit'

type ReviewFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'edited'
type SourceFilter = 'all' | 'sap' | 'utility' | 'travel'

const emptyDashboard: DashboardPayload = {
    organization: 'breathe-demo',
    summary: {
        organization: 'breathe-demo',
        total_records: 0,
        pending_review: 0,
        suspicious_rows: 0,
        approved_rows: 0,
        failed_imports: 0,
    },
    source_breakdown: [],
    recent_batches: [],
    recent_records: [],
    recent_audits: [],
}

const defaultForm = {
    organizationSlug: 'breathe-demo',
    sourceId: '',
    label: '',
    email: 'admin@breathe.local',
}

function formatNumber(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') return '—'
    const numeric = typeof value === 'string' ? Number(value) : value
    return Number.isFinite(numeric) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(numeric) : String(value)
}

function formatDate(value?: string | null) {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatJson(value: unknown) {
    return JSON.stringify(value ?? {}, null, 2)
}

function Badge({ children, tone = 'slate' }: { children: string; tone?: 'slate' | 'amber' | 'green' | 'red' | 'blue' }) {
    const tones = {
        slate: 'bg-slate-100 text-slate-700',
        amber: 'bg-amber-100 text-amber-800',
        green: 'bg-emerald-100 text-emerald-800',
        red: 'bg-rose-100 text-rose-800',
        blue: 'bg-sky-100 text-sky-800',
    }
    return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: number | undefined; tone?: 'slate' | 'amber' | 'green' | 'red' }) {
    const styles = {
        slate: 'bg-slate-50 text-slate-900',
        amber: 'bg-amber-50 text-amber-900',
        green: 'bg-emerald-50 text-emerald-900',
        red: 'bg-rose-50 text-rose-900',
    }

    return (
        <div className={`rounded-2xl px-4 py-4 ${styles[tone]}`}>
            <div className="text-sm font-medium opacity-80">{label}</div>
            <div className="mt-2 text-2xl font-semibold">{value === undefined ? '—' : formatNumber(value)}</div>
        </div>
    )
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
                    {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
                </div>
                {action}
            </div>
            <div className="mt-4">{children}</div>
        </section>
    )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
            {children}
        </label>
    )
}

export default function App() {
    const [view, setView] = useState<ViewKey>('dashboard')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState('')
    const [dashboard, setDashboard] = useState<DashboardPayload>(emptyDashboard)
    const [organizations, setOrganizations] = useState<Organization[]>([])
    const [sources, setSources] = useState<DataSource[]>([])
    const [batches, setBatches] = useState<ImportBatch[]>([])
    const [records, setRecords] = useState<NormalizedRecord[]>([])
    const [audits, setAudits] = useState<AuditEvent[]>([])
    const [sessionInfo, setSessionInfo] = useState<WorkspaceSession | null>(null)
    const [selectedRecord, setSelectedRecord] = useState<NormalizedRecord | null>(null)
    const [selectedBatchId, setSelectedBatchId] = useState('')
    const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
    const [search, setSearch] = useState('')
    const [editJson, setEditJson] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [form, setForm] = useState(defaultForm)

    async function reload() {
        setRefreshing(true)
        setError('')
        try {
            const data = await loadDashboard({ organization: form.organizationSlug, email: form.email })
            setDashboard(data.dashboard)
            setOrganizations(data.organizations)
            setSources(data.sources)
            setBatches(data.batches)
            setRecords(data.records)
            setAudits(data.audits)
            setSessionInfo(data.session)

            if (!selectedRecord && data.dashboard.recent_records.length > 0) {
                const first = data.dashboard.recent_records[0]
                setSelectedRecord(first)
                setEditJson(formatJson(first.normalized_payload))
            }
            if (!form.sourceId && data.sources.length > 0) {
                setForm((current) => ({ ...current, sourceId: data.sources[0].id }))
            }
            if (!selectedBatchId && data.dashboard.recent_batches.length > 0) {
                setSelectedBatchId(data.dashboard.recent_batches[0].id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load dashboard')
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        void reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const pendingRecords = useMemo(() => records.filter((record) => record.review_status === 'pending'), [records])
    const approvedRecords = useMemo(() => records.filter((record) => record.review_status === 'approved'), [records])
    const suspiciousRecords = useMemo(() => records.filter((record) => Number(record.suspicious_score) > 0), [records])
    const batchRecords = useMemo(() => records.filter((record) => record.import_batch === selectedBatchId), [records, selectedBatchId])
    const selectedBatch = useMemo(() => batches.find((batch) => batch.id === selectedBatchId) ?? null, [batches, selectedBatchId])
    const canUpload = sessionInfo?.permissions.can_upload ?? false
    const canReview = sessionInfo?.permissions.can_review ?? false
    const canSeed = sessionInfo?.permissions.can_seed ?? false

    const visibleRecords = useMemo(() => {
        return records.filter((record) => {
            const matchesReview = reviewFilter === 'all' || record.review_status === reviewFilter
            const matchesSource = sourceFilter === 'all' || record.data_source === sources.find((source) => source.source_type === sourceFilter)?.id
            const matchesBatch = !selectedBatchId || record.import_batch === selectedBatchId
            const matchesSearch =
                search.trim().length === 0 ||
                [record.activity_type, record.source_system, record.source_record_key, record.review_status].join(' ').toLowerCase().includes(search.trim().toLowerCase())
            return matchesReview && matchesSource && matchesBatch && matchesSearch
        })
    }, [records, reviewFilter, sourceFilter, selectedBatchId, search, sources])

    async function handleSeed() {
        await seedDemo({ organization: form.organizationSlug, email: form.email })
        await reload()
    }

    async function handleUpload(event: FormEvent) {
        event.preventDefault()
        if (!file || !form.sourceId) {
            setError('Choose a source and CSV file before uploading.')
            return
        }
        const body = new FormData()
        body.append('organization_slug', form.organizationSlug)
        body.append('data_source_id', form.sourceId)
        body.append('label', form.label || file.name)
        body.append('imported_by_email', form.email)
        body.append('file', file)
        await uploadBatch(body, { organization: form.organizationSlug, email: form.email })
        setFile(null)
        setForm((current) => ({ ...current, label: '' }))
        await reload()
        setView('review')
    }

    async function handleReview(decision: 'approved' | 'rejected') {
        if (!selectedRecord) return
        let normalizedPayload: Record<string, unknown>
        try {
            normalizedPayload = JSON.parse(editJson)
        } catch {
            setError('Normalized payload must be valid JSON.')
            return
        }
        await reviewRecord(selectedRecord.id, {
            decision,
            comment: decision === 'approved' ? 'Analyst approved after review.' : 'Analyst rejected during review.',
            normalized_payload: normalizedPayload,
        }, { organization: form.organizationSlug, email: form.email })
        await reload()
    }

    function chooseRecord(record: NormalizedRecord) {
        setSelectedRecord(record)
        setEditJson(formatJson(record.normalized_payload))
    }

    useEffect(() => {
        if (visibleRecords.length === 0) {
            return
        }

        if (!selectedRecord || !visibleRecords.some((record) => record.id === selectedRecord.id)) {
            chooseRecord(visibleRecords[0])
        }
    }, [selectedRecord, visibleRecords])

    const selectedRecordIsVisible = selectedRecord ? visibleRecords.some((record) => record.id === selectedRecord.id) : false

    const navItems: Array<{ key: ViewKey; label: string }> = [
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'upload', label: 'Upload data' },
        { key: 'review', label: 'Review queue' },
        { key: 'approved', label: 'Approved records' },
        { key: 'audit', label: 'Audit trail' },
    ]

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(196,139,44,0.12),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#eef3f1_100%)] text-slate-900">
            <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
                <aside className="hidden w-64 shrink-0 rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur lg:block">
                    <div className="mb-8">
                        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Breathe ESG</p>
                        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Analyst workspace</h1>
                        <p className="mt-2 text-sm text-slate-600">Enterprise ingestion, normalization, and sign-off in one place.</p>
                    </div>
                    <nav className="space-y-2">
                        {navItems.map((item) => (
                            <button
                                key={item.key}
                                onClick={() => setView(item.key)}
                                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${view === item.key ? 'bg-[#245447] text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
                            >
                                <span>{item.label}</span>
                                <span className="text-xs opacity-70">{item.key === 'review' ? pendingRecords.length : ''}</span>
                            </button>
                        ))}
                    </nav>
                    <button
                        onClick={handleSeed}
                        disabled={!canSeed}
                        className="mt-6 w-full rounded-2xl border border-slate-200 bg-sand px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-amber-200 hover:bg-amber-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    >
                        Reload demo data
                    </button>
                    <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
                        <div className="font-semibold text-slate-800">Organization</div>
                        <div className="mt-1">{organizations.find((organization) => organization.slug === form.organizationSlug)?.name || form.organizationSlug}</div>
                    </div>
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                        <div className="text-xs uppercase tracking-wide text-slate-500">Active session</div>
                        <div className="mt-2 font-semibold text-slate-900">{form.email}</div>
                        <div className="mt-1 text-slate-600">Role: {sessionInfo?.membership.role || 'viewer'}</div>
                        <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Switch user</label>
                        <select className="input mt-2" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}>
                            {sessionInfo?.memberships.map((member) => <option key={member.id} value={member.email}>{member.email} · {member.role}</option>)}
                            {!sessionInfo?.memberships.some((member) => member.email === form.email) ? <option value={form.email}>{form.email}</option> : null}
                        </select>
                        <button onClick={reload} className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Apply session</button>
                    </div>
                </aside>

                <main className="flex-1 space-y-6">
                    <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/92 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.09)] backdrop-blur">
                        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
                            <div>
                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                                    <span>Prototype</span>
                                    <Badge tone="green">Vercel-only demo</Badge>
                                    <Badge tone="blue">Tenant breathe-demo</Badge>
                                </div>
                                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Enterprise carbon intake review</h2>
                                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                                    SAP fuel and procurement, utility electricity, and travel activity land here, are normalized, and wait for analyst sign-off before audit lock.
                                </p>
                                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                        <div className="text-xs uppercase tracking-wide text-slate-500">Ingested records</div>
                                        <div className="mt-1 text-2xl font-semibold text-slate-950">{dashboard.summary.total_records}</div>
                                    </div>
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                        <div className="text-xs uppercase tracking-wide text-amber-700">Pending review</div>
                                        <div className="mt-1 text-2xl font-semibold text-amber-900">{dashboard.summary.pending_review}</div>
                                    </div>
                                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                                        <div className="text-xs uppercase tracking-wide text-rose-700">Suspicious rows</div>
                                        <div className="mt-1 text-2xl font-semibold text-rose-900">{dashboard.summary.suspicious_rows}</div>
                                    </div>
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                        <div className="text-xs uppercase tracking-wide text-emerald-700">Approved rows</div>
                                        <div className="mt-1 text-2xl font-semibold text-emerald-900">{dashboard.summary.approved_rows}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[1.5rem] border border-slate-200 bg-[#f7faf6] p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-500">Connection</div>
                                    <div className="mt-2 text-lg font-semibold text-slate-950">Browser state healthy</div>
                                    <p className="mt-1 text-sm text-slate-600">The demo keeps its data in the browser, so the whole app can ship from Vercel without a separate backend.</p>
                                </div>
                                <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-500">Queue depth</div>
                                    <div className="mt-2 text-lg font-semibold text-slate-950">{pendingRecords.length} rows waiting</div>
                                    <p className="mt-1 text-sm text-slate-600">Open the review queue to inspect raw data, adjust normalized JSON, and lock approved records.</p>
                                </div>
                                <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
                                    <div className="text-xs uppercase tracking-wide text-amber-700">Risk signal</div>
                                    <div className="mt-2 text-lg font-semibold text-amber-900">{suspiciousRecords.length} suspicious rows</div>
                                    <p className="mt-1 text-sm text-amber-800/90">Flags are preserved on every row so analysts can trace why the system surfaced a record.</p>
                                </div>
                                <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4">
                                    <div className="text-xs uppercase tracking-wide text-emerald-700">Audit state</div>
                                    <div className="mt-2 text-lg font-semibold text-emerald-900">{audits.length} audit events</div>
                                    <p className="mt-1 text-sm text-emerald-800/90">Ingestion and review actions are stored in an append-only audit trail.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="lg:hidden rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                        <div className="grid grid-cols-2 gap-2">
                            {navItems.map((item) => (
                                <button key={item.key} onClick={() => setView(item.key)} className={`rounded-2xl px-4 py-3 text-sm font-medium ${view === item.key ? 'bg-[#245447] text-white' : 'bg-slate-50 text-slate-700'}`}>
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{error}</div> : null}
                    {loading ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading dashboard…</div> : null}
                    {refreshing ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Refreshing data…</div> : null}

                    {view === 'dashboard' ? (
                        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                            <Panel title="Source breakdown" subtitle="How the tenant is distributed by ingestion source" action={<button onClick={reload} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Refresh</button>}>
                                <div className="grid gap-4 md:grid-cols-3">
                                    {dashboard.source_breakdown.map((source) => (
                                        <div key={source.source_type} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-900">{source.source_name}</div>
                                                    <div className="mt-1 text-xs text-slate-500">{source.source_type}</div>
                                                </div>
                                                <Badge tone={source.source_type === 'sap' ? 'blue' : source.source_type === 'utility' ? 'amber' : 'green'}>{source.source_type}</Badge>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                                <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Records</div><div className="mt-1 text-sm font-semibold">{source.total_records}</div></div>
                                                <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Pending</div><div className="mt-1 text-sm font-semibold">{source.pending_review}</div></div>
                                                <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Suspicious</div><div className="mt-1 text-sm font-semibold">{source.suspicious_rows}</div></div>
                                                <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Approved</div><div className="mt-1 text-sm font-semibold">{source.approved_rows}</div></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <Metric label="Total records" value={dashboard.summary.total_records} />
                                    <Metric label="Pending review" value={dashboard.summary.pending_review} tone="amber" />
                                    <Metric label="Suspicious rows" value={dashboard.summary.suspicious_rows} tone="red" />
                                    <Metric label="Approved rows" value={dashboard.summary.approved_rows} tone="green" />
                                </div>
                            </Panel>

                            <Panel title="Recent batches" subtitle="Click a batch to move into review">
                                <div className="space-y-3">
                                    {dashboard.recent_batches.map((batch) => {
                                        const source = sources.find((entry) => entry.id === batch.data_source)
                                        return (
                                            <button key={batch.id} onClick={() => { setSelectedBatchId(batch.id); setView('review') }} className={`w-full rounded-2xl border p-4 text-left transition ${selectedBatchId === batch.id ? 'border-[#245447] bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-900">{batch.label}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{source?.name || 'Source'} · {batch.source_filename || 'uploaded file'}</div>
                                                    </div>
                                                    <Badge tone={batch.status === 'failed' ? 'red' : batch.status === 'processed' ? 'green' : 'amber'}>{batch.status}</Badge>
                                                </div>
                                                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Rows</div><div className="mt-1 text-sm font-semibold">{batch.total_rows}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Success</div><div className="mt-1 text-sm font-semibold">{batch.successful_rows}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="uppercase tracking-wide opacity-70">Failed</div><div className="mt-1 text-sm font-semibold">{batch.failed_rows}</div></div>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                            </Panel>
                        </div>
                    ) : null}

                    {view === 'upload' ? (
                        <Panel title="Upload source data" subtitle="CSV upload mirrors the realistic export shape for SAP, utility portals, and travel systems.">
                            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpload}>
                                <Field label="Organization slug"><input className="input" value={form.organizationSlug} onChange={(event) => setForm({ ...form, organizationSlug: event.target.value })} /></Field>
                                <Field label="Analyst email"><input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
                                <Field label="Data source">
                                    <select className="input" value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: event.target.value })}>
                                        <option value="">Choose one…</option>
                                        {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="Batch label"><input className="input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="April utility export" /></Field>
                                <div className="md:col-span-2"><label className="mb-2 block text-sm font-medium text-slate-700">CSV file</label><input className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></div>
                                <div className="md:col-span-2 flex flex-wrap gap-3">
                                    <button className="rounded-2xl bg-[#245447] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1f463a] disabled:cursor-not-allowed disabled:bg-slate-300" type="submit" disabled={!canUpload}>Upload and normalize</button>
                                    <button className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100" type="button" onClick={handleSeed} disabled={!canSeed}>Load demo seed</button>
                                </div>
                                {!canUpload || !canSeed ? <div className="md:col-span-2 text-sm text-slate-500">Admin access is required to upload files or reset the demo seed.</div> : null}
                            </form>
                        </Panel>
                    ) : null}

                    {view === 'review' ? (
                        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                            <Panel title="Review queue" subtitle="Filter, inspect raw versus normalized values, then approve or reject."
                                action={
                                    <div className="grid gap-2 sm:grid-cols-4">
                                        <select className="input" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
                                            <option value="">All batches</option>
                                            {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}
                                        </select>
                                        <select className="input" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                                            <option value="all">All sources</option><option value="sap">SAP</option><option value="utility">Utility</option><option value="travel">Travel</option>
                                        </select>
                                        <select className="input" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}>
                                            <option value="all">All status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="edited">Edited</option>
                                        </select>
                                        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows…" />
                                    </div>
                                }>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Activity</th><th className="py-3 pr-4">Source</th><th className="py-3 pr-4">Scope</th><th className="py-3 pr-4">Quantity</th><th className="py-3 pr-4">Flags</th><th className="py-3 pr-4">Status</th></tr></thead>
                                        <tbody>
                                            {visibleRecords.length === 0 ? (
                                                <tr>
                                                    <td className="py-8 text-sm text-slate-500" colSpan={6}>
                                                        No rows match the current filters. Clear the batch, status, source, or search filter to reopen the queue.
                                                    </td>
                                                </tr>
                                            ) : visibleRecords.map((record) => {
                                                const source = sources.find((entry) => entry.id === record.data_source)
                                                return (
                                                    <tr key={record.id} className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${selectedRecord?.id === record.id ? 'bg-emerald-50' : ''}`} onClick={() => chooseRecord(record)}>
                                                        <td className="py-3 pr-4 font-medium text-slate-900">{record.activity_type}</td>
                                                        <td className="py-3 pr-4 text-slate-600">{source?.name || record.source_system}</td>
                                                        <td className="py-3 pr-4">Scope {record.scope_category}</td>
                                                        <td className="py-3 pr-4">{formatNumber(record.normalized_quantity)} {record.normalized_unit}</td>
                                                        <td className="py-3 pr-4"><div className="flex flex-wrap gap-2">{record.suspicious_flags.length > 0 ? record.suspicious_flags.map((flag) => <Badge key={flag} tone="red">{flag}</Badge>) : <Badge tone="green">clean</Badge>}</div></td>
                                                        <td className="py-3 pr-4"><Badge tone={record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : record.review_status === 'edited' ? 'blue' : 'amber'}>{record.review_status}</Badge></td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>

                            <div className="space-y-6 xl:sticky xl:top-6">
                                <Panel title="Batch detail" subtitle={selectedBatch ? `${selectedBatch.label} · ${selectedBatch.total_rows} rows` : 'Pick a batch to inspect its rows'}>
                                    {selectedBatch ? (
                                        <div className="space-y-3 text-sm">
                                            <div className="rounded-2xl bg-slate-50 p-4">
                                                <div className="font-semibold text-slate-900">{selectedBatch.label}</div>
                                                <div className="mt-1 text-slate-600">{selectedBatch.source_filename || 'uploaded file'} · {formatDate(selectedBatch.created_at)}</div>
                                                <div className="mt-1 text-slate-600">{selectedBatch.successful_rows} processed, {selectedBatch.failed_rows} failed</div>
                                            </div>
                                            <div className="space-y-2">
                                                {batchRecords.slice(0, 6).map((record) => (
                                                    <button key={record.id} type="button" onClick={() => chooseRecord(record)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:bg-slate-50">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="font-medium text-slate-900">{record.activity_type}</span>
                                                            <Badge tone={record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : 'amber'}>{record.review_status}</Badge>
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-500">{record.source_record_key || 'no source key'} · {formatNumber(record.emissions_kg_co2e)} kgCO2e</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </Panel>

                                <Panel title="Selected record" subtitle={selectedRecord ? selectedRecord.source_system : 'Pick a row to inspect raw versus normalized data'}>
                                    {selectedRecord ? (
                                        <div className="space-y-4">
                                            {!selectedRecordIsVisible ? <Badge tone="amber">Selection is outside the current filters</Badge> : null}
                                            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="font-semibold text-slate-900">{selectedRecord.source_record_key || 'No source key'}</div>
                                                    <Badge tone={selectedRecord.review_status === 'approved' ? 'green' : selectedRecord.review_status === 'rejected' ? 'red' : selectedRecord.review_status === 'edited' ? 'blue' : 'amber'}>{selectedRecord.review_status}</Badge>
                                                </div>
                                                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                                                    <div className="rounded-2xl bg-white px-3 py-2"><div className="text-xs uppercase tracking-wide text-slate-500">Emissions</div><div className="mt-1 font-semibold text-slate-900">{formatNumber(selectedRecord.emissions_kg_co2e)} kgCO2e</div></div>
                                                    <div className="rounded-2xl bg-white px-3 py-2"><div className="text-xs uppercase tracking-wide text-slate-500">Scope</div><div className="mt-1 font-semibold text-slate-900">Scope {selectedRecord.scope_category}</div></div>
                                                    <div className="rounded-2xl bg-white px-3 py-2"><div className="text-xs uppercase tracking-wide text-slate-500">Quantity</div><div className="mt-1 font-semibold text-slate-900">{formatNumber(selectedRecord.normalized_quantity)} {selectedRecord.normalized_unit}</div></div>
                                                    <div className="rounded-2xl bg-white px-3 py-2"><div className="text-xs uppercase tracking-wide text-slate-500">Flags</div><div className="mt-1 font-semibold text-slate-900">{selectedRecord.suspicious_flags.length}</div></div>
                                                </div>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div>
                                                    <label className="mb-2 block text-sm font-medium text-slate-700">Raw payload</label>
                                                    <textarea className="input min-h-56 font-mono text-xs" readOnly value={formatJson(selectedRecord.raw_payload)} />
                                                </div>
                                                <div>
                                                    <label className="mb-2 block text-sm font-medium text-slate-700">Normalized payload JSON</label>
                                                    <textarea className="input min-h-56 font-mono text-xs" value={editJson} onChange={(event) => setEditJson(event.target.value)} />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">{selectedRecord.suspicious_flags.map((flag) => <Badge key={flag} tone="red">{flag}</Badge>)}</div>
                                            <div className="flex flex-wrap gap-3">
                                                <button type="button" className="rounded-2xl bg-[#245447] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300" onClick={() => handleReview('approved')} disabled={!canReview}>Approve</button>
                                                <button type="button" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100" onClick={() => handleReview('rejected')} disabled={!canReview}>Reject</button>
                                            </div>
                                            {!canReview ? <div className="text-sm text-slate-500">Read-only sessions can inspect rows but cannot approve or reject them.</div> : null}
                                        </div>
                                    ) : null}
                                </Panel>
                            </div>
                        </div>
                    ) : null}

                    {view === 'approved' ? (
                        <Panel title="Approved records" subtitle="Rows locked for audit">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-left text-sm">
                                    <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-3 pr-4">Activity</th><th className="py-3 pr-4">Emissions</th><th className="py-3 pr-4">Approved</th><th className="py-3 pr-4">Source</th></tr></thead>
                                    <tbody>
                                        {approvedRecords.map((record) => {
                                            const source = sources.find((entry) => entry.id === record.data_source)
                                            return (
                                                <tr key={record.id} className="border-t border-slate-100">
                                                    <td className="py-3 pr-4 font-medium text-slate-900">{record.activity_type}</td>
                                                    <td className="py-3 pr-4">{formatNumber(record.emissions_kg_co2e)} kgCO2e</td>
                                                    <td className="py-3 pr-4">{formatDate(record.approved_at)}</td>
                                                    <td className="py-3 pr-4">{source?.name || record.source_system}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    ) : null}

                    {view === 'audit' ? (
                        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                            <Panel title="Audit trail" subtitle="Ingestion and review actions">
                                <div className="space-y-3">
                                    {audits.map((event) => (
                                        <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                                            <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{event.entity_type}</Badge><Badge tone="slate">{event.action}</Badge><span className="text-slate-500">{formatDate(event.created_at)}</span></div>
                                            <div className="mt-2 font-medium text-slate-900">Actor: {event.actor_email || 'system'}</div>
                                            <div className="mt-1 text-slate-600">Entity ID: {event.entity_id}</div>
                                        </div>
                                    ))}
                                </div>
                            </Panel>

                            <Panel title="Recent source rows" subtitle="Jump back into review">
                                <div className="space-y-3">
                                    {dashboard.recent_records.map((record) => (
                                        <button key={record.id} type="button" onClick={() => { chooseRecord(record); setView('review') }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="font-medium text-slate-900">{record.activity_type}</div>
                                                    <div className="mt-1 text-xs text-slate-500">{record.source_system} · {record.source_record_key || 'no source key'}</div>
                                                </div>
                                                <Badge tone={record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : 'amber'}>{record.review_status}</Badge>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Panel>
                        </div>
                    ) : null}
                </main>
            </div>
        </div>
    )
}
