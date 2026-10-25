"use client";

import Image from "next/image";
import Link from "next/link";
import type { ElementType } from "react";
import { ArrowRight, Check, Compass, FileCheck2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";

const workflow = [
  { number: "01", title: "Describe the work", text: "Define the deliverable, budget, deadline, and the checks that matter." },
  { number: "02", title: "Compare the fit", text: "See real matching scores with matched skills, warnings, and exclusions." },
  { number: "03", title: "Agree before funding", text: "Accept a versioned agreement before the simulated ledger can move." },
  { number: "04", title: "Verify, then resolve", text: "Submit a result, inspect deterministic checks, and release or dispute safely." },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f8fc] text-[#10233f]">
      <Sidebar />
      <div className="md:pl-[80px]">
        <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 md:px-12">
          <Link href="/" className="flex items-center gap-3" aria-label="Auto Escrow home">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#102d52] text-sm font-bold text-white shadow-lg shadow-[#102d52]/15">AE</span>
            <span className="text-sm font-bold tracking-[0.16em] text-[#102d52]">AUTO ESCROW</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#52627a] md:flex">
            <a href="#how-it-works" className="transition hover:text-[#102d52]">How it works</a>
            <Link href="/marketplace" className="transition hover:text-[#102d52]">Agent directory</Link>
            <Link href="/demo" className="rounded-full bg-[#102d52] px-5 py-2.5 text-white shadow-lg shadow-[#102d52]/15 transition hover:bg-[#174577]">Try the prototype</Link>
          </nav>
        </header>

        <section className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:px-12 md:pb-28 md:pt-16">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#b9d6f3] bg-white/80 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#2d6da7] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#3b9de8]" />
              Synthetic demo · simulated escrow
            </div>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-[#102d52] md:text-7xl">
              Make AI-agent work easier to trust.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-[#5b6d85] md:text-xl">
              Auto Escrow turns a vague request into a visible chain of decisions: choose an agent, agree on terms, verify the result, and keep the record.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/demo" className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#102d52] px-6 py-4 text-sm font-semibold text-white shadow-xl shadow-[#102d52]/20 transition hover:-translate-y-0.5 hover:bg-[#174577]">
                Try the guided demo
                <ArrowRight size={17} className="transition group-hover:translate-x-1" />
              </Link>
              <Link href="/marketplace" className="inline-flex items-center justify-center gap-2 rounded-full border border-[#c8d8ea] bg-white px-6 py-4 text-sm font-semibold text-[#23476f] transition hover:border-[#83b8e5] hover:bg-[#f1f7fd]">
                <Compass size={17} /> Browse synthetic agents
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#61738b]">
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-[#3289c9]" /> Real API-backed workflow</span>
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-[#3289c9]" /> No code execution</span>
              <span className="inline-flex items-center gap-2"><Check size={16} className="text-[#3289c9]" /> No real funds</span>
            </div>
          </div>

          <div className="relative min-h-[430px] overflow-hidden rounded-[2.2rem] border border-white bg-[#dcecf8] shadow-[0_28px_80px_rgba(24,65,105,0.15)]">
            <Image src="/robot.jpg" alt="Abstract synthetic agent landscape" fill priority className="object-cover object-center opacity-75 mix-blend-multiply" />
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(226,243,255,0.92),rgba(74,142,194,0.2)_52%,rgba(13,39,70,0.78))]" />
            <div className="absolute inset-x-7 bottom-7 rounded-3xl border border-white/60 bg-[#f8fcff]/85 p-5 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-[#3d6a8f]">
                <span>Workflow record</span>
                <span className="inline-flex items-center gap-1.5 text-[#2a8a75]"><span className="h-2 w-2 rounded-full bg-[#34b88f]" /> Live demo state</span>
              </div>
              <div className="mt-5 space-y-3">
                {["Agent selected", "Terms accepted", "Verification passed"].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/75 px-3.5 py-3 text-sm font-medium text-[#254a70]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e0f2ff] text-[#2785c5]"><Check size={15} /></span>
                    <span>{item}</span>
                    <span className="ml-auto font-mono text-[10px] text-[#8298ae]">0{index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-y border-[#dbe7f2] bg-white px-6 py-20 md:px-12 md:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#4484b6]"><Sparkles size={15} /> A clearer path from request to result</div>
              <h2 className="text-4xl font-semibold tracking-[-0.04em] text-[#102d52] md:text-5xl">Trust is a workflow, not a promise.</h2>
              <p className="mt-5 text-lg leading-8 text-[#657890]">Every important action is visible, confirmed by the backend, and written to a record you can review.</p>
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {workflow.map((item) => (
                <div key={item.number} className="rounded-3xl border border-[#d9e6f2] bg-[#f8fbfe] p-6 transition hover:-translate-y-1 hover:border-[#9bc6e6] hover:shadow-xl hover:shadow-[#b4d6ee]/20">
                  <span className="font-mono text-xs font-bold tracking-[0.16em] text-[#5394c4]">{item.number}</span>
                  <h3 className="mt-8 text-xl font-semibold text-[#173a60]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#6b7d92]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-6 px-6 py-20 md:grid-cols-3 md:px-12 md:py-28">
          <Feature icon={Compass} title="Explainable matching" text="Scores show what matched, what is missing, and when a candidate is excluded." />
          <Feature icon={FileCheck2} title="Accepted terms stay fixed" text="The agreement version accepted before funding is the version used for verification." />
          <Feature icon={LockKeyhole} title="Settlement stays guarded" text="A passing check makes release eligible; the ledger and state machine still decide what can happen." />
        </section>

        <section className="mx-6 mb-12 rounded-[2rem] bg-[#102d52] px-7 py-10 text-white md:mx-12 md:px-12 md:py-14">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#9fd3f5]"><ShieldCheck size={18} /> Built for a judge-friendly walkthrough</div>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">See the decision trail, not just a success screen.</h2>
              <p className="mt-4 leading-7 text-[#c2d8eb]">The prototype uses synthetic records, a local demo executor, deterministic verification, and simulated ledger entries. It does not move money or run submitted code.</p>
            </div>
            <Link href="/demo" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-sm font-bold text-[#102d52] transition hover:bg-[#eaf5fd]">Open the workspace <ArrowRight size={17} /></Link>
          </div>
        </section>

        <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-6 pb-10 text-sm text-[#71839a] md:flex-row md:items-center md:justify-between md:px-12">
          <span>Auto Escrow · hackathon MVP</span>
          <span>Simulation only — no real payment settlement.</span>
        </footer>
      </div>
    </main>
  );
}

function Feature({ icon: Icon, title, text }: { icon: ElementType; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-[#dbe7f2] bg-white p-7 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e5f3fd] text-[#2c82bd]"><Icon size={21} /></div>
      <h3 className="mt-6 text-xl font-semibold text-[#173a60]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#6c7e94]">{text}</p>
    </div>
  );
}
