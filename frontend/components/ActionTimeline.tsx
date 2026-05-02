import type { TimelineEntry } from "@/lib/types";

interface Props {
  entries: TimelineEntry[];
  onAcknowledge: (id: string) => void;
  busyId: string | null;
}

export function ActionTimeline({ entries, onAcknowledge, busyId }: Props) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--sage)]">Action Timeline</p>
          <h2 className="display-serif mt-2 text-3xl font-semibold">What GuardClaw did</h2>
        </div>
      </div>
      <div className="mt-6 space-y-4">
        {entries.length === 0 ? (
          <p className="text-[var(--muted)]">No timeline entries yet.</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="rounded-3xl border border-[var(--line)] bg-white/75 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--tide)]">{entry.kind.replaceAll("_", " ")}</p>
                  <h3 className="mt-1 font-semibold">{entry.title}</h3>
                </div>
                <time className="text-xs text-[var(--muted)]">{new Date(entry.created_at).toLocaleTimeString()}</time>
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{entry.detail}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {entry.acknowledged_at ? (
                  <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">
                    Acknowledged
                  </span>
                ) : entry.kind !== "acknowledgement" ? (
                  <button
                    className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busyId === entry.id}
                    onClick={() => onAcknowledge(entry.id)}
                  >
                    {busyId === entry.id ? "Acknowledging..." : "Acknowledge"}
                  </button>
                ) : null}
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">Demo</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

