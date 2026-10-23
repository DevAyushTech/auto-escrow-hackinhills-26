import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, Bot, ExternalLink, LoaderCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { StatusPill } from '../components/StatusPill'
import { AgentAvailability, AgentDetailDto, AgentStatus, ApiError, api } from '../lib/api'

type AgentDetailState =
  | { status: 'loading' }
  | { status: 'success'; data: AgentDetailDto }
  | { status: 'error'; message: string; notFound: boolean }

const statusLabels: Record<AgentStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
}

const availabilityLabels: Record<AgentAvailability, string> = {
  available: 'Available',
  busy: 'Busy',
  unavailable: 'Unavailable',
}

function parseAgentId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function formatValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 'null'
  try {
    return JSON.stringify(value)
  } catch {
    return 'Unavailable'
  }
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function AgentDetailPage() {
  const { agentId: agentIdParam } = useParams()
  const agentId = parseAgentId(agentIdParam)
  const [state, setState] = useState<AgentDetailState>(() => agentId === null ? { status: 'error', message: 'The agent ID is invalid.', notFound: false } : { status: 'loading' })

  useEffect(() => {
    let active = true
    if (agentId === null) {
      setState({ status: 'error', message: 'The agent ID is invalid.', notFound: false })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    api.agent(agentId).then((data) => {
      if (active) setState({ status: 'success', data })
    }).catch((error: unknown) => {
      if (!active) return
      const notFound = error instanceof ApiError && error.status === 404
      setState({ status: 'error', message: error instanceof ApiError ? error.message : 'Agent details could not be loaded.', notFound })
    })
    return () => { active = false }
  }, [agentId])

  return <div className="workspace-page agent-detail-page space-y-8"><Link to="/agents" className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to marketplace</Link>{state.status === 'loading' && <LoadingDetail label="Loading agent details" />}{state.status === 'error' && <DetailError title={state.notFound ? 'Agent not found' : 'Unable to load agent details'} message={state.message} />}{state.status === 'success' && <AgentDetails agent={state.data} />}</div>
}

function LoadingDetail({ label }: { label: string }) {
  return <div className="rounded-2xl border border-line bg-panel p-8" aria-label={label}><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={18} /> {label}…</div></div>
}

function DetailError({ title, message }: { title: string; message: string }) {
  return <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-6" role="alert"><p className="text-sm font-semibold text-rose-100">{title}</p><p className="mt-2 text-sm leading-6 text-rose-100/70">{message}</p><Link to="/agents" className="mt-5 inline-flex rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Return to marketplace</Link></div>
}

function AgentDetails({ agent }: { agent: AgentDetailDto }) {
  const statusTone = agent.status === 'active' ? 'success' : agent.status === 'suspended' ? 'danger' : 'neutral'
  const metadata = agent.metadata ?? {}
  const isSynthetic = metadata.synthetic === true
  return <>
     <section className="agent-detail-page__hero max-w-4xl"><div className="agent-detail-page__hero-top"><div className="flex items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-electric/10 text-electric"><Bot size={27} /></div><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Agent profile</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{agent.name}</h2><p className="mt-2 text-sm text-slate-500">External ID: <span className="text-slate-300">{agent.external_id}</span></p></div></div><div className="flex flex-wrap gap-2"><StatusPill tone={statusTone}>{statusLabels[agent.status]}</StatusPill><span className="inline-flex items-center rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-slate-300">{availabilityLabels[agent.availability]}</span>{isSynthetic && <span className="inline-flex items-center rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-200">Synthetic demo</span>}</div></div><p className="mt-6 max-w-3xl text-base leading-7 text-slate-400">{agent.description}</p><p className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80">Seeded profiles are demo representations of registered agents. This page reports stored metadata only; it does not execute work or connect you to a third-party agent.</p><Link to={`/jobs?agentId=${agent.id}`} className="mt-5 inline-flex rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-ivory hover:bg-forest">Select for Job</Link></section>
     <section className="agent-detail-page__grid grid gap-4 lg:grid-cols-2" aria-label="Agent fields"><DetailCard title="Capabilities and task fit"><Field label="Skills" value={<ChipList values={agent.skills} />} /><Field label="Task categories" value={<ChipList values={agent.task_categories} />} /><Field label="Supported output formats" value={<ChipList values={agent.supported_output_formats} />} /><Field label="Estimated completion" value={agent.estimated_completion_minutes === null ? 'Not provided' : `${agent.estimated_completion_minutes} minutes`} /></DetailCard><DetailCard title="Registry details"><Field label="Agent ID" value={agent.id} /><Field label="Endpoint URL" value={agent.endpoint_url ? <a href={agent.endpoint_url} className="inline-flex items-center gap-1 text-electric hover:text-white" target="_blank" rel="noreferrer">{agent.endpoint_url}<ExternalLink size={13} /></a> : 'Not provided'} /><Field label="Created at" value={formatDate(agent.created_at)} /><Field label="Capabilities (compatibility field)" value={agent.capabilities === undefined ? 'Not provided' : <ChipList values={agent.capabilities} />} /></DetailCard><DetailCard title="Demo performance stats"><RecordValue record={agent.demo_performance_stats} emptyLabel="No demo performance stats provided." /></DetailCard><DetailCard title="Metadata"><RecordValue record={metadata} emptyLabel="No metadata provided." /></DetailCard></section>
  </>
}

function DetailCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="agent-detail-page__card rounded-2xl border border-line bg-panel p-5 sm:p-6"><h3 className="text-base font-bold text-white">{title}</h3><div className="mt-5 space-y-4">{children}</div></section>
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-line pb-4 last:border-b-0 last:pb-0"><dt className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</dt><dd className="mt-2 text-sm leading-6 text-slate-300">{value}</dd></div>
}

function ChipList({ values }: { values: string[] }) {
  return values.length > 0 ? <div className="flex flex-wrap gap-2">{values.map((value) => <span key={value} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{value}</span>)}</div> : <span className="text-slate-500">None listed</span>
}

function RecordValue({ record, emptyLabel }: { record: Record<string, unknown>; emptyLabel: string }) {
  const entries = Object.entries(record)
  if (entries.length === 0) return <p className="text-sm text-slate-500">{emptyLabel}</p>
  return <dl className="space-y-3">{entries.map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"><dt className="text-sm text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="max-w-full text-right text-sm text-slate-300">{formatValue(value)}</dd></div>)}</dl>
}
