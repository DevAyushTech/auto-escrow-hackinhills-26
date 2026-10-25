"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Filter, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { api, AgentSummary, ApiError } from "@/lib/api";
import { useFlow } from "@/context/FlowContext";
import { StatusPill } from "@/components/demo/DemoShell";

export default function AgentDirectory({ mode = "marketplace" }: { mode?: "marketplace" | "discover" }) {
  const { ensureDemoSession } = useFlow();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureDemoSession();
      const result = await api.listAgents(token);
      setAgents(result?.items ?? []);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.detail : "The agent registry could not be reached.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => agents.filter((agent) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [agent.name, agent.description, agent.external_id, ...agent.skills, ...agent.task_categories].join(" ").toLowerCase().includes(query);
    return matchesSearch && (availability === "all" || agent.availability === availability);
  }), [agents, availability, search]);

  return <main className="min-h-screen bg-[#f5f8fc] px-5 py-8 text-[#173653] md:px-10 md:py-12">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col justify-between gap-6 border-b border-[#d8e5f0] pb-8 lg:flex-row lg:items-end">
        <div><div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#4486b7]"><Sparkles size={15} /> {mode === "marketplace" ? "Synthetic agent directory" : "Capability discovery"}</div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#102d52]">{mode === "marketplace" ? "Find the right fit for the work." : "Discover agents from the real registry."}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#647990]">Browse fields returned by FastAPI. There are no fabricated ratings or activity counters here—only persisted agent capabilities and honest availability.</p></div>
        <Link href="/demo" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#102d52] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#102d52]/15">Open guided demo <ArrowRight size={16} /></Link>
      </div>
      <div className="mt-7 flex flex-col gap-3 md:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8ca0b3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, skill, category, or external ID" className="w-full rounded-2xl border border-[#d3e2ed] bg-white py-3.5 pl-11 pr-4 text-sm text-[#244a6f] outline-none focus:border-[#77afd2]" /></label><label className="flex items-center gap-2 rounded-2xl border border-[#d3e2ed] bg-white px-4 text-sm text-[#60778e]"><Filter size={15} /><select value={availability} onChange={(event) => setAvailability(event.target.value)} className="bg-transparent py-3 outline-none"><option value="all">All availability</option><option value="available">Available</option><option value="busy">Busy</option><option value="unavailable">Unavailable</option></select></label></div>
      {loading && <div className="mt-8 flex items-center gap-2 rounded-2xl border border-[#d5e4ef] bg-white p-5 text-sm text-[#607890]"><Loader2 size={17} className="animate-spin" /> Loading persisted agent records…</div>}
      {error && <div className="mt-8 rounded-2xl border border-[#f1caca] bg-[#fff6f6] p-5 text-sm text-[#9b4c4c]"><div>{error}</div><button onClick={() => void load()} className="mt-3 inline-flex items-center gap-2 font-bold underline"><Activity size={14} /> Retry</button></div>}
      {!loading && !error && filtered.length === 0 && <div className="mt-8 rounded-3xl border border-dashed border-[#bfd2e0] bg-white p-10 text-center"><div className="text-lg font-semibold text-[#315676]">No matching agents</div><p className="mt-2 text-sm text-[#71869b]">Try a different filter, or seed the synthetic agent records in the backend.</p></div>}
      {!loading && !error && filtered.length > 0 && <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{filtered.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div>}
    </div>
  </main>;
}

function AgentCard({ agent }: { agent: AgentSummary }) {
  const synthetic = agent.metadata.synthetic === true;
  return <article className="flex flex-col rounded-[1.75rem] border border-[#d6e5f0] bg-white p-6 shadow-[0_14px_36px_rgba(38,83,119,0.05)]"><div className="flex items-start justify-between gap-3"><div><div className="text-xl font-semibold text-[#234a70]">{agent.name}</div><div className="mt-1 font-mono text-[11px] text-[#8a9bad]">{agent.external_id}</div></div><StatusPill label={agent.availability} tone={agent.availability === "available" ? "good" : agent.availability === "busy" ? "warning" : "bad"} /></div><p className="mt-5 min-h-[72px] text-sm leading-6 text-[#687e94]">{agent.description}</p><div className="mt-5 flex flex-wrap gap-1.5">{agent.skills.map((skill) => <span key={skill} className="rounded-full bg-[#eaf4fb] px-2.5 py-1 text-[10px] font-bold text-[#3e779f]">{skill}</span>)}</div><div className="mt-6 grid grid-cols-2 gap-4 border-t border-[#e0ebf3] pt-4 text-xs"><div><div className="text-[#8b9bab]">Categories</div><div className="mt-1 text-[#4c708c]">{agent.task_categories.join(", ") || "Not listed"}</div></div><div><div className="text-[#8b9bab]">Formats</div><div className="mt-1 text-[#4c708c]">{agent.supported_output_formats.join(", ") || "Not listed"}</div></div></div><div className="mt-4 flex items-center gap-2 text-xs text-[#607991]"><ShieldCheck size={14} className="text-[#2d8b72]" /> {synthetic ? "Synthetic demo profile" : "Registry profile"}</div><Link href={`/demo?agent=${agent.id}`} className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-[#b8d1e3] px-4 py-2.5 text-xs font-bold text-[#2e6992] transition hover:bg-[#eff7fc]">Use in guided demo <ArrowRight size={14} /></Link></article>;
}
