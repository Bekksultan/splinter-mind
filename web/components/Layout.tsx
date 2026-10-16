export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-card p-8 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] text-muted">{message}</p>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted">
      {children}
    </h2>
  );
}

export function PageHeader({
  kicker,
  title,
  actions,
}: {
  kicker?: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {kicker ? (
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            {kicker}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
