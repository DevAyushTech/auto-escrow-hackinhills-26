import React from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, className, glow = false, ...props }) => {
  return (
    <div
      className={cn(
        "rounded-2xl p-6 transition-all duration-300",
        glow ? "glass-panel-glow" : "glass-panel",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};