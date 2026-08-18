export default function MessagesLoading() {
  return (
    <div
      data-dashboard-width="wide"
      className="overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 lg:grid lg:h-[calc(100dvh-5rem)] lg:min-h-[640px] lg:grid-cols-[268px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)_260px]"
      role="status"
      aria-label="Loading messages"
    >
      <aside className="hidden border-r border-[#dfe7e2] bg-white lg:block">
        <div className="flex min-h-[60px] items-center border-b border-[#dfe7e2] px-4">
          <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-3 p-4">
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
        <div className="flex min-h-[60px] items-center gap-3 border-b border-[#dfe7e2] px-4 sm:px-6">
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-56 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
        <div className="flex-1 bg-white" />
        <div className="border-t border-[#dfe7e2] px-4 py-3 sm:px-6 sm:py-4">
          <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </section>
      <aside className="hidden border-l border-[#dfe7e2] bg-[#fcfdfc] xl:block">
        <div className="flex min-h-[60px] items-center border-b border-[#dfe7e2] px-5">
          <div className="h-3 w-28 animate-pulse rounded bg-slate-200" />
        </div>
        <div className="space-y-5 p-5">
          <div className="size-12 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
        </div>
      </aside>
      <span className="sr-only">Loading messages…</span>
    </div>
  );
}
