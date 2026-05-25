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

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'red' | 'blue' }) {
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

function ErrorBox({ error }: { error: string }) {
    const [showRaw, setShowRaw] = useState(false)
    if (!error) return null
    const looksLikeHtml = /^\s*<\!doctype|^\s*<html|^\s*<\w+/i.test(error)
    const message = looksLikeHtml ? 'Server returned an unexpected HTML response. The resource may be missing.' : error

    return (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div>{message}</div>
            {looksLikeHtml ? (
                <button className="mt-2 text-xs underline" onClick={() => setShowRaw((s) => !s)}>{showRaw ? 'Hide details' : 'Show details'}</button>
            ) : null}
            {showRaw ? <pre className="mt-2 max-h-40 overflow-auto rounded p-2 bg-white text-xs text-slate-700">{error}</pre> : null}
        </div>
    )
}

export default function App() {
    const [view, setView] = useState<ViewKey>('dashboard')
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') {
            return 'light'
        }
        return window.localStorage.getItem('breathe-esg-theme') === 'dark' ? 'dark' : 'light'
    })
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

    useEffect(() => {
        document.documentElement.dataset.theme = theme
        window.localStorage.setItem('breathe-esg-theme', theme)
    }, [theme])

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

    function IconStats() {
        return (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                <rect x="3" y="11" width="4" height="10" rx="1" fill="#c7e9de" />
                <rect x="10" y="7" width="4" height="14" rx="1" fill="#bfe3ff" />
                <rect x="17" y="3" width="4" height="18" rx="1" fill="#ffd7b6" />
            </svg>
        )
    }

    function StatCard({ label, value, trend, icon }: { label: string; value: number | undefined; trend?: string; icon?: ReactNode }) {
        return (
            <div className="stat-card shadow-soft flex items-center justify-between gap-4">
                <div>
                    <div className="text-xs font-medium text-slate-500">{label}</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">{value === undefined ? '—' : formatNumber(value)}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="text-xs text-slate-500">{trend ?? ''}</div>
                    <div className="rounded-full bg-slate-50 p-2">{icon ?? <IconStats />}</div>
                </div>
            </div>
        )
    }

    function IconGrid() {
        return (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="#cbd5e1" />
            </svg>
        )
    }

    function ThemeIcon() {
        return theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Z" fill="currentColor" />
                <path d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" fill="currentColor" opacity="0.9" />
            </svg>
        ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 12.5A8.5 8.5 0 1 1 11.5 3 7 7 0 0 0 21 12.5Z" fill="currentColor" />
            </svg>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto min-h-screen max-w-[1600px] px-4 py-4 lg:px-6">
                <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
                    <aside className="hidden lg:block">
                        <div className="sticky-top top-4 space-y-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-soft">
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Breathe ESG</div>
                                <div className="mt-2 text-lg font-semibold">Analyst workspace</div>
                                <div className="mt-1 text-sm leading-6 text-slate-500">Enterprise intake, review, and audit in one streamlined surface.</div>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                                <div className="text-xs text-slate-500">Organization</div>
                                <div className="mt-1 truncate text-sm font-medium">{organizations.find((org) => org.slug === form.organizationSlug)?.name || form.organizationSlug}</div>
                            </div>

                            <nav className="space-y-1">
                                {navItems.map((item) => (
                                    <button
                                        key={item.key}
                                        onClick={() => setView(item.key)}
                                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${view === item.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                                    >
                                        <span>{item.label}</span>
                                        {item.key === 'review' ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${view === item.key ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-600'}`}>{pendingRecords.length}</span> : null}
                                    </button>
                                ))}
                            </nav>

                            <button onClick={handleSeed} disabled={!canSeed} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                                Reload demo data
                            </button>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                <div className="text-xs uppercase tracking-wide text-slate-500">Active session</div>
                                <div className="mt-1 font-medium text-slate-900">{form.email}</div>
                                <div className="mt-1 text-slate-500">{sessionInfo?.membership.role || 'viewer'}</div>
                                <select className="input mt-3 text-sm" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}>
                                    {sessionInfo?.memberships.map((member) => <option key={member.id} value={member.email}>{member.email} · {member.role}</option>)}
                                    {!sessionInfo?.memberships.some((member) => member.email === form.email) ? <option value={form.email}>{form.email}</option> : null}
                                </select>
                            </div>
                        </div>
                    </aside>

                    <main className="space-y-6">
                        <div className="sticky-top top-4 z-30 rounded-[20px] border border-slate-200 bg-white/95 px-4 py-3 shadow-soft backdrop-blur">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                                        <span>Prototype</span>
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">Vercel-only demo</span>
                                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">Tenant breathe-demo</span>
                                    </div>
                                    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Enterprise carbon intake review</h1>
                                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 sm:text-base">
                                        SAP, utility, and travel activity flow into a clean review queue for analyst sign-off and audit locking.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                                        onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                                    >
                                        <span className="text-slate-500"><ThemeIcon /></span>
                                        {theme === 'light' ? 'Dark mode' : 'Light mode'}
                                    </button>
                                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows, batches, sources…" className="input w-full max-w-xs rounded-xl bg-slate-50" />
                                    <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800">Invite</button>
                                </div>
                            </div>
                        </div>

                        {error ? <ErrorBox error={error} /> : null}
                        {loading ? <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 shadow-soft">Loading dashboard…</div> : null}
                        {refreshing ? <div className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500 shadow-soft">Refreshing data…</div> : null}

                        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <StatCard label="Total Records" value={dashboard.summary.total_records} trend="+2.1% vs week" />
                            <StatCard label="Pending Review" value={dashboard.summary.pending_review} trend="-0.4%" />
                            <StatCard label="Suspicious Rows" value={dashboard.summary.suspicious_rows} trend="+4.3%" />
                            <StatCard label="Approved Rows" value={dashboard.summary.approved_rows} trend="+1.2%" />
                        </section>

                        <section className="grid gap-6 xl:grid-cols-12">
                            <div className="space-y-6 xl:col-span-8">
                                <Panel title="Source breakdown" subtitle="Share of ingestion by source and state" action={<button onClick={reload} className="rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Refresh</button>}>
                                    <div className="grid gap-4 md:grid-cols-3">
                                        {dashboard.source_breakdown.map((source) => (
                                            <div key={source.source_type} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 transition hover:bg-white hover:shadow-soft">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-900">{source.source_name}</div>
                                                        <div className="mt-1 text-xs text-slate-500">{source.source_type}</div>
                                                    </div>
                                                    <Badge tone={source.source_type === 'sap' ? 'blue' : source.source_type === 'utility' ? 'amber' : 'green'}>{source.total_records}</Badge>
                                                </div>
                                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600">
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Pending</div><div className="mt-1 text-sm font-medium text-slate-900">{source.pending_review}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Approved</div><div className="mt-1 text-sm font-medium text-slate-900">{source.approved_rows}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Suspicious</div><div className="mt-1 text-sm font-medium text-slate-900">{source.suspicious_rows}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Rows</div><div className="mt-1 text-sm font-medium text-slate-900">{source.total_records}</div></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>

                                <Panel
                                    title="Review queue"
                                    subtitle="Sticky header table with compact rows, zebra hover, and premium status chips"
                                    action={
                                        <div className="flex flex-wrap gap-2">
                                            <select className="input w-44 rounded-xl bg-slate-50 text-sm" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}>
                                                <option value="">All batches</option>
                                                {batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}
                                            </select>
                                            <select className="input w-36 rounded-xl bg-slate-50 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                                                <option value="all">All sources</option><option value="sap">SAP</option><option value="utility">Utility</option><option value="travel">Travel</option>
                                            </select>
                                            <select className="input w-36 rounded-xl bg-slate-50 text-sm" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}>
                                                <option value="all">All status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="edited">Edited</option>
                                            </select>
                                        </div>
                                    }
                                >
                                    <div className="max-h-[620px] overflow-auto rounded-2xl border border-slate-200 bg-white">
                                        <table className="min-w-full text-left text-sm">
                                            <thead className="sticky top-0 z-10 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-400 backdrop-blur">
                                                <tr>
                                                    <th className="px-4 py-3 font-semibold">Activity</th>
                                                    <th className="px-4 py-3 font-semibold">Source</th>
                                                    <th className="px-4 py-3 font-semibold">Scope</th>
                                                    <th className="px-4 py-3 font-semibold">Quantity</th>
                                                    <th className="px-4 py-3 font-semibold">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {visibleRecords.length === 0 ? (
                                                    <tr>
                                                        <td className="px-4 py-10 text-sm text-slate-500" colSpan={5}>
                                                            <div className="flex flex-col items-start gap-1">
                                                                <span className="font-medium text-slate-700">No rows match the current filters.</span>
                                                                <span>Try clearing the source, batch, or status filters.</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : visibleRecords.map((record, index) => {
                                                    const source = sources.find((entry) => entry.id === record.data_source)
                                                    const tone = record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : record.review_status === 'edited' ? 'blue' : 'amber'
                                                    return (
                                                        <tr key={record.id} onClick={() => chooseRecord(record)} className={`cursor-pointer transition duration-150 hover:bg-slate-50 ${selectedRecord?.id === record.id ? 'bg-emerald-50/50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                                            <td className="px-4 py-3 font-medium text-slate-900">{record.activity_type}</td>
                                                            <td className="px-4 py-3 text-slate-600">{source?.name || record.source_system}</td>
                                                            <td className="px-4 py-3 text-slate-600">Scope {record.scope_category}</td>
                                                            <td className="px-4 py-3 text-slate-600">{formatNumber(record.normalized_quantity)} {record.normalized_unit}</td>
                                                            <td className="px-4 py-3"><Badge tone={tone}>{record.review_status}</Badge></td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            </div>

                            <div className="space-y-6 xl:col-span-4">
                                <Panel title="Batch detail" subtitle={selectedBatch ? `${selectedBatch.label} · ${selectedBatch.total_rows} rows` : 'Pick a batch to inspect its rows'}>
                                    {selectedBatch ? (
                                        <div className="space-y-3 text-sm">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-soft/30">
                                                <div className="font-medium text-slate-900">{selectedBatch.label}</div>
                                                <div className="mt-1 text-slate-500">{selectedBatch.source_filename || 'uploaded file'}</div>
                                                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                                    <span>{formatDate(selectedBatch.created_at)}</span>
                                                    <span>•</span>
                                                    <span>{selectedBatch.successful_rows} processed</span>
                                                    <span>•</span>
                                                    <span>{selectedBatch.failed_rows} failed</span>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                {batchRecords.slice(0, 6).map((record) => (
                                                    <button key={record.id} type="button" onClick={() => chooseRecord(record)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <span className="font-medium text-slate-900">{record.activity_type}</span>
                                                            <Badge tone={record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : 'amber'}>{record.review_status}</Badge>
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-500">{record.source_record_key || 'no source key'} · {formatNumber(record.emissions_kg_co2e)} kgCO2e</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : <div className="text-sm text-slate-500">Select a batch from the review queue.</div>}
                                </Panel>

                                <Panel title="Selected record" subtitle={selectedRecord ? selectedRecord.source_system : 'Pick a row to inspect raw versus normalized data'}>
                                    {selectedRecord ? (
                                        <div className="space-y-4">
                                            {!selectedRecordIsVisible ? <Badge tone="amber">Outside current filters</Badge> : null}

                                            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-medium text-slate-900">{selectedRecord.source_record_key || 'No source key'}</div>
                                                        <div className="mt-1 text-sm text-slate-500">{formatNumber(selectedRecord.emissions_kg_co2e)} kgCO2e · Scope {selectedRecord.scope_category}</div>
                                                    </div>
                                                    <Badge tone={selectedRecord.review_status === 'approved' ? 'green' : selectedRecord.review_status === 'rejected' ? 'red' : selectedRecord.review_status === 'edited' ? 'blue' : 'amber'}>{selectedRecord.review_status}</Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Quantity</div><div className="mt-1 font-medium text-slate-900">{formatNumber(selectedRecord.normalized_quantity)} {selectedRecord.normalized_unit}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Flags</div><div className="mt-1 font-medium text-slate-900">{selectedRecord.suspicious_flags.length}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Edited</div><div className="mt-1 font-medium text-slate-900">{selectedRecord.edited_at ? 'Yes' : 'No'}</div></div>
                                                    <div className="rounded-xl bg-white px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-slate-500">Review</div><div className="mt-1 font-medium text-slate-900">{selectedRecord.review_status}</div></div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                                                <div className="flex items-center gap-2 text-sm">
                                                    <button className="rounded-full bg-slate-900 px-3 py-1.5 font-medium text-white transition hover:bg-slate-800">Normalized JSON</button>
                                                    <button className="rounded-full px-3 py-1.5 font-medium text-slate-500 transition hover:bg-slate-100">Raw payload</button>
                                                    <button className="rounded-full px-3 py-1.5 font-medium text-slate-500 transition hover:bg-slate-100">History</button>
                                                </div>
                                                <div className="grid gap-3 md:grid-cols-2">
                                                    <div>
                                                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Normalized JSON</div>
                                                        <div className="code-panel max-h-72 whitespace-pre-wrap leading-6">{formatJson(selectedRecord.normalized_payload)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Raw payload</div>
                                                        <div className="code-panel max-h-72 whitespace-pre-wrap leading-6">{formatJson(selectedRecord.raw_payload)}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {selectedRecord.suspicious_flags.length > 0 ? selectedRecord.suspicious_flags.map((flag) => <Badge key={flag} tone="red">{flag}</Badge>) : <Badge tone="green">clean</Badge>}
                                            </div>

                                            <div className="flex gap-3">
                                                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => handleReview('approved')} disabled={!canReview}>Approve</button>
                                                <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => handleReview('rejected')} disabled={!canReview}>Reject</button>
                                            </div>
                                        </div>
                                    ) : <div className="text-sm text-slate-500">Select a row from the review queue.</div>}
                                </Panel>

                                <Panel title="Activity feed" subtitle="Recent audit events and imports">
                                    <div className="space-y-3">
                                        {audits.slice(0, 6).map((event) => (
                                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm transition hover:bg-slate-50">
                                                <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{event.entity_type}</Badge><Badge tone="slate">{event.action}</Badge></div>
                                                <div className="mt-2 font-medium text-slate-900">{event.actor_email || 'system'}</div>
                                                <div className="mt-1 text-slate-500">{formatDate(event.created_at)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>
                            </div>
                        </section>
                    </main>
                </div>
            </div>
        </div>
    )
}
