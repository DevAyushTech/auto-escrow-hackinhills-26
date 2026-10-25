"use client";

import Link from "next/link";
import { AlertTriangle, Check, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { useFlow } from "@/context/FlowContext";

export const DEMO_STEPS = [
  { id: 1, label: "Discover", hint: "Choose a fit" },
  { id: 2, label: "Define", hint: "Create the job" },
  { id: 3, label: "Match", hint: "Compare results" },
  { id: 4, label: "Agree", hint: "Accept terms" },
  { id: 5, label: "Fund", hint: "Simulated ledger" },
  { id: 6, label: "Submit", hint: "Provide output" },
  { id: 7, label: "Verify", hint: "Run checks" },
  { id: 8, label: "Resolve", hint: "Release or dispute" },
  { id: 9, label: "Record", hint: "Review history" },
];

export function DemoShell({ currentStep, children }: { currentStep: number; children: React.ReactNode }) {
  const { sessionStatus, sessionError, resetDemoSession, startFreshDemoSession, sessionExpiresAt } = useFlow();

  const handleReset = async () => {
    if (!window.confirm("Reset only your synthetic demo sandbox? Its jobs, agreements, submissions, disputes, ledger records, and audit history will be removed.")) return;
    try {
      await resetDemoSession();
      window.location.href = "/demo";
    } catch {
      // The current page keeps its state and exposes the error banner from the provider.
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f8fc] text-[#142c4b]">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[#d9e6f1] pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#102d52] text-sm font-bold text-white">AE</Link>
            <div>
              <div className="text-sm font-bold tracking-[0.14em] text-[#102d52]">GUIDED PROTOTYPE</div>
              <div className="text-xs text-[#6a7c91]">Synthetic records · simulated escrow · no real funds</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bfe0d4] bg-[#f1fcf7] px-3 py-1.5 font-semibold text-[#277b61]"><ShieldCheck size={14} /> Session-scoped sandbox</span>
            <button type="button" onClick={handleReset} disabled={sessionStatus === "loading"} className="inline-flex items-center gap-1.5 rounded-full border border-[#cad9e7] bg-white px-3 py-1.5 font-semibold text-[#47627f] transition hover:border-[#83b8e0] disabled:cursor-wait disabled:opacity-60"><RotateCcw size={14} /> Reset sandbox</button>
          </div>
        </header>

        <section className="py-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#4b89b9]">Step {currentStep} of {DEMO_STEPS.length}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-[#102d52] md:text-4xl">A real workflow you can inspect.</h1>
            </div>
            {sessionExpiresAt && <p className="hidden text-right text-xs text-[#75879b] md:block">Sandbox expires<br /><span className="font-mono">{new Date(sessionExpiresAt).toLocaleString()}</span></p>}
          </div>
          <ol className="mt-7 grid grid-cols-3 gap-2 md:grid-cols-9">
            {DEMO_STEPS.map((step) => {
              const complete = step.id < currentStep;
              const active = step.id === currentStep;
              return <li key={step.id} className={`rounded-2xl border px-2 py-3 text-center ${complete ? "border-[#b7dfd0] bg-[#f0fbf6]" : active ? "border-[#89bbdf] bg-white shadow-sm" : "border-[#d9e6f1] bg-[#f9fbfd]"}`}>
                <div className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${complete ? "bg-[#2c9a76] text-white" : active ? "bg-[#2b82bd] text-white" : "bg-[#e5eef6] text-[#7d91a6]"}`}>{complete ? <Check size={13} /> : step.id}</div>
                <div className={`mt-2 text-[11px] font-bold ${active ? "text-[#1e5d88]" : "text-[#526b84]"}`}>{step.label}</div>
                <div className="mt-0.5 hidden text-[10px] text-[#8a9bad] lg:block">{step.hint}</div>
              </li>;
            })}
          </ol>
        </section>

        {sessionError && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#f2caca] bg-[#fff6f6] p-4 text-sm text-[#954e4e]"><AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><strong>Demo connection problem.</strong><p className="mt-1">{sessionError}</p><button type="button" onClick={() => void startFreshDemoSession()} className="mt-2 font-semibold underline">Start a fresh sandbox</button></div></div>}
        {sessionStatus === "loading" && <div className="mb-5 flex items-center gap-2 rounded-2xl border border-[#d5e4ef] bg-white p-3 text-xs text-[#58718c]"><Loader2 size={15} className="animate-spin" /> Saving the authoritative demo state…</div>}
        {children}
      </div>
    </main>
  );
}

export function DemoCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[1.75rem] border border-[#d7e5f0] bg-white p-5 shadow-[0_16px_40px_rgba(38,83,119,0.06)] md:p-7 ${className}`}>{children}</section>;
}

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warning" | "bad" }) {
  const classes = { neutral: "border-[#d8e5f0] bg-[#f7fafc] text-[#62778d]", good: "border-[#b9dfd0] bg-[#f0fbf6] text-[#277b61]", warning: "border-[#f1ddb2] bg-[#fff9eb] text-[#956b21]", bad: "border-[#f1caca] bg-[#fff5f5] text-[#a24e4e]" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${classes[tone]}`}>{label}</span>;
}
