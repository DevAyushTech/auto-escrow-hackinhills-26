export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#030305] text-white">
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        <p className="text-xs font-mono tracking-widest uppercase text-zinc-400">Loading Secure Route...</p>
      </div>
    </div>
  );
}