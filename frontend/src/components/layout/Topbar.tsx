"use client";

import React from "react";
import Link from "next/link";
import { PlayCircle, Radio, RefreshCw } from "lucide-react";
import { useFlow } from "@/context/FlowContext";

export const Topbar = () => {
  const { activeTransaction, activeJobId, resetSimulation, sessionStatus, apiBaseUrl } = useFlow();

  return (
    <header className="h-16 border-b border-white/5 bg-[#090C14]/60 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-slate-400">Active Task:</span>
        <span className="text-xs font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-sky-300">
          {activeJobId ? `JOB-${activeJobId}` : "No persisted job"}
        </span>
        <span className="text-xs text-slate-400 hidden md:inline truncate max-w-sm">
          {activeJobId ? activeTransaction.task : "Open the guided demo to create a server-backed job."}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => {
            if (window.confirm("Clear this page's local demo context? Persisted server records are not deleted.")) resetSimulation();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-emerald-500/40 text-xs text-slate-300 hover:text-white transition-all bg-white/[0.02]"
          title="Clear local flow context"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span>Clear local context</span>
        </button>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${sessionStatus === "error" ? "bg-rose-500/10 border-rose-500/20 text-rose-300" : sessionStatus === "loading" ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : sessionStatus === "ready" ? "bg-sky-500/10 border-sky-500/20 text-sky-300" : "bg-white/[0.03] border-white/10 text-slate-400"}`} title={apiBaseUrl}>
          <Radio className="w-3.5 h-3.5" />
          <span className="font-semibold">{sessionStatus === "error" ? "API offline" : sessionStatus === "loading" ? "Connecting" : sessionStatus === "ready" ? "Demo-ready" : "Not connected"}</span>
        </div>

        <Link href="/demo" aria-label="Open guided demo" title="Open guided demo" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-slate-400 hover:text-white">
          <PlayCircle className="w-4 h-4" />
        </Link>

        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center font-bold text-xs text-black">
            MP
          </div>
          <span className="text-xs font-medium text-slate-300 hidden lg:inline">MasterProtocol</span>
        </div>
      </div>
    </header>
  );
};
