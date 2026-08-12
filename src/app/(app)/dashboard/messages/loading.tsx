export default function MessagesLoading() {
  return (
    <div
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-navy/5 lg:grid lg:h-[calc(100vh-5rem)] lg:min-h-[640px] lg:grid-cols-[310px_minmax(0,1fr)]"
      role="status"
      aria-label="Loading messages"
    >
      <aside className="hidden border-r border-slate-200 bg-slate-50/70 p-5 lg:block">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-8 w-36 animate-pulse rounded-lg bg-slate-200" />
        <div className="mt-8 space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="flex min-h-[70vh] flex-col lg:min-h-0">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="h-11 w-11 animate-pulse rounded-full bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex-1 bg-[#f7faf8]" />
        <div className="border-t border-slate-200 p-4">
          <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      </section>
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}
