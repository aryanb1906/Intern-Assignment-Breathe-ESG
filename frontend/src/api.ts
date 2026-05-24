import type { WorkspaceSession } from './types'

const rawApiBase = import.meta.env.VITE_API_BASE_URL || '/api'
const API_BASE = rawApiBase.replace(/\/$/, '')

type SessionContext = {
    organization: string
    email: string
}

function buildHeaders(session?: SessionContext, headers: HeadersInit = {}) {
    return {
        ...(session ? { 'X-Breathe-Organization': session.organization, 'X-Breathe-Email': session.email } : {}),
        ...headers,
    }
}

async function request(path: string, options: RequestInit = {}, session?: SessionContext) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: buildHeaders(session, options.headers ?? {}),
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed: ${response.status}`)
    }
    return response.json()
}

async function unwrap<T>(payload: T | { results: T }): Promise<T> {
    if (payload && typeof payload === 'object' && 'results' in payload) {
        return (payload as { results: T }).results
    }
    return payload as T
}

export async function loadDashboard(session: SessionContext) {
    const [dashboard, organizations, sources, batches, records, audits] = await Promise.all([
        request(`/dashboard/?organization=${encodeURIComponent(session.organization)}`, {}, session),
        request('/organizations/', {}, session),
        request(`/data-sources/?organization=${encodeURIComponent(session.organization)}`, {}, session),
        request(`/import-batches/?organization=${encodeURIComponent(session.organization)}`, {}, session),
        request(`/records/?organization=${encodeURIComponent(session.organization)}`, {}, session),
        request(`/audit-events/?organization=${encodeURIComponent(session.organization)}`, {}, session),
    ])
    const workspaceSession = (await request(`/session/?organization=${encodeURIComponent(session.organization)}&email=${encodeURIComponent(session.email)}`, {}, session)) as WorkspaceSession

    return {
        dashboard: await unwrap(dashboard),
        organizations: await unwrap(organizations),
        sources: await unwrap(sources),
        batches: await unwrap(batches),
        records: await unwrap(records),
        audits: await unwrap(audits),
        session: workspaceSession,
    }
}

export async function seedDemo(session: SessionContext) {
    return request(
        '/demo/seed/',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organization_slug: session.organization, email: session.email }),
        },
        session,
    )
}

export async function uploadBatch(formData: FormData, session: SessionContext) {
    return request('/import-batches/upload/', {
        method: 'POST',
        body: formData,
    }, session)
}

export async function reviewRecord(recordId: string, payload: Record<string, unknown>, session: SessionContext) {
    return request(`/records/${recordId}/review/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    }, session)
}
