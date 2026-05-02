import type { ActionPlan } from "@/lib/types";

interface Props {
  plan: ActionPlan | null | undefined;
}

export function WhyItMattersPanel({ plan }: Props) {
  return (
    <section className="rounded-[2rem] border border-[var(--line)] bg-white/75 p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--clay)]">Why This Alert Matters</p>
      {plan ? (
        <>
          <p className="mt-4 leading-7 text-[var(--ink)]">{plan.rationale}</p>
          <div className="mt-5 grid gap-3">
            {plan.affected_people.map((person) => (
              <div key={person.member_id} className="rounded-2xl bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{person.name}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--tide)]">
                    {person.risk_level}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{person.reason}</p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-[var(--muted)]">The rationale will appear after a simulated alert is ingested.</p>
      )}
    </section>
  );
}

