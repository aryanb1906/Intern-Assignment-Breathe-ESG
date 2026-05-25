import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
    Activity,
    ArrowRight,
    BarChart3,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Clock3,
    FileJson2,
    Home,
    Layers3,
    Menu,
    MoonStar,
    Search,
    Sparkles,
    SunMedium,
    Upload,
    X,
} from 'lucide-react'
import { loadDashboard, reviewRecord, seedDemo, uploadBatch } from './api'
import type { AuditEvent, DashboardPayload, DataSource, ImportBatch, NormalizedRecord, Organization, WorkspaceSession } from './types'

type TabKey = 'dashboard' | 'upload' | 'review' | 'approved' | 'audit'
type ReviewFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'edited'
type SourceFilter = 'all' | 'sap' | 'utility' | 'travel'
type RecordPaneTab = 'normalized' | 'raw' | 'history'

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

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
    { key: 'dashboard', label: 'Dashboard', icon: <Home size={16} /> },
    { key: 'upload', label: 'Upload Data', icon: <Upload size={16} /> },
    { key: 'review', label: 'Review Queue', icon: <ClipboardList size={16} /> },
    { key: 'approved', label: 'Approved Records', icon: <CheckCircle2 size={16} /> },
    { key: 'audit', label: 'Audit Trail', icon: <Activity size={16} /> },
]

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

function highlightJson(value: unknown) {
    const escaped = formatJson(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    return escaped
        .replace(/(".*?")(?=\s*:)/g, '<span class="text-sky-300">$1</span>')
        .replace(/:\s(".*?")/g, ': <span class="text-emerald-300">$1</span>')
        .replace(/:\s(-?\d+(?:\.\d+)?)/g, ': <span class="text-amber-300">$1</span>')
        .replace(/:\s(true|false|null)/g, ': <span class="text-violet-300">$1</span>')
}

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'red' | 'blue' }) {
    const tones = {
        slate: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200',
        amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
        green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
        red: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
        blue: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
    }
    return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-slate-950/70">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">{title}</h3>
                    {subtitle ? <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
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
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
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
        <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-100">
            <div className="font-medium">{message}</div>
            {looksLikeHtml ? (
                <button className="mt-2 text-xs font-medium underline" onClick={() => setShowRaw((s) => !s)}>
                    {showRaw ? 'Hide details' : 'Show details'}
                </button>
            ) : null}
            {showRaw ? <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-white/80 p-3 text-xs text-slate-700 dark:bg-slate-950/80 dark:text-slate-200">{error}</pre> : null}
        </div>
    )
}

function StatCard({ label, value, note, icon, tone = 'slate' }: { label: string; value: number | undefined; note?: string; icon: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' }) {
    const tones = {
        slate: 'bg-slate-50 dark:bg-white/5',
        emerald: 'bg-emerald-50 dark:bg-emerald-500/10',
        amber: 'bg-amber-50 dark:bg-amber-500/10',
        rose: 'bg-rose-50 dark:bg-rose-500/10',
    }

    return (
        <div className={`rounded-[18px] border border-slate-200 p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(15,23,42,0.08)] dark:border-white/10 ${tones[tone]}`}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">{label}</div>
                    <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">{value === undefined ? '—' : formatNumber(value)}</div>
                    {note ? <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{note}</div> : null}
                </div>
                <div className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm dark:bg-slate-950/80 dark:text-slate-200">{icon}</div>
            </div>
        </div>
    )
}

function MiniBarChart({ values }: { values: number[] }) {
    const max = Math.max(...values, 1)
    return (
        <div className="flex h-28 items-end gap-2">
            {values.map((value, index) => (
                <div key={index} className="flex-1 rounded-t-xl bg-slate-100 dark:bg-white/10">
                    <div className="rounded-t-xl bg-slate-900 dark:bg-sky-300" style={{ height: `${Math.max(12, (value / max) * 100)}%` }} />
                </div>
            ))}
        </div>
    )
}

function SkeletonCard() {
    return <div className="animate-pulse rounded-[20px] border border-slate-200 bg-white p-5 shadow-soft dark:border-white/10 dark:bg-slate-950/70"><div className="h-4 w-32 rounded bg-slate-200 dark:bg-white/10" /><div className="mt-4 h-24 rounded-2xl bg-slate-100 dark:bg-white/5" /></div>
}

function TabPill({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'}`}
        >
            {children}
        </button>
    )
}

function CodeViewer({ record, audits, tab, onTabChange }: { record: NormalizedRecord; audits: AuditEvent[]; tab: RecordPaneTab; onTabChange: (value: RecordPaneTab) => void }) {
    const history = audits.filter((event) => event.entity_type === 'normalized_record' && event.entity_id === record.id)

    return (
        <div className="rounded-[20px] border border-slate-200 bg-slate-950 text-slate-100 shadow-soft dark:border-white/10">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="text-sm font-medium text-slate-200">Record inspector</div>
                <div className="flex gap-2">
                    <TabPill active={tab === 'normalized'} onClick={() => onTabChange('normalized')}>Normalized JSON</TabPill>
                    <TabPill active={tab === 'raw'} onClick={() => onTabChange('raw')}>Raw payload</TabPill>
                    <TabPill active={tab === 'history'} onClick={() => onTabChange('history')}>History</TabPill>
                </div>
            </div>
            <div className="max-h-[24rem] overflow-auto p-4">
                {tab === 'history' ? (
                    <div className="space-y-3">
                        {history.length === 0 ? <div className="text-sm text-slate-400">No record history yet.</div> : history.map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <Badge tone="blue">{entry.action}</Badge>
                                    <span className="text-slate-400">{formatDate(entry.created_at)}</span>
                                </div>
                                <div className="mt-2 text-slate-100">{entry.actor_email || 'system'}</div>
                                <div className="mt-1 text-slate-400">{entry.after_state ? JSON.stringify(entry.after_state) : '{}'}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <pre
                        className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-slate-100"
                        dangerouslySetInnerHTML={{ __html: highlightJson(tab === 'raw' ? record.raw_payload : record.normalized_payload) }}
                    />
                )}
            </div>
        </div>
    )
}

export default function App() {
    const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
    const [mobileNavOpen, setMobileNavOpen] = useState(false)
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') return 'light'
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
    const [recordPaneTab, setRecordPaneTab] = useState<RecordPaneTab>('normalized')
    const [file, setFile] = useState<File | null>(null)
    const [form, setForm] = useState(defaultForm)

    const canUpload = sessionInfo?.permissions.can_upload ?? false
    const canReview = sessionInfo?.permissions.can_review ?? false
    const canSeed = sessionInfo?.permissions.can_seed ?? false

    useEffect(() => {
        document.documentElement.dataset.theme = theme
        window.localStorage.setItem('breathe-esg-theme', theme)
    }, [theme])

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

            if (!selectedRecord && data.records.length > 0) {
                setSelectedRecord(data.records[0])
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

    const visibleRecords = useMemo(() => {
        return records.filter((record) => {
            const matchesReview = reviewFilter === 'all' || record.review_status === reviewFilter
            const sourceId = sourceFilter === 'all' ? null : sources.find((source) => source.source_type === sourceFilter)?.id ?? null
            const matchesSource = sourceFilter === 'all' || record.data_source === sourceId
            const matchesBatch = !selectedBatchId || record.import_batch === selectedBatchId
            const matchesSearch =
                search.trim().length === 0 ||
                [record.activity_type, record.source_system, record.source_record_key, record.review_status].join(' ').toLowerCase().includes(search.trim().toLowerCase())
            return matchesReview && matchesSource && matchesBatch && matchesSearch
        })
    }, [records, reviewFilter, sourceFilter, selectedBatchId, search, sources])

    function selectTab(tab: TabKey) {
        setActiveTab(tab)
        setMobileNavOpen(false)
    }

    function selectRecord(record: NormalizedRecord) {
        setSelectedRecord(record)
        setRecordPaneTab('normalized')
        setActiveTab('review')
        setMobileNavOpen(false)
    }

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
        setActiveTab('review')
    }

    async function handleReview(decision: 'approved' | 'rejected') {
        if (!selectedRecord) return
        const normalizedPayload = selectedRecord.normalized_payload as Record<string, unknown>
        await reviewRecord(selectedRecord.id, {
            decision,
            comment: decision === 'approved' ? 'Analyst approved after review.' : 'Analyst rejected during review.',
            normalized_payload: normalizedPayload,
        }, { organization: form.organizationSlug, email: form.email })
        await reload()
    }

    const summaryTiles = [
        { label: 'Total Records', value: dashboard.summary.total_records, note: '+2.1% vs last week', icon: <BarChart3 size={18} />, tone: 'slate' as const },
        { label: 'Pending Review', value: dashboard.summary.pending_review, note: 'Queue depth', icon: <Clock3 size={18} />, tone: 'amber' as const },
        { label: 'Suspicious Rows', value: dashboard.summary.suspicious_rows, note: 'Flagged for analyst review', icon: <Sparkles size={18} />, tone: 'rose' as const },
        { label: 'Approved Rows', value: dashboard.summary.approved_rows, note: 'Locked for audit', icon: <CheckCircle2 size={18} />, tone: 'emerald' as const },
    ]

    const activeLabel = tabs.find((tab) => tab.key === activeTab)?.label ?? 'Dashboard'

    function DesktopSidebar() {
        return (
            <aside className="hidden lg:block">
                <div className="sticky-top top-4 rounded-[20px] border border-slate-200 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                    <div className="space-y-4">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Breathe ESG</div>
                            <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">Analyst workspace</div>
                            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Enterprise intake, review, and audit in one streamlined surface.</p>
                        </div>

                        <div className="rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Organization</div>
                            <div className="mt-1 truncate text-sm font-medium text-slate-950 dark:text-slate-50">{organizations.find((org) => org.slug === form.organizationSlug)?.name || form.organizationSlug}</div>
                        </div>

                        <nav className="space-y-1">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={() => selectTab(tab.key)}
                                    className={`group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${activeTab === tab.key ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'}`}
                                >
                                    <span className="flex items-center gap-3">
                                        <span className={`rounded-lg p-1.5 ${activeTab === tab.key ? 'bg-white/10' : 'bg-slate-100 dark:bg-white/5'}`}>{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </span>
                                    {tab.key === 'review' ? <span className={`rounded-full px-2 py-0.5 text-[11px] ${activeTab === tab.key ? 'bg-white/15 text-white' : 'bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300'}`}>{pendingRecords.length}</span> : null}
                                </button>
                            ))}
                        </nav>

                        <button onClick={handleSeed} disabled={!canSeed} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10">
                            <Sparkles size={16} />
                            Reload demo data
                        </button>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm dark:border-white/10 dark:bg-white/5">
                            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Active session</div>
                            <div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{form.email}</div>
                            <div className="mt-1 text-slate-500 dark:text-slate-400">{sessionInfo?.membership.role || 'viewer'}</div>
                            <select className="input mt-3 text-sm" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })}>
                                {sessionInfo?.memberships.map((member) => <option key={member.id} value={member.email}>{member.email} - {member.role}</option>)}
                                {!sessionInfo?.memberships.some((member) => member.email === form.email) ? <option value={form.email}>{form.email}</option> : null}
                            </select>
                        </div>
                    </div>
                </div>
            </aside>
        )
    }

    function MobileDrawer() {
        return (
            <div className={`fixed inset-0 z-50 lg:hidden ${mobileNavOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                <button
                    type="button"
                    aria-label="Close navigation"
                    onClick={() => setMobileNavOpen(false)}
                    className={`absolute inset-0 bg-slate-950/40 transition ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`}
                />
                <aside className={`absolute left-0 top-0 h-full w-[88vw] max-w-sm overflow-auto border-r border-slate-200 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.2)] transition-transform duration-200 dark:border-white/10 dark:bg-slate-950 ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Breathe ESG</div>
                            <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">Analyst workspace</div>
                        </div>
                        <button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500 dark:border-white/10 dark:text-slate-300">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                        <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Organization</div>
                        <div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{organizations.find((org) => org.slug === form.organizationSlug)?.name || form.organizationSlug}</div>
                    </div>
                    <nav className="mt-4 space-y-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => selectTab(tab.key)}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-medium transition ${activeTab === tab.key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5'}`}
                            >
                                <span className="flex items-center gap-3">
                                    {tab.icon}
                                    {tab.label}
                                </span>
                                {tab.key === 'review' ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-white/10 dark:text-slate-300">{pendingRecords.length}</span> : null}
                            </button>
                        ))}
                    </nav>
                </aside>
            </div>
        )
    }

    function RightRail() {
        if (activeTab === 'review' && selectedRecord) {
            return (
                <div className="space-y-6">
                    <Panel title="Selected record" subtitle={selectedRecord.source_system}>
                        <div className="space-y-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">{selectedRecord.source_record_key || 'No source key'}</div>
                                        <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatNumber(selectedRecord.emissions_kg_co2e)} kgCO2e - Scope {selectedRecord.scope_category}</div>
                                    </div>
                                    <Badge tone={selectedRecord.review_status === 'approved' ? 'green' : selectedRecord.review_status === 'rejected' ? 'red' : selectedRecord.review_status === 'edited' ? 'blue' : 'amber'}>{selectedRecord.review_status}</Badge>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Quantity</div><div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{formatNumber(selectedRecord.normalized_quantity)} {selectedRecord.normalized_unit}</div></div>
                                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Flags</div><div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{selectedRecord.suspicious_flags.length}</div></div>
                                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Edited</div><div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{selectedRecord.edited_at ? 'Yes' : 'No'}</div></div>
                                    <div className="rounded-xl bg-white px-3 py-2 dark:bg-slate-950"><div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Review</div><div className="mt-1 font-medium text-slate-950 dark:text-slate-50">{selectedRecord.review_status}</div></div>
                                </div>
                            </div>

                            <CodeViewer record={selectedRecord} audits={audits} tab={recordPaneTab} onTabChange={setRecordPaneTab} />

                            <div className="flex flex-wrap gap-2">
                                {selectedRecord.suspicious_flags.length > 0 ? selectedRecord.suspicious_flags.map((flag) => <Badge key={flag} tone="red">{flag}</Badge>) : <Badge tone="green">clean</Badge>}
                            </div>

                            <div className="sticky bottom-4 flex gap-3 bg-white/95 pt-2 backdrop-blur dark:bg-slate-950/95">
                                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => handleReview('approved')} disabled={!canReview}>Approve</button>
                                <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10" onClick={() => handleReview('rejected')} disabled={!canReview}>Reject</button>
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Activity feed" subtitle="Recent review and import events">
                        <div className="space-y-3">
                            {audits.slice(0, 6).map((event) => (
                                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                    <div className="flex items-center gap-2">
                                        <Badge tone="blue">{event.entity_type}</Badge>
                                        <Badge tone="slate">{event.action}</Badge>
                                    </div>
                                    <div className="mt-3 font-medium text-slate-950 dark:text-slate-50">{event.actor_email || 'system'}</div>
                                    <div className="mt-1 text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}</div>
                                </div>
                            ))}
                        </div>
                    </Panel>
                </div>
            )
        }

        if (activeTab === 'audit') {
            return (
                <Panel title="Activity feed" subtitle="Ingestion and review actions">
                    <div className="space-y-3">
                        {audits.map((event) => (
                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                <div className="flex items-center gap-2">
                                    <Badge tone="blue">{event.entity_type}</Badge>
                                    <Badge tone="slate">{event.action}</Badge>
                                </div>
                                <div className="mt-3 font-medium text-slate-950 dark:text-slate-50">{event.actor_email || 'system'}</div>
                                <div className="mt-1 text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}</div>
                            </div>
                        ))}
                    </div>
                </Panel>
            )
        }

        if (activeTab === 'approved') {
            return (
                <Panel title="Approval snapshot" subtitle="Locked rows and their latest state">
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Approved rows</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{approvedRecords.length}</div></div>
                            <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending rows</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{pendingRecords.length}</div></div>
                        </div>
                        <div className="space-y-2">
                            {approvedRecords.slice(0, 5).map((record) => (
                                <button key={record.id} type="button" onClick={() => selectRecord(record)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-slate-950 dark:text-slate-50">{record.activity_type}</div>
                                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{record.source_system} - {record.source_record_key || 'no source key'}</div>
                                        </div>
                                        <Badge tone="green">{formatNumber(record.emissions_kg_co2e)} kgCO2e</Badge>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </Panel>
            )
        }

        if (activeTab === 'upload') {
            return (
                <Panel title="Upload source data" subtitle="CSV upload mirrors the realistic export shape for SAP, utility portals, and travel systems.">
                    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpload}>
                        <Field label="Organization slug"><input className="input" value={form.organizationSlug} onChange={(event) => setForm({ ...form, organizationSlug: event.target.value })} /></Field>
                        <Field label="Analyst email"><input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
                        <Field label="Data source">
                            <select className="input" value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: event.target.value })}>
                                <option value="">Choose one...</option>
                                {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                            </select>
                        </Field>
                        <Field label="Batch label"><input className="input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="April utility export" /></Field>
                        <div className="md:col-span-2">
                            <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">CSV file</label>
                            <input className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-slate-950/70" type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                        </div>
                        <div className="md:col-span-2 flex flex-wrap gap-3">
                            <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!canUpload}>Upload and normalize</button>
                            <button className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5" type="button" onClick={handleSeed} disabled={!canSeed}>Load demo seed</button>
                        </div>
                    </form>
                </Panel>
            )
        }

        return (
            <div className="space-y-6">
                <Panel title="Review queue" subtitle="Filter, inspect raw versus normalized values, then approve or reject." action={<div className="flex flex-wrap gap-2"><select className="input w-44 rounded-xl bg-slate-50 text-sm" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}><option value="">All batches</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}</select><select className="input w-36 rounded-xl bg-slate-50 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="sap">SAP</option><option value="utility">Utility</option><option value="travel">Travel</option></select><select className="input w-36 rounded-xl bg-slate-50 text-sm" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}><option value="all">All status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="edited">Edited</option></select></div>}>
                    <div className="max-h-[680px] overflow-auto rounded-[18px] border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/70">
                        <table className="min-w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-400 backdrop-blur dark:bg-slate-950/95">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Activity</th>
                                    <th className="px-4 py-3 font-semibold">Source</th>
                                    <th className="px-4 py-3 font-semibold">Scope</th>
                                    <th className="px-4 py-3 font-semibold">Quantity</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                                {visibleRecords.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={5}>
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="font-medium text-slate-700 dark:text-slate-200">No rows match the current filters.</span>
                                                <span>Try clearing the source, batch, or status filters.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : visibleRecords.map((record, index) => {
                                    const source = sources.find((entry) => entry.id === record.data_source)
                                    const tone = record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : record.review_status === 'edited' ? 'blue' : 'amber'
                                    return (
                                        <tr key={record.id} onClick={() => selectRecord(record)} className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-white/5 ${selectedRecord?.id === record.id ? 'bg-emerald-50/50 dark:bg-emerald-500/10' : index % 2 === 0 ? 'bg-white dark:bg-slate-950/70' : 'bg-slate-50/40 dark:bg-white/5'}`}>
                                            <td className="px-4 py-3 font-medium text-slate-950 dark:text-slate-50">{record.activity_type}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{source?.name || record.source_system}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Scope {record.scope_category}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatNumber(record.normalized_quantity)} {record.normalized_unit}</td>
                                            <td className="px-4 py-3"><Badge tone={tone}>{record.review_status}</Badge></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                <div className="grid gap-6 xl:hidden">
                    {selectedRecord ? (
                        <Panel title="Selected record" subtitle={selectedRecord.source_system}>
                            <CodeViewer record={selectedRecord} audits={audits} tab={recordPaneTab} onTabChange={setRecordPaneTab} />
                            <div className="mt-4 flex gap-3">
                                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => handleReview('approved')} disabled={!canReview}>Approve</button>
                                <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700" onClick={() => handleReview('rejected')} disabled={!canReview}>Reject</button>
                            </div>
                        </Panel>
                    ) : null}
                </div>
            </div>
        )
    }

    function DashboardPage() {
        const sourceTotals = dashboard.source_breakdown.map((source) => source.total_records)

        return (
            <div className="space-y-6">
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {summaryTiles.map((tile) => (
                        <StatCard key={tile.label} label={tile.label} value={tile.value} note={tile.note} icon={tile.icon} tone={tile.tone} />
                    ))}
                </section>

                <section className="grid gap-6 xl:grid-cols-12">
                    <div className="space-y-6 xl:col-span-8">
                        <Panel title="Source analytics" subtitle="Distribution by source with queue health at a glance" action={<button onClick={reload} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"><ArrowRight size={14} />Refresh</button>}>
                            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">Source mix</div>
                                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Total rows across SAP, utility, and travel imports</div>
                                        </div>
                                        <Badge tone="blue">{dashboard.summary.total_records} total</Badge>
                                    </div>
                                    <div className="mt-4">
                                        <MiniBarChart values={sourceTotals.length > 0 ? sourceTotals : [1, 1, 1]} />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                    {dashboard.source_breakdown.map((source) => (
                                        <div key={source.source_type} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/70">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">{source.source_name}</div>
                                                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-400">{source.source_type}</div>
                                                </div>
                                                <Badge tone={source.source_type === 'sap' ? 'blue' : source.source_type === 'utility' ? 'amber' : 'green'}>{source.total_records}</Badge>
                                            </div>
                                            <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                                                <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"><div className="uppercase tracking-wide">Pending</div><div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{source.pending_review}</div></div>
                                                <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"><div className="uppercase tracking-wide">Approved</div><div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{source.approved_rows}</div></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Panel>

                        <Panel title="Recent batches" subtitle="Most recent processing runs and their quality profile">
                            <div className="grid gap-3 md:grid-cols-2">
                                {dashboard.recent_batches.map((batch) => {
                                    const source = sources.find((entry) => entry.id === batch.data_source)
                                    return (
                                        <button key={batch.id} type="button" onClick={() => { setSelectedBatchId(batch.id); selectTab('review') }} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">{batch.label}</div>
                                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{source?.name || 'Source'} - {batch.source_filename || 'uploaded file'}</div>
                                                </div>
                                                <Badge tone={batch.status === 'failed' ? 'red' : batch.status === 'processed' ? 'green' : 'amber'}>{batch.status}</Badge>
                                            </div>
                                            <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-600 dark:text-slate-400">
                                                <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"><div className="uppercase tracking-wide">Rows</div><div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{batch.total_rows}</div></div>
                                                <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"><div className="uppercase tracking-wide">Success</div><div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{batch.successful_rows}</div></div>
                                                <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"><div className="uppercase tracking-wide">Failed</div><div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{batch.failed_rows}</div></div>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>
                        </Panel>

                        <Panel title="Quick actions" subtitle="Common analyst operations">
                            <div className="flex flex-wrap gap-3">
                                <button className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200" onClick={() => selectTab('review')}><ClipboardList size={16} />Open review queue</button>
                                <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-white/5" onClick={() => selectTab('upload')}><Upload size={16} />Upload data</button>
                                <button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-white/5" onClick={handleSeed}><Sparkles size={16} />Reload demo data</button>
                            </div>
                        </Panel>
                    </div>

                    <div className="space-y-6 xl:hidden">
                        <Panel title="Operational snapshot" subtitle="Queue and quality summary">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{pendingRecords.length}</div></div>
                                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Suspicious</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{suspiciousRecords.length}</div></div>
                            </div>
                        </Panel>
                    </div>
                </section>
            </div>
        )
    }

    function UploadPageRightRail() {
        return (
            <Panel title="Upload checklist" subtitle="Keep uploads clean and traceable">
                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">CSV files only. Keep source naming consistent.</div>
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">Uploads are normalized in-browser for the demo.</div>
                    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5">Admin access is required for upload and reset.</div>
                </div>
            </Panel>
        )
    }

    function UploadPage() {
        return (
            <Panel title="Upload source data" subtitle="CSV upload mirrors the realistic export shape for SAP, utility portals, and travel systems.">
                <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpload}>
                    <Field label="Organization slug"><input className="input" value={form.organizationSlug} onChange={(event) => setForm({ ...form, organizationSlug: event.target.value })} /></Field>
                    <Field label="Analyst email"><input className="input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
                    <Field label="Data source">
                        <select className="input" value={form.sourceId} onChange={(event) => setForm({ ...form, sourceId: event.target.value })}>
                            <option value="">Choose one...</option>
                            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Batch label"><input className="input" value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="April utility export" /></Field>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">CSV file</label>
                        <input className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-slate-950/70" type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap gap-3">
                        <button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!canUpload}>Upload and normalize</button>
                        <button className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5" type="button" onClick={handleSeed} disabled={!canSeed}>Load demo seed</button>
                    </div>
                </form>
            </Panel>
        )
    }

    function ReviewPage() {
        return (
            <div className="space-y-6">
                <Panel title="Review queue" subtitle="Filter, inspect raw versus normalized values, then approve or reject." action={<div className="flex flex-wrap gap-2"><select className="input w-44 rounded-xl bg-slate-50 text-sm" value={selectedBatchId} onChange={(event) => setSelectedBatchId(event.target.value)}><option value="">All batches</option>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.label}</option>)}</select><select className="input w-36 rounded-xl bg-slate-50 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="sap">SAP</option><option value="utility">Utility</option><option value="travel">Travel</option></select><select className="input w-36 rounded-xl bg-slate-50 text-sm" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)}><option value="all">All status</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="edited">Edited</option></select></div>}>
                    <div className="max-h-[680px] overflow-auto rounded-[18px] border border-slate-200 bg-white dark:border-white/10 dark:bg-slate-950/70">
                        <table className="min-w-full text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white/95 text-xs uppercase tracking-[0.16em] text-slate-400 backdrop-blur dark:bg-slate-950/95">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">Activity</th>
                                    <th className="px-4 py-3 font-semibold">Source</th>
                                    <th className="px-4 py-3 font-semibold">Scope</th>
                                    <th className="px-4 py-3 font-semibold">Quantity</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                                {visibleRecords.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-10 text-sm text-slate-500 dark:text-slate-400" colSpan={5}>
                                            <div className="flex flex-col items-start gap-1">
                                                <span className="font-medium text-slate-700 dark:text-slate-200">No rows match the current filters.</span>
                                                <span>Try clearing the source, batch, or status filters.</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : visibleRecords.map((record, index) => {
                                    const source = sources.find((entry) => entry.id === record.data_source)
                                    const tone = record.review_status === 'approved' ? 'green' : record.review_status === 'rejected' ? 'red' : record.review_status === 'edited' ? 'blue' : 'amber'
                                    return (
                                        <tr key={record.id} onClick={() => selectRecord(record)} className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-white/5 ${selectedRecord?.id === record.id ? 'bg-emerald-50/50 dark:bg-emerald-500/10' : index % 2 === 0 ? 'bg-white dark:bg-slate-950/70' : 'bg-slate-50/40 dark:bg-white/5'}`}>
                                            <td className="px-4 py-3 font-medium text-slate-950 dark:text-slate-50">{record.activity_type}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{source?.name || record.source_system}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">Scope {record.scope_category}</td>
                                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatNumber(record.normalized_quantity)} {record.normalized_unit}</td>
                                            <td className="px-4 py-3"><Badge tone={tone}>{record.review_status}</Badge></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                <div className="grid gap-6 xl:hidden">
                    {selectedRecord ? (
                        <Panel title="Selected record" subtitle={selectedRecord.source_system}>
                            <CodeViewer record={selectedRecord} audits={audits} tab={recordPaneTab} onTabChange={setRecordPaneTab} />
                            <div className="mt-4 flex gap-3">
                                <button type="button" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white" onClick={() => handleReview('approved')} disabled={!canReview}>Approve</button>
                                <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700" onClick={() => handleReview('rejected')} disabled={!canReview}>Reject</button>
                            </div>
                        </Panel>
                    ) : null}
                </div>
            </div>
        )
    }

    function renderPage() {
        if (activeTab === 'dashboard') return <DashboardPage />
        if (activeTab === 'upload') return <UploadPage />
        if (activeTab === 'review') return <ReviewPage />
        if (activeTab === 'approved') return (
            <Panel title="Approved records" subtitle="Rows locked for audit">
                <div className="overflow-hidden rounded-[18px] border border-slate-200 dark:border-white/10">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-400 dark:bg-white/5">
                            <tr>
                                <th className="px-4 py-3 font-semibold">Activity</th>
                                <th className="px-4 py-3 font-semibold">Emissions</th>
                                <th className="px-4 py-3 font-semibold">Approved</th>
                                <th className="px-4 py-3 font-semibold">Source</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                            {approvedRecords.map((record) => {
                                const source = sources.find((entry) => entry.id === record.data_source)
                                return (
                                    <tr key={record.id} className="border-t border-slate-100 dark:border-white/10">
                                        <td className="px-4 py-3 font-medium text-slate-950 dark:text-slate-50">{record.activity_type}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatNumber(record.emissions_kg_co2e)} kgCO2e</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(record.approved_at)}</td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{source?.name || record.source_system}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </Panel>
        )
        return (
            <div className="space-y-6">
                <Panel title="Audit trail" subtitle="Ingestion and review actions are preserved in an append-only feed">
                    <div className="space-y-3">
                        {audits.map((event) => (
                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                <div className="flex flex-wrap items-center gap-2"><Badge tone="blue">{event.entity_type}</Badge><Badge tone="slate">{event.action}</Badge><span className="text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}</span></div>
                                <div className="mt-2 font-medium text-slate-950 dark:text-slate-50">Actor: {event.actor_email || 'system'}</div>
                                <div className="mt-1 text-slate-600 dark:text-slate-400">Entity ID: {event.entity_id}</div>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100">
            <MobileDrawer />
            <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-6">
                <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_380px]">
                    <DesktopSidebar />

                    <main className="min-w-0 space-y-6">
                        <div className="rounded-[20px] border border-slate-200 bg-white/95 p-4 shadow-soft backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex items-start gap-3">
                                    <button type="button" className="inline-flex rounded-xl border border-slate-200 p-2 text-slate-600 lg:hidden dark:border-white/10 dark:text-slate-300" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
                                        <Menu size={18} />
                                    </button>
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">
                                            <span>Prototype</span>
                                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200">Vercel-only demo</span>
                                            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">Tenant breathe-demo</span>
                                        </div>
                                        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">Enterprise carbon intake review</h1>
                                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400 sm:text-base">SAP, utility, and travel activity flow into a clean review queue for analyst sign-off and audit locking.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                        onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
                                    >
                                        {theme === 'light' ? <MoonStar size={16} /> : <SunMedium size={16} />}
                                        {theme === 'light' ? 'Dark mode' : 'Light mode'}
                                    </button>
                                    <label className="relative">
                                        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rows, batches, sources..." className="input w-full max-w-xs rounded-xl bg-slate-50 pl-9 dark:bg-white/5" />
                                    </label>
                                    <button className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">Invite</button>
                                </div>
                            </div>
                        </div>

                        {error ? <ErrorBox error={error} /> : null}
                        {loading ? <SkeletonCard /> : null}
                        {refreshing ? <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-soft dark:border-white/10 dark:bg-slate-950/70">Refreshing data...</div> : null}

                        <div className="flex flex-wrap gap-2 rounded-[18px] border border-slate-200 bg-white p-2 shadow-soft dark:border-white/10 dark:bg-slate-950/70 lg:hidden">
                            {tabs.map((tab) => (
                                <TabPill key={tab.key} active={activeTab === tab.key} onClick={() => selectTab(tab.key)}>
                                    <span className="inline-flex items-center gap-2">{tab.icon}{tab.label}</span>
                                </TabPill>
                            ))}
                        </div>

                        <div className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-soft dark:border-white/10 dark:bg-slate-950/70 lg:hidden">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Current view</div>
                                    <div className="mt-1 text-sm font-medium text-slate-950 dark:text-slate-50">{activeLabel}</div>
                                </div>
                                <Badge tone="slate">{activeTab}</Badge>
                            </div>
                        </div>

                        {renderPage()}
                    </main>

                    <aside className="hidden xl:block">
                        {activeTab === 'dashboard' && (
                            <div className="space-y-6">
                                <Panel title="Operational snapshot" subtitle="Queue depth, risk, and freshness">
                                    <div className="grid gap-3">
                                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Pending review</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{pendingRecords.length}</div></div>
                                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Suspicious rows</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{suspiciousRecords.length}</div></div>
                                        <div className="rounded-2xl bg-slate-50 p-4 dark:bg-white/5"><div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Failed imports</div><div className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-50">{dashboard.summary.failed_imports}</div></div>
                                    </div>
                                </Panel>

                                <Panel title="Recent activity" subtitle="Latest audit events">
                                    <div className="space-y-3">
                                        {audits.slice(0, 5).map((event) => (
                                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-slate-950/70">
                                                <div className="flex items-center gap-2"><Badge tone="blue">{event.entity_type}</Badge><Badge tone="slate">{event.action}</Badge></div>
                                                <div className="mt-2 font-medium text-slate-950 dark:text-slate-50">{event.actor_email || 'system'}</div>
                                                <div className="mt-1 text-slate-500 dark:text-slate-400">{formatDate(event.created_at)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>
                            </div>
                        )}

                        {activeTab === 'upload' && <UploadPageRightRail />}

                        {activeTab === 'review' && selectedRecord ? <RightRail /> : null}

                        {activeTab === 'approved' && (
                            <Panel title="Approval summary" subtitle="Most recent approved rows">
                                <div className="space-y-2">
                                    {approvedRecords.slice(0, 5).map((record) => (
                                        <button key={record.id} type="button" onClick={() => selectRecord(record)} className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft dark:border-white/10 dark:bg-slate-950/70">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="font-medium text-slate-950 dark:text-slate-50">{record.activity_type}</div>
                                                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{record.source_system}</div>
                                                </div>
                                                <ChevronRight size={16} className="text-slate-400" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </Panel>
                        )}

                        {activeTab === 'audit' && <RightRail />}
                    </aside>
                </div>
            </div>
        </div>
    )
}