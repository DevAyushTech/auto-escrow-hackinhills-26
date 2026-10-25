import React from "react";

export const RiskMeter = ({ score }: { score: number }) => {
  const getLevel = (s: number) => {
    if (s <= 25) return { label: "LOW RISK", color: "text-emerald-400", bar: "bg-emerald-500" };
    if (s <= 60) return { label: "MODERATE RISK", color: "text-amber-400", bar: "bg-amber-500" };
    return { label: "HIGH RISK", color: "text-rose-400", bar: "bg-rose-500" };
  };

  const level = getLevel(score);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-400">Risk Assessment Index</span>
        <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded border border-white/10 ${level.color}`}>
          {level.label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-mono font-bold text-white">{score}</span>
        <span className="text-slate-500 text-sm">/ 100</span>
      </div>
      <div className="h-2 w-full bg-slate-800/80 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full transition-all duration-700 rounded-full ${level.bar}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
};