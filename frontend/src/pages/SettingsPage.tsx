import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, CircleAlert, LoaderCircle, RefreshCw, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, baseUrl, type HealthResponse } from '../lib/api'

type PageState =
  | { status: 'loading' }
  | { status: 'success'; data: HealthResponse }
  | { status: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'The health endpoint could not be loaded.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function SettingsPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    api.health().then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error) })
    })
    return () => { active = false }
  }, [reloadKey])

  return <div className="workspace-page settings-page space-y-8">
    <section className="rounded-3xl border border-line bg-panel p-6 shadow-soft sm:p-8">
      <div className="mb-5 inline-flex rounded-2xl border border-line bg-sage/10 p-4 text-accent"><Settings2 size={28} /></div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Workspace settings</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Know what this workspace can see.</h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">This is a read-only connection and disclosure page. The current backend exposes health and workflow data, but no persisted user-preference settings endpoint is connected.</p>
    </section>

    {state.status === 'loading' && <section className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading workspace settings"><div className="flex items-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={18} /> Checking the connected API…</div></section>}
    {state.status === 'error' && <section className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6" role="alert"><div className="flex items-start gap-3"><CircleAlert className="mt-0.5 shrink-0 text-rose-700" size={19} /><div><p className="text-sm font-bold text-rose-900">API connection unavailable</p><p className="mt-2 text-sm leading-6 text-rose-800/80">{state.message}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/40 px-4 py-2.5 text-sm font-bold text-rose-900 hover:bg-rose-300/15"><RefreshCw size={16} /> Retry connection</button></div></div></section>}
    {state.status === 'success' && <ConnectionCard data={state.data} />}

    <section className="grid gap-5 lg:grid-cols-2">
      <InfoCard title="Local demo disclosure" icon={<CircleAlert className="text-sage" size={20} />}><p>Records shown in Auto Escrow are local application data or deterministic demo results. Escrow values are simulated and this frontend does not connect to a payment provider.</p></InfoCard>
      <InfoCard title="Workflow boundaries" icon={<CheckCircle2 className="text-accent" size={20} />}><p>Matching, agreements, funding, execution, verification, disputes, and settlement are shown only when their existing API contracts return state. Unsupported preference controls are intentionally absent.</p></InfoCard>
    </section>
    <div className="flex flex-wrap gap-3"><Link to="/" className="action-primary">Return to dashboard</Link><Link to="/jobs" className="action-secondary">Open job registry</Link></div>
  </div>
}

function ConnectionCard({ data }: { data: HealthResponse }) {
  return <section className="rounded-2xl border border-accent/25 bg-accent/5 p-6" aria-labelledby="connection-heading"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Connected service</p><h2 id="connection-heading" className="mt-1 text-xl font-bold text-white">API health is responding.</h2></div><StatusPill tone="success">{data.status}</StatusPill></div><dl className="mt-6 grid gap-5 sm:grid-cols-2"><SettingValue label="Service" value={data.service} /><SettingValue label="Environment" value={data.environment} /><SettingValue label="Base URL" value={baseUrl} /><SettingValue label="Health timestamp" value={formatDate(data.timestamp)} /></dl><p className="mt-6 text-sm leading-6 text-slate-400">This connection indicator is backed by <code className="rounded bg-forest/[0.06] px-1.5 py-0.5 text-xs text-ink">GET /api/health</code>. It does not imply an external agent or payment provider is connected.</p></section>
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.13em] text-slate-600">{label}</dt><dd className="mt-2 break-words text-sm font-semibold text-slate-200">{value}</dd></div>
}

function InfoCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <article className="rounded-2xl border border-line bg-panel p-6 shadow-soft"><div className="flex items-center gap-3"><span>{icon}</span><h2 className="text-base font-bold text-white">{title}</h2></div><div className="mt-4 text-sm leading-6 text-slate-400">{children}</div></article>
}
