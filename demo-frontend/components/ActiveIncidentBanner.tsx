import type { ActiveIncidentResponse } from "@/lib/types";

interface Props {
  active: ActiveIncidentResponse | null;
}

const severityStyles: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-900 border-emerald-200",
  moderate: "bg-sky-100 text-sky-900 border-sky-200",
  high: "bg-amber-100 text-amber-950 border-amber-200",
  extreme: "bg-rose-100 text-rose-950 border-rose-200"
};

export function ActiveIncidentBanner({ active }: Props) {
  const incident = active?.incident;
  if (!incident) {
    return (
      <section className="rounded-[2rem] border border-dashed border-[var(--line)] bg-white/60 p-7 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Active Incident</p>
        <h2 className="display-serif mt-3 text-3xl font-semibold">No active incident yet</h2>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Run the simulation to replay a public safety alert and generate the household action plan.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-7 shadow-soft backdrop-blur stagger-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--tide)]">Active Incident</p>
          <h2 className="display-serif mt-3 text-4xl font-semibold leading-tight">{incident.title}</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted)]">{incident.description}</p>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-sm font-bold capitalize ${
            severityStyles[incident.severity] ?? severityStyles.moderate
          }`}
        >
          {incident.severity}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <span className="rounded-full bg-white/70 px-3 py-1">{incident.location_label}</span>
        <span className="rounded-full bg-white/70 px-3 py-1">{incident.source_name}</span>
        <span className="rounded-full bg-white/70 px-3 py-1">
          {incident.is_live ? "Live source" : "Simulated replay"}
        </span>
      </div>
    </section>
  );
}

