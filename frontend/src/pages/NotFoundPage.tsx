import { ArrowLeft, CircleHelp } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

export function NotFoundPage() {
  const location = useLocation()

  return (
    <section className="mx-auto max-w-2xl py-10 text-center sm:py-16" aria-labelledby="not-found-heading">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-panel text-electric">
        <CircleHelp size={30} aria-hidden="true" />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-accent">Route not found</p>
      <h2 id="not-found-heading" className="mt-3 text-3xl font-bold tracking-tight text-white">This workspace path does not exist.</h2>
      <p className="mt-4 text-sm leading-6 text-slate-400">No page is registered for <code className="rounded bg-white/5 px-1.5 py-0.5 text-slate-300">{location.pathname}</code>. Return to a persisted workspace instead of continuing from an empty shell.</p>
      <Link to="/" className="action-primary mt-8"><ArrowLeft size={16} /> Back to dashboard</Link>
    </section>
  )
}
