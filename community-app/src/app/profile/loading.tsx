export default function ProfileLoading() {
  return (
    <div className="max-w-lg mx-auto w-full py-8 px-4 sm:px-6 animate-pulse">
      <div className="h-5 w-32 rounded bg-zinc-800 mb-2" />
      <div className="h-3 w-80 rounded bg-zinc-800 mb-6" />

      <div className="glass rounded-2xl p-5 space-y-5">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-zinc-800" />
          <div className="h-8 w-28 rounded-lg bg-zinc-800" />
        </div>
        <div className="h-10 w-full rounded-lg bg-zinc-800" />
        <div className="h-9 w-32 rounded-lg bg-zinc-800" />
      </div>
    </div>
  )
}
