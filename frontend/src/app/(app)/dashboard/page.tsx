"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { api, ApiError, DashboardMetrics, JobSummary } from "@/lib/api";
import { useFlow } from "@/context/FlowContext";
import { DemoCard, StatusPill } from "@/components/demo/DemoShell";

export default function DashboardPage() {
  const { ensureDemoSession } = useFlow();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const token = await ensureDemoSession();
      const [metricResponse, jobsResponse] = await Promise.all([api.getMetrics(token), api.listJobs(token)]);
      setMetrics(metricResponse); setJobs(jobsResponse?.items ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.detail : "The dashboard API could not be reached.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <main className="min-h-screen bg-[#f5f8fc] px-5 py-8 text-[#173653] md:px-10 md:py-12"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-5 border-b border-[#d8e5f0] pb-8 md:flex-row md:items-end"><div><div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4486b7]"><ShieldCheck size={15} /> Workspace overview</div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#102d52]">A dashboard built from persisted records.</h1><p className="mt-4 max-w-2xl leading-7 text-[#647990]">Counts and amounts below come from the API. If the backend is unavailable, the workspace says so instead of substituting fake activity.</p></div><div className="flex gap-3"><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-full border border-[#c9dbe9] bg-white px-4 py-3 text-sm font-bold text-[#496981]"><RefreshCw size={15} /> Refresh</button><Link href="/demo" className="inline-flex items-center gap-2 rounded-full bg-[#102d52] px-4 py-3 text-sm font-bold text-white">Open guided demo <ArrowRight size={15} /></Link></div></div>{loading && <div className="mt-8 flex items-center gap-2 rounded-2xl border border-[#d5e4ef] bg-white p-5 text-sm text-[#607890]"><Loader2 size={17} className="animate-spin" /> Loading persisted workspace data…</div>}{error && <div className="mt-8 rounded-2xl border border-[#f1caca] bg-[#fff6f6] p-5 text-sm text-[#9b4c4c]">{error}</div>}{!loading && !error && <><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{metrics && <><Metric label="Jobs" value={String(metrics.total_jobs)} detail={`${metrics.jobs_in_progress} in progress`} /><Metric label="Completed jobs" value={String(metrics.completed_jobs)} detail="Backend-confirmed state" /><Metric label="Open disputes" value={String(metrics.open_disputes)} detail="Settlement protection" /><Metric label="Simulated funded" value={`${metrics.total_simulated_escrow_funded} USD`} detail="Persisted ledger amount" /><Metric label="Simulated settled" value={`${metrics.total_simulated_escrow_settled} USD`} detail="Release or refund entries" /></>}</div><DemoCard className="mt-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[#234a70]">Recent jobs</h2><p className="mt-1 text-sm text-[#72869a]">Use the guided demo for the complete end-to-end workflow.</p></div><Link href="/demo" className="text-sm font-bold text-[#357aa7]">Create in demo <ArrowRight size={14} className="inline" /></Link></div><div className="mt-5 space-y-3">{jobs.map((job) => <div key={job.id} className="flex flex-col gap-3 rounded-2xl border border-[#e0ebf3] bg-[#fbfdff] p-4 md:flex-row md:items-center md:justify-between"><div><div className="font-semibold text-[#315675]">{job.title}</div><div className="mt-1 text-xs text-[#7b8ea1]">{job.public_id} · {job.budget} {job.currency}</div></div><div className="flex items-center gap-3"><StatusPill label={job.status} tone={job.status === "completed" ? "good" : job.status === "disputed" || job.status === "cancelled" ? "bad" : "neutral"} /><Link href={`/demo?job=${job.id}`} className="text-xs font-bold text-[#357aa7]">Inspect <ArrowRight size={13} className="inline" /></Link></div></div>)}{jobs.length === 0 && <div className="rounded-2xl border border-dashed border-[#bdd1e0] p-8 text-center text-sm text-[#71869b]">No jobs in this sandbox yet. Start the guided demo to create one.</div>}</div></DemoCard></>}</div></main>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-3xl border border-[#d7e5f0] bg-white p-5 shadow-sm"><div className="text-xs font-bold uppercase tracking-[0.13em] text-[#8698a8]">{label}</div><div className="mt-3 text-2xl font-semibold text-[#234a70]">{value}</div><div className="mt-1 text-xs text-[#71869b]">{detail}</div></div>; }
