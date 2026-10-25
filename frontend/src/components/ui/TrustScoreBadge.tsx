import React from "react";
import { ShieldCheck } from "lucide-react";

export const TrustScoreBadge = ({ score }: { score: number }) => {
  const getColor = (val: number) => {
    if (val >= 90) return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
    if (val >= 80) return "text-cyan-400 border-cyan-500/30 bg-cyan-500/10";
    return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  };

  return (
    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${getColor(score)}`}>
      <ShieldCheck className="w-3.5 h-3.5" />
      <span>Trust Score {score.toFixed(1)}</span>
    </div>
  );
};