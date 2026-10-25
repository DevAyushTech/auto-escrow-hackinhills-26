"use client";

import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import { usePathname } from "next/navigation";

export function FlowStepper() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/demo" || pathname === "/settings") return null;
  return <div className="fixed left-1/2 top-4 z-40 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-[#cfe0ed] bg-white/90 px-4 py-2 text-xs font-semibold text-[#55718b] shadow-lg shadow-[#234a70]/10 backdrop-blur-xl md:flex"><CircleHelp size={14} className="text-[#3d8abd]" /><span>This workspace is a legacy view. The real end-to-end prototype lives in the guided demo.</span><Link href="/demo" className="inline-flex items-center gap-1 font-bold text-[#2d78a6] hover:text-[#174b70]">Open demo <ArrowRight size={13} /></Link></div>;
}
