type StatusPillProps = {
  tone: 'success' | 'warning' | 'neutral' | 'danger'
  children: string
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  success: 'border-accent/30 bg-accent/10 text-accent',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
  neutral: 'border-slate-400/30 bg-slate-100 text-slate-600',
  danger: 'border-rose-500/30 bg-rose-50 text-rose-700',
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`status-pill inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
