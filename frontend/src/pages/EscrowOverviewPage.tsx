import { useEffect, useState } from 'react'
import { ArrowRight, CircleDollarSign, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { ApiError, api, type EscrowDto, type JobListResponseDto } from '../lib/api'

type EscrowRecord = {
  job: JobListResponseDto['items'][number]
  escrow: EscrowDto | null
  error?: string
}

type PageState =
  | { status: 'loading' }
  | { status: 'success'; records: EscrowRecord[] }
  | { status: 'error'; message: string }

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Escrow records could not be loaded.'
}

function escrowTone(escrow: EscrowDto | null): 'success' | 'warning' | 'neutral' | 'danger' {
  if (escrow === null) return 'neutral'
  if (escrow.status === 'funded' || escrow.status === 'held') return 'success'
  if (escrow.status === 'pending') return 'warning'
  if (escrow.status === 'disputed' || escrow.status === 'refunded') return 'danger'
  return 'neutral'
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

async function loadRecords(): Promise<EscrowRecord[]> {
  const jobs = await api.listJobs()
  return Promise.all(jobs.items.map(async (job) => {
    try {
      return { job, escrow: await api.jobEscrow(job.id) }
    } catch (error: unknown) {
      return { job, escrow: null, error: errorMessage(error) }
    }
  }))
}

export function EscrowOverviewPage() {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<PageState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    loadRecords().then((records) => {
      if (active) setState({ status: 'success', records })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error) })
    })
    return () => { active = false }
  }, [reloadKey])

  const retry = () => setReloadKey((value) => value + 1)

  return <div className="workspace-page escrow-overview-page space-y-8">
    <section className="rounded-3xl border border-line bg-panel p-6 shadow-soft sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex rounded-2xl border border-line bg-sage/10 p-4 text-accent"><CircleDollarSign size={28} /></div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Escrow ledger</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">See where each job stands.</h2>
          <p className="mt-4 text-base leading-7 text-slate-400">This view reads the persisted job registry and then checks each job’s existing escrow record. A missing record stays visibly missing; no balances or settlement states are invented.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-electric/25 bg-electric/10 px-3 py-1.5 text-xs font-semibold text-electric"><ShieldCheck size={14} /> Simulated only</div>
      </div>
    </section>

    {state.status === 'loading' && <section className="rounded-2xl border border-line bg-panel p-6" aria-label="Loading escrow overview"><div className="flex items-center gap-3 text-sm text-slate-500"><LoaderCircle className="animate-spin text-electric" size={18} /> Loading persisted jobs and escrow records…</div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="h-36 animate-pulse rounded-2xl bg-forest/[0.05]" /><div className="h-36 animate-pulse rounded-2xl bg-forest/[0.05]" /></div></section>}

    {state.status === 'error' && <section className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-6" role="alert"><p className="text-sm font-bold text-rose-900">Unable to load the escrow overview</p><p className="mt-2 text-sm leading-6 text-rose-800/80">{state.message}</p><button type="button" onClick={retry} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-rose-400/40 px-4 py-2.5 text-sm font-bold text-rose-900 hover:bg-rose-300/15"><RefreshCw size={16} /> Retry escrow requests</button></section>}

    {state.status === 'success' && <EscrowRecords records={state.records} />}
  </div>
}

function EscrowRecords({ records }: { records: EscrowRecord[] }) {
  const withEscrow = records.filter((record) => record.escrow !== null)
  const funded = withEscrow.filter((record) => record.escrow?.status === 'funded' || record.escrow?.status === 'held').length
  const settled = withEscrow.filter((record) => record.escrow?.status === 'released' || record.escrow?.status === 'refunded').length

  if (records.length === 0) return <section className="rounded-2xl border border-dashed border-line bg-panel/70 p-8 text-center"><CircleDollarSign className="mx-auto text-sage" size={30} /><h3 className="mt-4 text-lg font-bold text-white">No persisted jobs to inspect</h3><p className="mt-2 text-sm leading-6 text-slate-500">Create a job first. Escrow records are created later from an accepted agreement and appear here only after the backend persists them.</p><Link to="/jobs/new" className="action-primary mt-6"><ArrowRight size={16} /> Create a job</Link></section>

  return <>
    <section className="grid gap-4 sm:grid-cols-3" aria-label="Escrow overview totals">
      <OverviewMetric label="Jobs checked" value={records.length} detail="From the persisted job registry" />
      <OverviewMetric label="Funded or held" value={funded} detail="Existing escrow records only" />
      <OverviewMetric label="Settled" value={settled} detail="Released or refunded records" />
    </section>
    <section aria-labelledby="escrow-records-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Job-linked records</p><h2 id="escrow-records-heading" className="mt-1 text-xl font-bold text-white">Persisted escrow state</h2></div><span className="text-sm text-slate-500">{withEscrow.length} escrow record{withEscrow.length === 1 ? '' : 's'} returned</span></div>
      <div className="grid gap-4 lg:grid-cols-2">{records.map((record) => <EscrowRecordCard key={record.job.id} record={record} />)}</div>
    </section>
  </>
}

function EscrowRecordCard({ record }: { record: EscrowRecord }) {
  const { job, escrow, error } = record
  return <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-5 shadow-soft"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="text-xs font-medium text-slate-500">{job.public_id} · Job #{job.id}</p><h3 className="mt-2 truncate text-lg font-bold text-white">{job.title}</h3></div><StatusPill tone={error ? 'danger' : escrowTone(escrow)}>{error ? 'Unavailable' : escrow === null ? 'No record' : escrow.status}</StatusPill></div><p className="mt-4 text-sm leading-6 text-slate-400">{error ?? (escrow === null ? 'No escrow record has been persisted for this job.' : `Escrow #${escrow.id} · ${escrow.amount} ${escrow.currency}`)}</p>{escrow && <dl className="mt-5 grid gap-3 rounded-xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs uppercase tracking-[0.12em] text-slate-600">Job status</dt><dd className="mt-1 font-semibold text-slate-200">{job.status.replaceAll('_', ' ')}</dd></div><div><dt className="text-xs uppercase tracking-[0.12em] text-slate-600">Funded amount</dt><dd className="mt-1 font-semibold text-slate-200">{escrow.funded_amount === null ? 'Not funded' : `${escrow.funded_amount} ${escrow.currency}`}</dd></div><div><dt className="text-xs uppercase tracking-[0.12em] text-slate-600">Created</dt><dd className="mt-1 font-semibold text-slate-200">{formatDate(escrow.created_at)}</dd></div><div><dt className="text-xs uppercase tracking-[0.12em] text-slate-600">Ledger entries</dt><dd className="mt-1 font-semibold text-slate-200">{escrow.ledger_entries.length}</dd></div></dl>}<div className="mt-auto flex flex-wrap gap-3 border-t border-line pt-4"><Link to={`/jobs/${job.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-electric hover:text-ink">Open job <ArrowRight size={15} /></Link><Link to={`/jobs/${job.id}/escrow`} className="inline-flex items-center gap-2 text-sm font-bold text-accent hover:text-ink">Inspect escrow <ArrowRight size={15} /></Link></div></article>
}

function OverviewMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="rounded-2xl border border-line bg-panel p-5 shadow-soft"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 text-3xl font-bold text-white">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}
