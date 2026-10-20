type StatusPillProps = {
  tone: 'success' | 'warning' | 'neutral' | 'danger'
  children: string
}

const toneClasses: Record<StatusPillProps['tone'], string> = {
  success: 'border-accent/30 bg-accent/10 text-accent',
  warning: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
  neutral: 'border-slate-400/20 bg-slate-400/10 text-slate-300',
  danger: 'border-rose-300/30 bg-rose-300/10 text-rose-200',
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  )
}
