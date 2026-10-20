import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, CheckCircle2, CircleAlert, CircleDollarSign, Clock3, LoaderCircle, Search, ShieldAlert, Sparkles } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, type JobDetailDto, type MatchingCandidateDto, type MatchingResponseDto } from '../lib/api'

type MatchingPageState =
  | { status: 'loading' }
  | { status: 'success'; job: JobDetailDto; matching: MatchingResponseDto }
  | { status: 'error'; message: string }

function parseJobId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Matching results could not be loaded.'
}

function formatBudget(amount: string, currency: string): string {
  const numericAmount = Number(amount)
  return Number.isFinite(numericAmount)
    ? `${numericAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
    : `${amount} ${currency}`
}

function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1)
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium' })
}

export function MatchingPage() {
  const { jobId: jobIdParam } = useParams()
  const navigate = useNavigate()
  const jobId = parseJobId(jobIdParam)
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<MatchingPageState>(() => jobId === null ? { status: 'error', message: 'The job ID is invalid.' } : { status: 'loading' })
  const [selectingAgentId, setSelectingAgentId] = useState<number | null>(null)
  const [selectionError, setSelectionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (jobId === null) {
      setState({ status: 'error', message: 'The job ID is invalid.' })
      return () => { active = false }
    }
    setState({ status: 'loading' })
    setSelectionError(null)
    Promise.all([api.job(jobId), api.runMatching(jobId)]).then(([job, matching]) => {
      if (active) setState({ status: 'success', job, matching })
    }).catch((error: unknown) => {
      if (active) setState({ status: 'error', message: errorMessage(error) })
    })
    return () => { active = false }
  }, [jobId, reloadKey])

  const runAgain = () => setReloadKey((value) => value + 1)
  const backToJob = jobId === null ? '/jobs' : `/jobs/${jobId}`

  if (state.status === 'loading') {
    return <MatchingFrame jobId={jobId}><div className="rounded-3xl border border-line bg-panel p-8" aria-label="Loading matching results"><div className="flex items-center gap-3 text-sm text-slate-400"><LoaderCircle className="animate-spin text-electric" size={19} /> Running matching against eligible agents…</div><p className="mt-4 text-sm leading-6 text-slate-500">The result will be persisted with its run ID and scoring version.</p></div></MatchingFrame>
  }

  if (state.status === 'error') {
    return <MatchingFrame jobId={jobId}><div className="rounded-3xl border border-rose-300/25 bg-rose-300/5 p-7" role="alert"><p className="text-sm font-bold text-rose-100">Unable to load matching results</p><p className="mt-2 text-sm leading-6 text-rose-100/75">{state.message}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={runAgain} className="rounded-xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-ink hover:bg-white">Retry matching</button><Link to={backToJob} className="rounded-xl border border-rose-200/30 px-4 py-2.5 text-sm font-semibold text-rose-100 hover:bg-rose-200/10">Return to job</Link></div></div></MatchingFrame>
  }

  const { job, matching } = state
  const selectAgent = (agentId: number) => {
    if (jobId === null || selectingAgentId !== null) return
    setSelectingAgentId(agentId)
    setSelectionError(null)
    api.selectMatchingAgent(jobId, agentId, matching.metadata.run_id).then(() => {
      navigate(`/jobs/${jobId}?selected=1`)
    }).catch((error: unknown) => {
      setSelectingAgentId(null)
      setSelectionError(errorMessage(error))
    })
  }

  return <MatchingFrame jobId={job.id}>
    <section className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Matching run</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h2>
          <p className="mt-2 text-sm text-slate-500">{job.public_id} · Job #{job.id}</p>
        </div>
        <button type="button" onClick={runAgain} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/[0.05]"><Search size={16} /> Re-run matching</button>
      </div>
      <p className="mt-6 max-w-3xl whitespace-pre-wrap text-base leading-7 text-slate-400">{job.description}</p>
      <div className="mt-6 grid gap-3 rounded-2xl border border-line bg-ink/30 p-4 text-sm sm:grid-cols-3">
        <SummaryValue label="Category" value={job.task_category} />
        <SummaryValue label="Budget" value={formatBudget(job.budget, job.currency)} icon={<CircleDollarSign size={15} />} />
        <SummaryValue label="Deadline" value={formatDate(job.deadline)} icon={<Clock3 size={15} />} />
      </div>
    </section>

    <section className="rounded-3xl border border-electric/20 bg-electric/5 p-6 sm:p-8" aria-labelledby="scoring-heading">
      <div className="flex items-start gap-3"><Sparkles className="mt-0.5 shrink-0 text-electric" size={20} /><div><h2 id="scoring-heading" className="text-lg font-bold text-white">Scoring formula</h2><p className="mt-1 text-sm leading-6 text-slate-300">Each eligible agent is ranked out of 100 using these weighted signals.</p></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <FormulaItem label="Skills" value={matching.metadata.scoring_formula.skills} />
        <FormulaItem label="Category" value={matching.metadata.scoring_formula.category} />
        <FormulaItem label="Availability + deadline" value={matching.metadata.scoring_formula.availability_deadline} />
        <FormulaItem label="Budget" value={matching.metadata.scoring_formula.budget} />
      </div>
      <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100/80"><strong className="text-amber-100">Heuristic matching:</strong> scores are explainable ranking signals from the persisted matching run, not a guarantee of performance or delivery.</div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500"><span>Run ID: <strong className="font-semibold text-slate-300">{matching.metadata.run_id}</strong></span><span>Scoring version: <strong className="font-semibold text-slate-300">{matching.metadata.scoring_version}</strong></span></div>
    </section>

    {selectionError && <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 p-4" role="alert"><p className="text-sm text-rose-100">Agent selection failed: {selectionError}</p></div>}

    <section aria-labelledby="eligible-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Ranked results</p><h2 id="eligible-heading" className="mt-1 text-xl font-bold text-white">Eligible candidates</h2></div><span className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-semibold text-slate-300">{matching.candidates.length} candidates</span></div>
      {matching.candidates.length === 0 ? <EmptyCandidates /> : <div className="grid gap-5 xl:grid-cols-2">{matching.candidates.map((candidate, index) => <CandidateCard key={`${candidate.agent_id}-${index}`} candidate={candidate} formula={matching.metadata.scoring_formula} rank={index + 1} selecting={selectingAgentId !== null} onSelect={() => selectAgent(candidate.agent_id)} />)}</div>}
    </section>

    <section aria-labelledby="excluded-heading" className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 shrink-0 text-amber-200" size={20} /><div><h2 id="excluded-heading" className="text-lg font-bold text-white">Excluded agents</h2><p className="mt-1 text-sm leading-6 text-slate-400">Agents shown here were evaluated but are not eligible for this run.</p></div></div>
      {matching.excluded_agents.length === 0 ? <p className="mt-5 text-sm text-slate-500">No agents were excluded.</p> : <ul className="mt-5 grid gap-3 md:grid-cols-2">{matching.excluded_agents.map((agent) => <li key={agent.agent_id} className="rounded-2xl border border-line bg-ink/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{agent.agent_name}</p><p className="mt-1 text-xs text-slate-500">Agent #{agent.agent_id}{agent.agent_external_id ? ` · ${agent.agent_external_id}` : ''}</p></div><CircleAlert className="shrink-0 text-amber-200" size={17} /></div><ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-400">{agent.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}</ul></li>)}</ul>}
    </section>
  </MatchingFrame>
}

function MatchingFrame({ jobId, children }: { jobId: number | null; children: ReactNode }) {
  return <div className="mx-auto max-w-6xl space-y-8"><Link to={jobId === null ? '/jobs' : `/jobs/${jobId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-electric hover:text-white"><ArrowLeft size={16} /> Back to job</Link>{children}</div>
}

function SummaryValue({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">{label}</p><p className="mt-2 flex items-center gap-1.5 font-semibold text-slate-200">{icon}<span>{value}</span></p></div>
}

function FormulaItem({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-line bg-panel/70 p-4"><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-xl font-bold text-white">{value} points</p></div>
}

function CandidateCard({ candidate, formula, rank, selecting, onSelect }: { candidate: MatchingCandidateDto; formula: MatchingResponseDto['metadata']['scoring_formula']; rank: number; selecting: boolean; onSelect: () => void }) {
  const compatibility = [
    ['Skills', candidate.compatibility.skills, formula.skills],
    ['Category', candidate.compatibility.category, formula.category],
    ['Availability + deadline', candidate.compatibility.availability_deadline, formula.availability_deadline],
    ['Budget', candidate.compatibility.budget, formula.budget],
  ] as const
  return <article className="rounded-3xl border border-line bg-panel p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-600">Rank #{rank}</p><h3 className="mt-2 text-xl font-bold text-white">{candidate.agent_name}</h3><p className="mt-1 text-xs text-slate-500">Agent #{candidate.agent_id}{candidate.agent_external_id ? ` · ${candidate.agent_external_id}` : ''}</p></div><div className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-right"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Match score</p><p className="mt-1 text-2xl font-bold text-white">{formatScore(candidate.score)}<span className="ml-1 text-sm font-medium text-slate-400">/ 100</span></p></div></div><p className="mt-5 text-sm leading-6 text-slate-300">{candidate.explanation}</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{compatibility.map(([label, value, maximum]) => <div key={label} className="rounded-xl border border-line bg-ink/30 p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="text-slate-500">{label}</span><strong className="text-slate-200">{formatScore(value)} / {maximum}</strong></div><div className="mt-2 h-1.5 rounded-full bg-slate-800"><div className="h-1.5 rounded-full bg-electric" style={{ width: `${Math.min(100, Math.max(0, (value / maximum) * 100))}%` }} /></div></div>)}</div><div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2"><SkillList title="Matched skills" values={candidate.matched_skills} tone="good" /><SkillList title="Missing skills" values={candidate.missing_skills} tone="missing" /></div>{candidate.warnings.length > 0 && <div className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">Warnings</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-amber-100/80">{candidate.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div>}<button type="button" disabled={selecting} onClick={onSelect} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-ink hover:bg-[#5ee0d9] disabled:cursor-wait disabled:opacity-60">{selecting ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}{selecting ? 'Selecting agent…' : `Select ${candidate.agent_name}`}</button></article>
}

function SkillList({ title, values, tone }: { title: string; values: string[]; tone: 'good' | 'missing' }) {
  return <div><p className={`text-xs font-bold uppercase tracking-[0.14em] ${tone === 'good' ? 'text-accent' : 'text-amber-200'}`}>{title}</p>{values.length === 0 ? <p className="mt-2 text-sm text-slate-500">None</p> : <ul className="mt-2 flex flex-wrap gap-2">{values.map((value, index) => <li key={`${value}-${index}`} className="rounded-full border border-line bg-ink/30 px-2.5 py-1 text-xs text-slate-300">{value}</li>)}</ul>}</div>
}

function EmptyCandidates() {
  return <div className="rounded-3xl border border-dashed border-line bg-panel/60 p-8 text-center"><Search className="mx-auto text-slate-600" size={28} /><p className="mt-4 text-sm font-semibold text-white">No eligible candidates</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">No agent met the eligibility rules for this matching run. Review the excluded agents below for the recorded reasons.</p></div>
}
