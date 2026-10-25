"use client";

import React from "react";
import { FlowStepper } from "@/components/ui/FlowStepper";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#0b0c10]">
      {/* Global interactive stepper overlay */}
      <FlowStepper />
      
      {/* Page Content */}
      {children}
    </div>
  );
}